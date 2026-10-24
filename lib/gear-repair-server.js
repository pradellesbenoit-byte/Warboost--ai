// Server-only. No profile-wide save, recovery, roster or service-role fallback.
import {createHash,createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {canonicalHeroName} from "./heroes.js";
import {projectSquads} from "./squad-comparison-project.js";
import {equipmentRepairCandidates} from "./gear-repair-preview.js";
import {GEAR_REPAIR_CONTRACT,gearRepairReadiness} from "./gear-repair-contract.js";

const hash=value=>createHash("sha256").update("string:"+value).digest("hex");
export const equipmentValueHash=hash;
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const iso=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
// Preserve PostgreSQL microseconds; never compare version tokens via JS Date.
function revisionKey(value){
  const match=String(value||"").match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/);
  return match?match[1]+"."+String(match[2]||"").padEnd(6,"0"):value;
}
const sameRevision=(a,b)=>iso(a)&&iso(b)&&revisionKey(a)===revisionKey(b);
function observedPrefixCompatible(oldGear,newGear){
  if(typeof oldGear!=="string"||oldGear.length>512)return false;
  const old=oldGear.split("|"),complete=newGear.split("|");
  if(old.length<2||old.length>4||complete.length!==4)return false;
  if(!old.slice(0,-1).every(piece=>complete.includes(piece)))return false;
  const tail=old.at(-1),match=tail.match(/^slot=([0-3])(?:;|$)/);
  return Boolean(match&&complete[Number(match[1])].startsWith(tail)&&tail.length<complete[Number(match[1])].length);
}
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const exact=(object,keys)=>object&&typeof object==="object"&&!Array.isArray(object)&&
  Object.keys(object).every(key=>keys.includes(key));
const readyError={ok:false,code:"gear_repair_release_disabled",write_state:"not_attempted",readiness:gearRepairReadiness()};

function target(row,squad,slot){
  if(!row||!iso(row.updated_at)||!Array.isArray(row.squads))fail(409,"gear_repair_conflict");
  const matches=row.squads.filter(q=>Number(q?.id)===squad);
  if(matches.length!==1||!Array.isArray(matches[0].heroes)||matches[0].heroes.length!==5)fail(409,"gear_repair_conflict");
  const projected=projectSquads(row.squads).rows.find(q=>q.id===squad);
  if(projected?.ambiguous||projected?.categories?.composition?.[slot-1]?.confirmed!==true)
    fail(409,"gear_repair_identity");
  return {squad:matches[0],hero:matches[0].heroes[slot-1]};
}
function signed(payload,key){
  const data=Buffer.from(JSON.stringify(payload)).toString("base64url");
  return data+"."+createHmac("sha256",key).update(data).digest("base64url");
}
function verified(ticket,key){
  if(typeof ticket!=="string"||ticket.length>6000)fail(400,"gear_repair_ticket");
  const [data,sig,...rest]=ticket.split(".");
  if(rest.length||!data||!sig)fail(400,"gear_repair_ticket");
  const expected=createHmac("sha256",key).update(data).digest();
  let supplied;try{supplied=Buffer.from(sig,"base64url");}catch{fail(400,"gear_repair_ticket");}
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))fail(403,"gear_repair_ticket");
  try{return JSON.parse(Buffer.from(data,"base64url").toString("utf8"));}catch{fail(400,"gear_repair_ticket");}
}

