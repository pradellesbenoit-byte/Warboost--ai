import {normalizeSquadSlots,confirmedCompositionForSquad} from "./squad-identity.js";

function objectValue(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}
function arrayValue(v){return Array.isArray(v)?v:[]}
function clone(v){try{return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v))}catch{return v}}
function hasOwn(o,k){return Boolean(o&&Object.prototype.hasOwnProperty.call(o,k))}
function chooseArray(src,key,fallback=[]){return hasOwn(src,key)&&Array.isArray(src[key])?clone(src[key]):clone(Array.isArray(fallback)?fallback:[])}
function timestamp(v){const n=Date.parse(v||"");return Number.isFinite(n)?n:0}
function stringKeys(v){return [...new Set((Array.isArray(v)?v:[]).map(x=>String(x??"").trim()).filter(Boolean))]}

// Desert Storm is edited locally from a cumulative picker. A delayed cloud response
// must not replace a newer local selection (including an explicit, newer clear).
export function mergeDesertStormState(base={},incoming={}){
  const older=objectValue(base),remote=objectValue(incoming);
  const baseAt=timestamp(older.updated_at),remoteAt=timestamp(remote.updated_at);
  const remoteWins=remoteAt>0&&remoteAt>=baseAt;
  const winner=remoteWins?remote:older;
  const registered_keys=remoteWins?
    stringKeys(hasOwn(remote,"registered_keys")?remote.registered_keys:older.registered_keys):
    remoteAt===0&&baseAt===0?
      stringKeys([...stringKeys(older.registered_keys),...stringKeys(remote.registered_keys)]):
      stringKeys(older.registered_keys);
  return {...older,...remote,...winner,registered_keys,updated_at:winner.updated_at||older.updated_at||remote.updated_at||null};
}

export function hasMeaningfulCoreState(x){
  return Boolean(
    x?.player?.name||x?.player?.server_id||Number(x?.player?.hq_level)>0||Number(x?.player?.power_m)>0||
    arrayValue(x?.squads).some(sq=>Number(sq?.power)>0||arrayValue(sq?.heroes).some(h=>h?.name||h?.level||h?.stars||h?.exclusive||h?.gear))||
    Number(x?.drone?.level)>0||Number(x?.drone?.power_m)>0||x?.alliance?.tag||arrayValue(x?.alliance?.members).length||arrayValue(x?.activity_events).length
  )
}

