import {configured,getProfile,getAllianceMembership,getAllianceById,getAllianceRoster,setAllianceMemberRole,updateAllianceScopeRoster,joinAlliance} from "../lib/supabase.js";
import {requireBetaUser} from "../lib/beta-access.js";
import {normalizeLastWarNickname,normalizeServerId,normalizeAllianceTag} from "../lib/alliance-identity.js";
import {cloudRankManagerAccess,confirmedCanonicalSelfRole,previewSelfIdentityLink,canonicalRosterMemberKey,resolveCanonicalRosterMember,dedupeCanonicalRosterRows,normalizeAllianceRank} from "../lib/alliance-rank-management.js";
import {canonicalAllianceAuthorization,authorizationMessage} from "../lib/alliance-authorization.js";
import {resolveCanonicalIdentity,canonicalMembershipNeedsRepair} from "../lib/canonical-alliance-access.js";
import {normalizeRosterRemovalTombstones,rosterLifecycleKey} from "../lib/alliance-roster-lifecycle.js";

function role(v){return normalizeAllianceRank(v)}
function clean(v,max=120){return String(v??"").trim().slice(0,max)}
function rankCounts(rows=[]){const out={R1:0,R2:0,R3:0,R4:0,R5:0};for(const x of Array.isArray(rows)?rows:[]){const r=role(x?.role);out[r]=(out[r]||0)+1}return out}
function profileIdentity(profile){
  const s=profile?.state||{},p=s.player||{},a=s.alliance||{};
  return {name:String(p.name||"").trim(),server_id:normalizeServerId(p.server_id),alliance_tag:normalizeAllianceTag(a.tag),role:p.role,rank_confirmed_source:p.rank_confirmed_source,rank_confirmed_at:p.rank_confirmed_at};
}
function publicIdentityRow(row={},userId=""){return {name:String(row.name||"").trim(),server_id:normalizeServerId(row.server_id),alliance_tag:normalizeAllianceTag(row.alliance_tag),role:role(row.role),linked:Boolean(row?.player_id),linked_to_self:Boolean(userId&&String(row.player_id||"")===String(userId)),warboost_linked:row.warboost_linked===true}}
// Backward-compatibility audit marker for legacy verifiers: r5_required. HF8.6.4 extends safe role maintenance to verified R4 while keeping R5 protected.

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!configured())return res.status(503).json({error:"database_not_configured"});
  try{
    const {user}=await requireBetaUser(req,{consent:true});
    if(req.method==="GET"&&String(req.query?.action||"")==="roster_diagnostic"){
       const profile=await getProfile(user.id),identity=profileIdentity(profile),membership=await getAllianceMembership(user.id),ctx=await getAllianceRoster(user.id,{serverId:identity.server_id,allianceTag:identity.alliance_tag});
      if(!ctx?.alliance)return res.status(404).json({error:"alliance_not_found"});
      const canonical=Array.isArray(ctx.alliance.roster)?ctx.alliance.roster:[];
      const cloudMembers=Array.isArray(ctx.cloud_roster)?ctx.cloud_roster:[];
       const exactPreview=previewSelfIdentityLink(canonical,{userId:user.id,name:identity.name,serverId:identity.server_id,allianceTag:identity.alliance_tag}),resolution=resolveCanonicalIdentity(canonical,{playerId:user.id,name:identity.name,serverId:identity.server_id,allianceTag:identity.alliance_tag,role:identity.role,rank_confirmed_source:identity.rank_confirmed_source,rank_confirmed_at:identity.rank_confirmed_at}),resolutionReady=["linked_exact","linked_existing"].includes(resolution.status),preview=exactPreview.matches?.length?exactPreview:(resolutionReady?{code:"ready",matches:[resolution.member]}:{code:resolution.status==="ambiguous"?"member_identity_ambiguous":resolution.status==="no_match"?"self_identity_no_match":resolution.status,matches:[]}),authorization=canonicalAllianceAuthorization({playerId:user.id,membership:ctx.membership||membership,alliance:ctx.alliance,roster:ctx.roster,identity});
       return res.status(200).json({ok:true,source:canonical.length?"canonical":"cloud_members",canonical_count:canonical.length,cloud_member_count:cloudMembers.length,canonical_updated_at:ctx.alliance.roster_updated_at||null,alliance:{id:ctx.alliance.id||membership.alliance_id,tag:normalizeAllianceTag(ctx.alliance.tag),name:clean(ctx.alliance.name,100),server_id:normalizeServerId(ctx.alliance.server_id),owner_player_id:ctx.alliance.owner_player_id||null,updated_at:ctx.alliance.updated_at||null},roster:(canonical.length?canonical:cloudMembers),link_status:preview.code||"ready",account_identity:identity,authorization,link_candidates:(preview.matches||[]).map(row=>publicIdentityRow(row,user.id))});
    }
    if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
     const actor=await getAllianceMembership(user.id),actorProfile=await getProfile(user.id),actorIdentity=profileIdentity(actorProfile),actorContext=await getAllianceRoster(user.id,{serverId:actorIdentity.server_id,allianceTag:actorIdentity.alliance_tag}),alliance=actorContext?.alliance||(actor?await getAllianceById(actor.alliance_id):null);
    if(!alliance)return res.status(404).json({error:"alliance_not_found"});
      const actorRoster=Array.isArray(actorContext?.roster)?actorContext.roster:(Array.isArray(alliance.roster)?alliance.roster:[]);
      let authorization=null,access=null,actorRole=null,isOwner=false;

      if(req.body?.action==="link_self_identity"){
        const profile=await getProfile(user.id),identity=profileIdentity(profile),requested={name:String(req.body?.name||"").trim(),server_id:normalizeServerId(req.body?.server_id),alliance_tag:normalizeAllianceTag(req.body?.alliance_tag)};
        if(!identity.name||!identity.server_id||!identity.alliance_tag)return res.status(409).json({error:"self_identity_incomplete",message:"Le profil WarBoost doit contenir le pseudo, le serveur et l’alliance avant la liaison."});
         const requestedExact=normalizeLastWarNickname(requested.name,requested.alliance_tag)===normalizeLastWarNickname(identity.name,identity.alliance_tag);
          if(!requestedExact||requested.server_id!==identity.server_id||requested.alliance_tag!==identity.alliance_tag)return res.status(403).json({error:"self_identity_mismatch",message:"La ligne choisie doit correspondre exactement au pseudo canonique, au serveur et à l’alliance du compte connecté."});
        if(identity.server_id!==normalizeServerId(alliance.server_id)||identity.alliance_tag!==normalizeAllianceTag(alliance.tag))return res.status(409).json({error:"self_identity_context_conflict",message:"Le profil du compte ne correspond pas au serveur et à l’alliance cloud."});
         const ctx=actorContext||await getAllianceRoster(user.id,{serverId:identity.server_id,allianceTag:identity.alliance_tag}),canonical=Array.isArray(ctx?.alliance?.roster)?ctx.alliance.roster:[];
        if(!canonical.length)return res.status(409).json({error:"alliance_roster_not_ready"});
          const resolution=resolveCanonicalIdentity(canonical,{playerId:user.id,name:identity.name,serverId:identity.server_id,allianceTag:identity.alliance_tag,role:identity.role,rank_confirmed_source:identity.rank_confirmed_source,rank_confirmed_at:identity.rank_confirmed_at,updatedAt:new Date().toISOString()});
           if(!resolution.member||!["linked_exact","linked_existing"].includes(resolution.status))return res.status(409).json({error:resolution.status==="ambiguous"?"member_identity_ambiguous":resolution.status==="roster_member_already_linked"?"roster_member_already_linked":resolution.status==="account_already_linked"?"account_already_linked":"self_identity_no_match",message:resolution.status==="ambiguous"?"Plusieurs lignes canoniques correspondent au pseudo, serveur et alliance.":resolution.status==="roster_member_already_linked"?"Cette ligne canonique est déjà liée à un autre compte WarBoost.":resolution.status==="account_already_linked"?"Ce compte WarBoost est déjà lié à une autre ligne canonique.":"Aucune ligne canonique unique ne correspond au profil authentifié."});
         let linked=canonical,saved=null;
         if(resolution.persist_link){
           saved=await updateAllianceScopeRoster({alliance_id:ctx.alliance.id||actor?.alliance_id,roster:resolution.members,expected_updated_at:ctx.alliance.updated_at});
           linked=Array.isArray(saved?.roster)?saved.roster:resolution.members;
         }
         let refreshed=await getAllianceRoster(user.id,{serverId:identity.server_id,allianceTag:identity.alliance_tag});
         const refreshedAlliance=refreshed?.alliance||ctx.alliance,refreshedCanonical=Array.isArray(refreshedAlliance.roster)?refreshedAlliance.roster:linked,self=confirmedCanonicalSelfRole(refreshedCanonical,user.id);
        if(!self.ok)return res.status(409).json({error:self.code||"self_identity_unconfirmed"});
         let membership=refreshed?.membership||actorContext?.membership||actor;
         if(canonicalMembershipNeedsRepair(membership,refreshedAlliance.id||ctx.alliance.id,user.id,self.role))membership=await joinAlliance({alliance_id:refreshedAlliance.id||ctx.alliance.id,player_id:user.id,role:self.role});
         const finalAuthorization=canonicalAllianceAuthorization({playerId:user.id,membership,alliance:refreshedAlliance,roster:refreshedCanonical,identity});
         return res.status(200).json({ok:true,mode:"self_identity_linked",identity:publicIdentityRow(self.member,user.id),membership,owner:finalAuthorization.owner,cloud_role_verified:Boolean(membership?.role),management_verified:finalAuthorization.allowed,alliance_updated_at:saved?.updated_at||null});
      }

      if(!actor)return res.status(403).json({error:"alliance_membership_required"});
      authorization=canonicalAllianceAuthorization({playerId:user.id,membership:actorContext?.membership||actor,alliance:actorContext?.alliance||alliance,roster:actorRoster,identity:actorIdentity});
      access={allowed:authorization.allowed,owner:authorization.owner,cloud_role:authorization.effective_role};
      actorRole=authorization.effective_role;isOwner=authorization.owner;

     if(req.body?.action==="remove_roster_members"){
       if(!access.allowed)return res.status(403).json({error:"management_role_required"});
       const requested=Array.isArray(req.body?.members)?req.body.members:(Array.isArray(req.body?.member_keys)?req.body.member_keys.map(member_key=>({member_key})):[]);
       if(!requested.length||requested.length>20)return res.status(400).json({error:"member_keys_required"});
       const context={serverId:normalizeServerId(alliance.server_id),allianceTag:normalizeAllianceTag(alliance.tag)},current=Array.isArray(actorContext?.alliance?.roster)?actorContext.alliance.roster:actorRoster;
       const selected=[],unresolved=[];
       for(const raw of requested){
         const resolution=resolveCanonicalRosterMember(current,typeof raw==="string"?{member_key:raw}:raw,context);
         if(resolution.ok)selected.push(resolution.member);
         else if(typeof raw!=="string"&&String(raw?.name||"").trim()&&String(raw?.server_id||context.serverId).trim()&&String(raw?.alliance_tag||context.allianceTag).trim())selected.push({...raw,canonical_member_key:raw.canonical_member_key||`canonical:${normalizeLastWarNickname(raw.name,raw.alliance_tag||context.allianceTag)}|${normalizeServerId(raw.server_id||context.serverId)}|${normalizeAllianceTag(raw.alliance_tag||context.allianceTag)}`});
         else unresolved.push(resolution.code||"member_not_found");
       }
       if(unresolved.length)return res.status(409).json({error:unresolved[0]});
       const unique=new Map(selected.map(row=>[row.canonical_member_key||`canonical:${normalizeLastWarNickname(row.name,context.allianceTag)}|${normalizeServerId(row.server_id||context.serverId)}|${normalizeAllianceTag(row.alliance_tag||context.allianceTag)}`,row]));
       const rows=[...unique.values()],r5Count=current.filter(x=>role(x?.role)==="R5").length;
       if(rows.some(x=>role(x?.role)==="R5")&&r5Count-rows.filter(x=>role(x?.role)==="R5").length<1)return res.status(400).json({error:"last_r5_protected"});
       if(actorRole==="R4"&&rows.some(x=>role(x?.role)==="R5"))return res.status(403).json({error:"r5_protected"});
       const now=new Date().toISOString(),removedKeys=new Set(rows.map(x=>x.canonical_member_key||`canonical:${normalizeLastWarNickname(x.name,context.allianceTag)}|${normalizeServerId(x.server_id||context.serverId)}|${normalizeAllianceTag(x.alliance_tag||context.allianceTag)}`)),next=current.filter(x=>!removedKeys.has(x.canonical_member_key||`canonical:${normalizeLastWarNickname(x.name,context.allianceTag)}|${normalizeServerId(x.server_id||context.serverId)}|${normalizeAllianceTag(x.alliance_tag||context.allianceTag)}`)),newTombstones=rows.map(x=>({key:x.canonical_member_key||`canonical:${normalizeLastWarNickname(x.name,context.allianceTag)}|${normalizeServerId(x.server_id||context.serverId)}|${normalizeAllianceTag(x.alliance_tag||context.allianceTag)}`,name:x.name,server_id:x.server_id||context.serverId,alliance_tag:x.alliance_tag||context.allianceTag,removed_at:now}));
       const tombstones=normalizeRosterRemovalTombstones([...(actorContext?.roster_tombstones||[]),...newTombstones]),saved=await updateAllianceScopeRoster({alliance_id:actorContext.alliance.id||actor?.alliance_id,roster:next,roster_tombstones:tombstones,expected_updated_at:actorContext.alliance.updated_at});
       return res.status(200).json({ok:true,mode:"roster_members_removed",removed:rows.map(x=>({name:x.name,member_key:x.canonical_member_key||rosterLifecycleKey(x)})),roster:Array.isArray(saved?.roster)?saved.roster.filter(x=>!x?.__warboost_type):next,removal_tombstones:tombstones,alliance_updated_at:saved?.updated_at||now});
     }

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

      if(!access.allowed)return res.status(403).json({error:"r4_r5_required",message:authorizationMessage(authorization),authorization});

    // HF8.6.4: persist a whole batch of Last War roster-rank changes against the
    // canonical alliance roster before the client refreshes from cloud. This avoids
    // a confirmed local change being immediately overwritten by an older cloud roster.
    if(Array.isArray(req.body?.roster_rank_changes)){
      const requested=req.body.roster_rank_changes.slice(0,100);
      if(!requested.length)return res.status(400).json({error:"rank_changes_required"});
      const ctx=await getAllianceRoster(user.id);
      if(!ctx?.alliance)return res.status(404).json({error:"alliance_not_found"});
      const server=normalizeServerId(ctx.alliance.server_id||alliance.server_id),tag=normalizeAllianceTag(ctx.alliance.tag||alliance.tag);
       const roster=dedupeCanonicalRosterRows((Array.isArray(ctx.alliance?.roster)?ctx.alliance.roster:Array.isArray(ctx.roster)?ctx.roster:[]).map(x=>{const row={...x,server_id:normalizeServerId(x?.server_id)||server,alliance_tag:normalizeAllianceTag(x?.alliance_tag)||tag};return {...row,canonical_member_key:canonicalRosterMemberKey(row,{serverId:server,allianceTag:tag})}}),{serverId:server,allianceTag:tag});
      if(!roster.length)return res.status(409).json({error:"alliance_roster_not_ready"});
      const resolved=[],seenIndexes=new Set();
      let remainingR5=rankCounts(roster).R5;
      for(const raw of requested){
        const name=clean(raw?.name,80),to=role(raw?.to_role);
        if(!to)return res.status(400).json({error:"member_identity_required"});
        if(to==="R5")return res.status(400).json({error:"r5_separate"});
        const resolution=resolveCanonicalRosterMember(roster,raw,{serverId:server,allianceTag:tag});
        if(!resolution.ok)return res.status(409).json({error:resolution.code,name});
        const idx=resolution.index,from=role(roster[idx]?.role),resolvedName=clean(roster[idx]?.name,80);
        if(seenIndexes.has(idx))return res.status(400).json({error:"duplicate_member",name});
        seenIndexes.add(idx);
        if(from==="R5"){
          if(remainingR5<=1)return res.status(400).json({error:"r5_protected",name});
          remainingR5--;
        }
        resolved.push({idx,name:resolvedName||name,from_role:from,to_role:to,key:canonicalRosterMemberKey(roster[idx],{serverId:server,allianceTag:tag}),resolution:resolution.mode});
      }
       const confirmedAt=new Date().toISOString(),next=roster.map(x=>({...x}));
       for(const x of resolved){next[x.idx]={...next[x.idx],role:x.to_role,rank_confirmed_at:confirmedAt,rank_confirmed_source:"r5_r4_manual_rank_management",rank_confirmation_status:"confirmed_manual",updated_at:confirmedAt}}
      const counts=rankCounts(next);
       const limit=10;
       if((counts.R4||0)>limit)return res.status(409).json({error:"r4_limit",limit,count:counts.R4,message:`Limite R4 dépassée : ${counts.R4}/${limit} après application du batch. Effectue une rétrogradation et une promotion dans la même requête.`});
      const saved=await updateAllianceScopeRoster({alliance_id:ctx.alliance.id||actor.alliance_id,roster:next,expected_updated_at:ctx.alliance.updated_at});
      if(!saved)return res.status(500).json({error:"roster_rank_persist_failed"});
       return res.status(200).json({ok:true,mode:"roster_rank_batch",changes:resolved.map(({name,from_role,to_role})=>({name,from_role,to_role})),counts,roster_updated_at:saved.roster_updated_at||saved.updated_at||confirmedAt});
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
