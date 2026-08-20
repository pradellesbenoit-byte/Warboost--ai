const base=()=>String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const key=()=>String(process.env.SUPABASE_SERVICE_ROLE_KEY||"");
export function configured(){return Boolean(base()&&key())}
async function sb(path,options={}){
  if(!configured())throw Object.assign(new Error("Supabase non configuré"),{code:"SUPABASE_NOT_CONFIGURED"});
  const r=await fetch(`${base()}/rest/v1/${path}`,{...options,headers:{apikey:key(),authorization:`Bearer ${key()}`,"content-type":"application/json",...(options.headers||{})}});
  const text=await r.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!r.ok)throw Object.assign(new Error(body?.message||`Supabase HTTP ${r.status}`),{status:r.status,body});
  return body;
}
export async function getProfile(playerId){const rows=await sb(`wb1_profiles?player_id=eq.${encodeURIComponent(playerId)}&select=state,updated_at&limit=1`);return rows?.[0]||null}
export async function upsertProfile(playerId,state){const rows=await sb("wb1_profiles?on_conflict=player_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({player_id:playerId,state,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function findInvite(code){const rows=await sb(`wb1_alliances?invite_code=eq.${encodeURIComponent(code)}&select=id,tag,name,invite_code&limit=1`);return rows?.[0]||null}
export async function ensureAlliance({tag,name,invite_code,owner_player_id}){const rows=await sb("wb1_alliances?on_conflict=invite_code",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({tag,name,invite_code,owner_player_id,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function joinAlliance({alliance_id,player_id,role="R1"}){const rows=await sb("wb1_alliance_members?on_conflict=alliance_id,player_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({alliance_id,player_id,role,updated_at:new Date().toISOString()})});return rows?.[0]||null}
export async function listProfiles(limit=500){return await sb(`wb1_profiles?select=player_id,state,updated_at&limit=${Math.max(1,Math.min(1000,Number(limit)||500))}`)}

export async function insertSnapshot(playerId,state,source="warboost"){return await sb("wb1_snapshots",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({player_id:playerId,state,source,captured_at:new Date().toISOString()})})}
