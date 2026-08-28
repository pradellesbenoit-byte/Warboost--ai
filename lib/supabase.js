function pick(...names){for(const name of names){const value=process.env[name];if(typeof value==="string"&&value.trim())return value.trim()}return ""}
const base=()=>pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"");
const key=()=>pick("SUPABASE_SERVICE_ROLE_KEY");
const publicKey=()=>pick("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEY","NEXT_PUBLIC_SUPABASE_ANON_KEY","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","VITE_SUPABASE_ANON_KEY");
export function configured(){return Boolean(base()&&key())}
export function userConfigured(){return Boolean(base()&&publicKey())}
async function parseResponse(r){const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}if(!r.ok)throw Object.assign(new Error(body?.message||`Supabase HTTP ${r.status}`),{status:r.status,body});return body}
async function sb(path,options={}){if(!configured())throw Object.assign(new Error("Supabase service role not configured"),{code:"SUPABASE_NOT_CONFIGURED"});const r=await fetch(`${base()}/rest/v1/${path}`,{...options,headers:{apikey:key(),authorization:`Bearer ${key()}`,"content-type":"application/json",...(options.headers||{})}});return parseResponse(r)}
async function sbUser(path,accessToken,options={}){if(!userConfigured())throw Object.assign(new Error("Supabase user access not configured"),{code:"SUPABASE_USER_NOT_CONFIGURED"});if(!accessToken)throw Object.assign(new Error("Connexion WarBoost requise"),{status:401,code:"AUTH_REQUIRED"});const r=await fetch(`${base()}/rest/v1/${path}`,{...options,headers:{apikey:publicKey(),authorization:`Bearer ${accessToken}`,"content-type":"application/json",...(options.headers||{})}});return parseResponse(r)}
export async function getProfile(playerId){const rows=await sb(`wb1_profiles?player_id=eq.${encodeURIComponent(playerId)}&select=state,updated_at&limit=1`);return rows?.[0]||null}
export async function upsertProfile(playerId,state){const rows=await sb("wb1_profiles?on_conflict=player_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({player_id:playerId,state,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function getProfileForUser(playerId,accessToken){const rows=await sbUser(`wb1_profiles?player_id=eq.${encodeURIComponent(playerId)}&select=state,updated_at&limit=1`,accessToken);return rows?.[0]||null}
export async function upsertProfileForUser(playerId,state,accessToken){const rows=await sbUser("wb1_profiles?on_conflict=player_id",accessToken,{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({player_id:playerId,state,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function findInvite(code){const rows=await sb(`wb1_alliances?invite_code=eq.${encodeURIComponent(code)}&select=id,tag,name,invite_code,owner_player_id&limit=1`);return rows?.[0]||null}
export async function ensureAlliance({tag,name,invite_code,owner_player_id}){const rows=await sb("wb1_alliances?on_conflict=invite_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({tag,name,invite_code,owner_player_id,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function joinAlliance({alliance_id,player_id,role="R1"}){const rows=await sb("wb1_alliance_members?on_conflict=alliance_id,player_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({alliance_id,player_id,role,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function listProfiles(limit=500){return await sb(`wb1_profiles?select=player_id,state,updated_at&limit=${Math.max(1,Math.min(1000,Number(limit)||500))}`)}
export async function insertSnapshot(playerId,state,source="warboost"){return await sb("wb1_snapshots",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({player_id:playerId,state,source,captured_at:new Date().toISOString()})})}
export async function insertSnapshotForUser(playerId,state,accessToken,source="warboost"){return await sbUser("wb1_snapshots",accessToken,{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({player_id:playerId,state,source,captured_at:new Date().toISOString()})})}
export async function listSnapshots(playerId,limit=80){const n=Math.max(1,Math.min(200,Number(limit)||80));return await sb(`wb1_snapshots?player_id=eq.${encodeURIComponent(playerId)}&select=state,source,captured_at&order=captured_at.desc&limit=${n}`)}
export async function listSnapshotsForUser(playerId,accessToken,limit=80){const n=Math.max(1,Math.min(200,Number(limit)||80));return await sbUser(`wb1_snapshots?player_id=eq.${encodeURIComponent(playerId)}&select=state,source,captured_at&order=captured_at.desc&limit=${n}`,accessToken)}
export async function getAllianceRoster(playerId){
  const memberships=await sb(`wb1_alliance_members?player_id=eq.${encodeURIComponent(playerId)}&select=alliance_id,role,updated_at&limit=1`);const membership=memberships?.[0];if(!membership)return null;
  const alliances=await sb(`wb1_alliances?id=eq.${encodeURIComponent(membership.alliance_id)}&select=id,tag,name,invite_code,owner_player_id,updated_at&limit=1`);const alliance=alliances?.[0];if(!alliance)return null;
  const members=await sb(`wb1_alliance_members?alliance_id=eq.${encodeURIComponent(alliance.id)}&select=player_id,role,updated_at&limit=200`);const ids=(members||[]).map(m=>m.player_id).filter(Boolean);let profiles=[];
  if(ids.length){const quoted=ids.map(id=>`"${String(id).replace(/"/g,"")}"`).join(",");profiles=await sb(`wb1_profiles?player_id=in.(${encodeURIComponent(quoted)})&select=player_id,state,updated_at&limit=200`).catch(()=>[])}
  const profileMap=new Map((profiles||[]).map(p=>[p.player_id,p]));const roster=(members||[]).map(m=>{const p=profileMap.get(m.player_id),s=p?.state||{};return {player_id:m.player_id,name:s.player?.name||"Player",hq_level:s.player?.hq_level??null,power_m:s.player?.power_m??null,role:m.role||s.player?.role||"R1",vs_points:s.vs?.personal_points??null,season_points:s.season?.personal_points??null,contribution:s.alliance?.contribution??null,last_active_at:s.player?.last_active_at||null,updated_at:p?.updated_at||m.updated_at||null}});
  return {alliance,membership,roster};
}

export async function getAllianceMembership(playerId){
  const rows=await sb(`wb1_alliance_members?player_id=eq.${encodeURIComponent(playerId)}&select=alliance_id,player_id,role,updated_at&limit=1`);
  return rows?.[0]||null;
}
export async function getAllianceById(allianceId){
  const rows=await sb(`wb1_alliances?id=eq.${encodeURIComponent(allianceId)}&select=id,tag,name,invite_code,owner_player_id,updated_at&limit=1`);
  return rows?.[0]||null;
}
export async function setAllianceMemberRole({alliance_id,player_id,role}){
  const rows=await sb(`wb1_alliance_members?alliance_id=eq.${encodeURIComponent(alliance_id)}&player_id=eq.${encodeURIComponent(player_id)}`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({role,updated_at:new Date().toISOString()})
  });
  return rows?.[0]||null;
}
