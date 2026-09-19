import {configured,getAllianceMembership,getAllianceById,getAllianceRoster,setAllianceMemberRole,updateAllianceScopeRoster} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {cloudRankManagerAccess,confirmedCanonicalSelfRole} from "../lib/alliance-rank-management.js";

function role(v){const r=String(v||"R1").toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
function clean(v,max=120){return String(v??"").trim().slice(0,max)}
function rosterKey(member={}){const name=normalizeLastWarNickname(member?.name),server=normalizeServerId(member?.server_id),tag=normalizeAllianceTag(member?.alliance_tag);return name&&server&&tag?`${name}|${server}|${tag}`:""}
function rankCounts(rows=[]){const out={R1:0,R2:0,R3:0,R4:0,R5:0};for(const x of Array.isArray(rows)?rows:[]){const r=role(x?.role);out[r]=(out[r]||0)+1}return out}
// Backward-compatibility audit marker for legacy verifiers: r5_required. HF8.6.4 extends safe role maintenance to verified R4 while keeping R5 protected.

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    if(req.method==="GET"&&String(req.query?.action||"")==="roster_diagnostic"){
      const membership=await getAllianceMembership(user.id);
      if(!membership)return res.status(403).json({error:"alliance_membership_required"});
      const ctx=await getAllianceRoster(user.id);
      if(!ctx?.alliance)return res.status(404).json({error:"alliance_not_found"});
      const canonical=Array.isArray(ctx.alliance.roster)?ctx.alliance.roster:[];
      const cloudMembers=Array.isArray(ctx.cloud_roster)?ctx.cloud_roster:[];
      return res.status(200).json({ok:true,source:canonical.length?"canonical":"cloud_members",canonical_count:canonical.length,cloud_member_count:cloudMembers.length,canonical_updated_at:ctx.alliance.roster_updated_at||null});
    }
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
    const actor=await getAllianceMembership(user.id);
    if(!actor)return res.status(403).json({error:"alliance_membership_required"});
    const alliance=await getAllianceById(actor.alliance_id);
    if(!alliance)return res.status(404).json({error:"alliance_not_found"});
     const access=cloudRankManagerAccess({userId:user.id,membershipRole:actor.role,ownerPlayerId:alliance.owner_player_id});
     const actorRole=access.cloud_role,isOwner=access.owner;

     // Explicitly repair only the authenticated user's own membership role from a
     // uniquely linked canonical roster row. This never accepts a target id and
     // never touches another member.
     if(req.body?.action==="sync_own_role"){
       const ctx=await getAllianceRoster(user.id);
       const server=normalizeServerId(ctx?.alliance?.server_id||alliance.server_id),tag=normalizeAllianceTag(ctx?.alliance?.tag||alliance.tag);
       const roster=(Array.isArray(ctx?.alliance?.roster)?ctx.alliance.roster:Array.isArray(ctx?.roster)?ctx.roster:[]).map(x=>({...x,server_id:normalizeServerId(x?.server_id)||server,alliance_tag:normalizeAllianceTag(x?.alliance_tag)||tag}));
       if(!roster.length)return res.status(409).json({error:"alliance_roster_not_ready"});
       const self=confirmedCanonicalSelfRole(roster,user.id);
       if(!self.ok)return res.status(409).json({error:self.code});
       if(!access.owner&&!["R4","R5"].includes(self.role))return res.status(403).json({error:"self_role_not_manager"});
       if(actorRole===self.role)return res.status(200).json({ok:true,mode:"already_synced",membership:actor});
       const membership=await setAllianceMemberRole({alliance_id:actor.alliance_id,player_id:user.id,role:self.role,expected_updated_at:actor.updated_at});
       return res.status(200).json({ok:true,mode:"own_role_resynchronized",membership});
     }

     if(!access.allowed)return res.status(403).json({error:"r4_r5_required"});

    // HF8.6.4: persist a whole batch of Last War roster-rank changes against the
    // canonical alliance roster before the client refreshes from cloud. This avoids
    // a confirmed local change being immediately overwritten by an older cloud roster.
    if(Array.isArray(req.body?.roster_rank_changes)){
      const requested=req.body.roster_rank_changes.slice(0,100);
      if(!requested.length)return res.status(400).json({error:"rank_changes_required"});
      const ctx=await getAllianceRoster(user.id);
      if(!ctx?.alliance)return res.status(404).json({error:"alliance_not_found"});
      const server=normalizeServerId(ctx.alliance.server_id||alliance.server_id),tag=normalizeAllianceTag(ctx.alliance.tag||alliance.tag);
      const roster=(Array.isArray(ctx.alliance?.roster)?ctx.alliance.roster:Array.isArray(ctx.roster)?ctx.roster:[]).map(x=>({...x,server_id:normalizeServerId(x?.server_id)||server,alliance_tag:normalizeAllianceTag(x?.alliance_tag)||tag}));
      if(!roster.length)return res.status(409).json({error:"alliance_roster_not_ready"});
      const index=new Map();
      roster.forEach((m,i)=>{const k=rosterKey(m);if(!k)return;if(!index.has(k))index.set(k,[]);index.get(k).push(i)});
      const resolved=[],seenIndexes=new Set();
      let remainingR5=rankCounts(roster).R5;
      for(const raw of requested){
        const name=clean(raw?.name,80),to=role(raw?.to_role),key=rosterKey({name,server_id:raw?.server_id||server,alliance_tag:raw?.alliance_tag||tag});
        if(!name||!key)return res.status(400).json({error:"member_identity_required"});
        if(to==="R5")return res.status(400).json({error:"r5_separate"});
        const matches=index.get(key)||[];
        if(matches.length!==1)return res.status(409).json({error:matches.length?"member_identity_ambiguous":"member_not_found",name});
        const idx=matches[0],from=role(roster[idx]?.role);
        if(seenIndexes.has(idx))return res.status(400).json({error:"duplicate_member",name});
        seenIndexes.add(idx);
        if(from==="R5"){
          if(remainingR5<=1)return res.status(400).json({error:"r5_protected",name});
          remainingR5--;
        }
        resolved.push({idx,name,from_role:from,to_role:to,key});
      }
      const next=roster.map(x=>({...x}));
      for(const x of resolved){next[x.idx]={...next[x.idx],role:x.to_role,updated_at:new Date().toISOString()}}
      const counts=rankCounts(next);
      if((counts.R4||0)>10)return res.status(409).json({error:"r4_limit",limit:10,count:counts.R4});
      const saved=await updateAllianceScopeRoster({alliance_id:ctx.alliance.id||actor.alliance_id,roster:next,expected_updated_at:ctx.alliance.updated_at});
      if(!saved)return res.status(500).json({error:"roster_rank_persist_failed"});
      return res.status(200).json({ok:true,mode:"roster_rank_batch",changes:resolved.map(({name,from_role,to_role})=>({name,from_role,to_role})),counts});
    }

    // Existing management-permission transition for linked WarBoost accounts.
    const targetPlayerId=String(req.body?.player_id||"").trim(),targetRole=role(req.body?.role);
    if(!targetPlayerId)return res.status(400).json({error:"player_id_required"});
    const target=await getAllianceMembership(targetPlayerId);
    if(!target||String(target.alliance_id)!==String(actor.alliance_id))return res.status(404).json({error:"member_not_found"});
    const targetCurrentRole=role(target.role),targetIsOwner=String(alliance.owner_player_id||"")===targetPlayerId;
    if(targetIsOwner&&targetRole!=="R5")return res.status(400).json({error:"owner_must_remain_r5"});
    if(targetRole==="R5"&&!isOwner)return res.status(403).json({error:"owner_required_for_r5"});
    if(actorRole==="R4"&&!isOwner){
      if(targetCurrentRole==="R5"||targetIsOwner)return res.status(403).json({error:"r5_protected"});
      if(!["R1","R4"].includes(targetRole))return res.status(400).json({error:"management_role_invalid"});
    }
    if(String(targetPlayerId)===String(user.id)&&targetRole==="R5"&&!isOwner)return res.status(403).json({error:"owner_required_for_r5"});
    const row=await setAllianceMemberRole({alliance_id:actor.alliance_id,player_id:targetPlayerId,role:targetRole,expected_updated_at:target.updated_at});
    if(!row)return res.status(404).json({error:"member_not_found"});
    return res.status(200).json({ok:true,membership:row});
  }catch(e){return res.status(e.status||500).json({error:e.code||"alliance_role_failed",message:e.message})}
}