export function createGearRepairHandler({requireUser,readForUser,rpc,consentVersion,
  enabled=false,signingKey=()=>"",now=()=>Date.now(),newId=randomUUID}){
  return async function gearRepairHandler(req,res){
    res.setHeader("Cache-Control","no-store");res.setHeader("Vary","Authorization");
    let attempted=false,operationId=null;
    try{
      const action=req.query?.action;
      const user=await requireUser(req),owner=String(user?.id||"");
      if(!owner)fail(401,"AUTH_INVALID");
      if(req.headers?.["x-warboost-beta-consent"]!==consentVersion)fail(428,"BETA_CONSENT_REQUIRED");
      const token=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
      if(!token)fail(401,"AUTH_REQUIRED");
      if(req.query?.player_id||req.query?.user_id||req.query?.restore||req.query?.identity)fail(400,"gear_repair_request");
      if(action==="gear_repair_status"){
        if(req.method!=="GET")fail(405,"method_not_allowed");
        if(!enabled)return res.status(200).json({ok:true,read_only:true,...gearRepairReadiness()});
      }else if(action==="gear_repair_receipt"){
        if(req.method!=="GET")fail(405,"method_not_allowed");
      }else if(!["gear_repair_prepare","gear_repair_apply"].includes(action)||req.method!=="POST"){
        fail(405,"method_not_allowed");
      }
      // Receipt retrieval remains read-only even after the release gate closes.
      // SQL archive SELECT is owner-scoped; no capability or activation required.
      if(action==="gear_repair_receipt"){
        if(!uuid(req.query?.operation_id))fail(400,"gear_repair_request");
        const receipt=await rpc(token,"wb1_gear_repair_receipt",{p_id:req.query.operation_id});
        return res.status(200).json({ok:true,read_only:true,found:Boolean(receipt),
          ...(receipt?{operation_id:receipt.operation_id,revision:receipt.revision,write_state:"confirmed"}:{})});
      }
      // Gates checked BEFORE any writable RPC or profile read.
      if(!enabled)return res.status(423).json(readyError);
      const key=signingKey();
      if(typeof key!=="string"||key.length<32)return res.status(423).json(readyError);
      const capability=await rpc(token,"wb1_gear_repair_capability",{});
      if(capability?.contract!==GEAR_REPAIR_CONTRACT||capability?.enabled!==true)
        return res.status(503).json({ok:false,code:"gear_repair_migration_unverified",write_state:"not_attempted"});
      if(action==="gear_repair_status")return res.status(200).json({ok:true,read_only:true,
        contract:GEAR_REPAIR_CONTRACT,backend_prepared:true,release_approved:true,migration:"verified",writes_enabled:true});
      if(String(req.headers?.["content-type"]||"").split(";")[0]!=="application/json")fail(415,"unsupported_content_type");
      if(!req.body||Buffer.byteLength(JSON.stringify(req.body))>8192)fail(400,"gear_repair_request");
      if(action==="gear_repair_prepare"){
        const body=req.body;
        if(!exact(body,["mode","squad","slot","new_gear","rollback_of"])||
          !Number.isInteger(body.squad)||body.squad<1||body.squad>4||
          !Number.isInteger(body.slot)||body.slot<1||body.slot>5||!["repair","rollback"].includes(body.mode))
          fail(400,"gear_repair_request");
        const row=await readForUser(owner,token,{timeoutMs:6000});
        const selected=target(row,body.squad,body.slot),hero=canonicalHeroName(selected.hero.name);
        let proposed=body.new_gear,rollbackOf=null;
        if(body.mode==="rollback"){
          if(!uuid(body.rollback_of)||body.new_gear!==undefined)fail(400,"gear_repair_request");
          const archive=await rpc(token,"wb1_gear_repair_receipt",{p_id:body.rollback_of});
          if(!archive||archive.squad!==body.squad||archive.slot!==body.slot||
            canonicalHeroName(archive.hero)!==hero||!sameRevision(archive.revision,row.updated_at)||
            archive.new_hash!==hash(selected.hero.gear)||typeof archive.old_gear!=="string")
            fail(409,"gear_repair_conflict");
          proposed=archive.old_gear;rollbackOf=body.rollback_of;
        }else{
          if(body.rollback_of!==undefined||typeof proposed!=="string"||proposed.length>512)fail(400,"gear_repair_request");
          const local=structuredClone(row.squads);
          local.find(q=>Number(q.id)===body.squad).heroes[body.slot-1].gear=proposed;
          const candidate=equipmentRepairCandidates(projectSquads(local),projectSquads(row.squads))
            .find(item=>item.squad===body.squad&&item.slot===body.slot);
          if(!candidate?.eligible)fail(409,"gear_repair_candidate");
          // Require canonical, complete encoding; no valid-looking truncated rarity.
          const canonical=candidate.localPieces.map(p=>`slot=${p.slot};count=1;level=${p.level};rarity=${p.rarity}`).join("|");
          if(canonical!==proposed)fail(400,"gear_repair_candidate");
          if(!observedPrefixCompatible(selected.hero.gear,proposed))fail(409,"gear_repair_candidate");
        }
        if(typeof selected.hero.gear!=="string"||hash(selected.hero.gear)===hash(proposed))fail(409,"gear_repair_conflict");
        const command={mode:body.mode,operation_id:newId(),squad:body.squad,slot:body.slot,hero,
          expected_revision:row.updated_at,old_hash:hash(selected.hero.gear),new_hash:hash(proposed),
          new_gear:proposed,rollback_of:rollbackOf};
        const issued=now(),ticket=signed({owner,session_hash:hash("session:"+token),command,issued,expires:issued+300000},key);
        return res.status(200).json({ok:true,read_only:true,write_state:"not_attempted",ticket,
          operation_id:command.operation_id,expires_at:new Date(issued+300000).toISOString(),
          squad:command.squad,slot:command.slot,new_gear:proposed,requires_explicit_confirmation:true});
      }
      const body=req.body;
      if(!exact(body,["ticket","four_pieces_verified","rollback_confirmed","confirmed_at"])||
        !iso(body.confirmed_at))fail(400,"gear_repair_confirmation");
      const data=verified(body.ticket,key),time=now(),confirmed=Date.parse(body.confirmed_at);
      if(data.owner!==owner)fail(403,"gear_repair_owner");
      if(data.session_hash!==hash("session:"+token))fail(403,"gear_repair_owner");
      if(!data.command||data.expires<time||data.issued>time||confirmed<data.issued||confirmed>time+5000||confirmed<time-300000)
        fail(409,"gear_repair_expired");
      if(data.command.mode==="repair"&&body.four_pieces_verified!==true||
        data.command.mode==="rollback"&&body.rollback_confirmed!==true)fail(400,"gear_repair_confirmation");
      operationId=data.command.operation_id;attempted=true;
      // The SQL RPC independently enforces this mode-specific declaration.
      // This API ticket protects this transport, not direct owner-scoped SQL calls.
      const receipt=await rpc(token,"wb1_gear_repair_apply",{p_command:{...data.command,
        confirmed:true,attestation:data.command.mode==="repair"?
          "four_pieces_verified_in_last_war":"restore_archived_equipment",confirmed_at:body.confirmed_at}});
      // An RPC 200 alone is NOT success. Verify receipt and own-user readback.
      if(receipt?.operation_id!==operationId||receipt?.new_hash!==data.command.new_hash||!iso(receipt?.revision))
        fail(503,"gear_repair_outcome_unknown");
      let row;
      try{row=await readForUser(owner,token,{timeoutMs:6000});}
      catch{return res.status(202).json({ok:false,code:"gear_repair_verification_pending",operation_id:operationId,
        write_state:"confirmed",verified:false,retry_write:false});}
      let item;try{item=target(row,data.command.squad,data.command.slot);}catch{}
      if(!sameRevision(row?.updated_at,receipt.revision)||!item||canonicalHeroName(item.hero.name)!==data.command.hero||
        typeof item.hero.gear!=="string"||hash(item.hero.gear)!==receipt.new_hash)
        return res.status(202).json({ok:false,code:"gear_repair_verification_pending",operation_id:operationId,
          write_state:"confirmed",verified:false,retry_write:false});
      return res.status(200).json({ok:true,code:"gear_repair_confirmed",operation_id:operationId,
        revision:receipt.revision,write_state:"confirmed",verified:true,retry_write:false});
    }catch(error){
      const raw=String(error?.body?.message||error?.code||"");
      const conflict=/^gear_repair_(conflict|identity|candidate|expired|duplicate|schema|trigger)/.test(raw)||
        ["40001","40P01","55P03","23505"].includes(error?.body?.code);
      const forbidden=error?.status===403||error?.code==="database_permissions_missing"||error?.body?.code==="42501";
      const status=conflict?409:forbidden?403:error?.status===401?401:error?.status===428?428:
        error?.status===504||/timeout|abort/i.test(String(error?.code||error?.name))?504:
          [400,405,409,415,423].includes(error?.status)?error.status:503;
      const safe=new Set(["gear_repair_request","gear_repair_ticket","gear_repair_confirmation","gear_repair_owner",
        "gear_repair_expired","gear_repair_candidate","gear_repair_identity","gear_repair_conflict","method_not_allowed",
        "unsupported_content_type","AUTH_INVALID","AUTH_REQUIRED","BETA_CONSENT_REQUIRED"]);
      return res.status(status).json({ok:false,code:conflict?"gear_repair_conflict":forbidden?"gear_repair_forbidden":
        safe.has(raw)?raw:status===504?"gear_repair_timeout":"gear_repair_unavailable",
        write_state:attempted&&!conflict&&!forbidden?"unknown":"not_attempted",retry_write:false,...(operationId?{operation_id:operationId}:{})});
    }
  };
}