// Structural hydration only: the server already owns normalization/canonicalization.
// This function never chooses an empty browser placeholder over a non-empty server state.
export function hydrateCloudState(remote,defaults,userId=''){
  const base=clone(objectValue(defaults)),src=clone(objectValue(remote));
  const out={...base,...src};
  out.player={...objectValue(base.player),...objectValue(src.player)};
  out.player_context={...objectValue(base.player_context),...objectValue(src.player_context)};
  out.drone={...objectValue(base.drone),...objectValue(src.drone)};
  out.technology={...objectValue(base.technology),...objectValue(src.technology)};
  out.season={...objectValue(base.season),...objectValue(src.season)};

  out.shop={...objectValue(base.shop),...objectValue(src.shop)};
  out.shop.offers=chooseArray(objectValue(src.shop),'offers',objectValue(base.shop).offers);
  out.shop.snapshots=chooseArray(objectValue(src.shop),'snapshots',objectValue(base.shop).snapshots);

  out.alliance={...objectValue(base.alliance),...objectValue(src.alliance)};
  out.alliance.members=chooseArray(objectValue(src.alliance),'members',objectValue(base.alliance).members);
  out.alliance.roster_review=chooseArray(objectValue(src.alliance),'roster_review',objectValue(base.alliance).roster_review);
  out.alliance.former_members=chooseArray(objectValue(src.alliance),'former_members',objectValue(base.alliance).former_members);
  out.alliance.unlinked_accounts=chooseArray(objectValue(src.alliance),'unlinked_accounts',objectValue(base.alliance).unlinked_accounts);
  out.alliance.desert_storm=mergeDesertStormState(objectValue(base.alliance).desert_storm,objectValue(src.alliance).desert_storm);

  out.vs={...objectValue(base.vs),...objectValue(src.vs)};
  out.vs.snapshots=chooseArray(objectValue(src.vs),'snapshots',objectValue(base.vs).snapshots);
  out.vs.leaderboard=chooseArray(objectValue(src.vs),'leaderboard',objectValue(base.vs).leaderboard);

  out.sync={...objectValue(base.sync),...objectValue(src.sync)};
  out.sync.sources={...objectValue(objectValue(base.sync).sources),...objectValue(objectValue(src.sync).sources)};
  out.sync.capabilities=chooseArray(objectValue(src.sync),'capabilities',objectValue(base.sync).capabilities);

  const remoteSquads=arrayValue(src.squads),baseSquads=arrayValue(base.squads);
  out.squads=Array.from({length:4},(_,i)=>{
    const b=objectValue(baseSquads[i]),r=objectValue(remoteSquads[i]),baseComposition=confirmedCompositionForSquad(b),remoteComposition=confirmedCompositionForSquad(r),sq={...b,...r,id:i+1,name:r.name||b.name||`Squad ${i+1}`,confirmed_composition:remoteComposition||baseComposition||[]};
    const remoteHeroes=arrayValue(r.heroes),baseHeroes=arrayValue(b.heroes);
    sq.heroes=Array.from({length:5},(_,j)=>({...objectValue(baseHeroes[j]),...objectValue(remoteHeroes[j])}));
    return normalizeSquadSlots(sq,i+1,{inferLegacy:false});
  });

  for(const key of ['activity_events','exclusive_weapons','hero_progression','hero_profiles','progression_snapshots'])out[key]=chooseArray(src,key,base[key]);
  out.player_id=String(userId||src.player_id||base.player_id||'');
  return out;
}


const DEFINITIVE_BETA_ACCESS_ERRORS=new Set(['BETA_INVITE_REQUIRED','BETA_INVITE_REVOKED','BETA_INVITE_EXPIRED']);

export function betaStateAfterVerifiedStateRead(previous={}, {ok=false,status=0,error='',consentVersion=''}={}){
  const prev=previous&&typeof previous==='object'?previous:{};
  const code=String(error||'').trim().toUpperCase();
  if(ok){
    return {...prev,release:true,enforced:true,configured:true,allowed:true,access_status:'accepted',consent_version:consentVersion||prev.consent_version||'',payments_enabled:false,pro_included:true};
  }
  if(Number(status)===403||DEFINITIVE_BETA_ACCESS_ERRORS.has(code)){
    const access_status=code==='BETA_INVITE_REVOKED'?'revoked':code==='BETA_INVITE_EXPIRED'?'expired':'invite-required';
    return {...prev,enforced:true,configured:true,allowed:false,access_status,payments_enabled:false};
  }
  // A timeout/5xx/network problem is not a revocation. Keep a previously verified invitation
  // so private data does not disappear simply because the status endpoint is temporarily unavailable.
  return {...prev,allowed:prev.allowed===true,access_status:prev.allowed===true?(prev.access_status||'accepted'):(code||'beta-status-error'),payments_enabled:false};
}

export function utf8ByteLength(value){
  const text=String(value??'');
  if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(text).byteLength;
  // Node/browser fallback for environments without TextEncoder.
  try{return unescape(encodeURIComponent(text)).length}catch{return text.length}
}

// The Fetch keepalive request-body quota is small on mobile browsers. Stay below it
// instead of letting an oversized player state throw TypeError during pagehide.
export function canUseKeepaliveBody(body,limitBytes=60*1024){return utf8ByteLength(body)<=Math.max(1024,Number(limitBytes)||60*1024)}
