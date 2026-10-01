const CONFIRMED_HQ_SOURCES=new Set(["confirmed_scan","manual_profile"]);
const MAX_PLAYER_HQ_LEVEL=200;

function normalizeTimestamp(value){
  if(!value)return null;
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}

export function normalizePlayerHqLevel(value){
  if(value===null||value===undefined||value==="")return null;
  const level=Number(value);
  return Number.isInteger(level)&&level>=1&&level<=MAX_PLAYER_HQ_LEVEL?level:null;
}

export function normalizePlayerHqFields(player={}){
  const hq_level=normalizePlayerHqLevel(player?.hq_level);
  const source=CONFIRMED_HQ_SOURCES.has(String(player?.hq_level_source||""))?String(player.hq_level_source):null;
  const hq_level_confirmed_at=hq_level!==null&&source?normalizeTimestamp(player?.hq_level_confirmed_at):null;
  return {
    hq_level,
    hq_level_source:hq_level_confirmed_at?source:null,
    hq_level_confirmed_at
  };
}

export function confirmPlayerHq(player={},value,{source="confirmed_scan",confirmedAt=new Date().toISOString()}={}){
  const level=normalizePlayerHqLevel(value),current=normalizePlayerHqLevel(player?.hq_level),stamp=normalizeTimestamp(confirmedAt);
  if(level===null)return {accepted:false,reason:"invalid_level",player:{...player}};
  if(!CONFIRMED_HQ_SOURCES.has(source)||!stamp)return {accepted:false,reason:"invalid_confirmation",player:{...player}};
  if(source==="confirmed_scan"&&current!==null&&level<current)
    return {accepted:false,reason:"scan_decrease",player:{...player,...normalizePlayerHqFields(player)}};
  return {
    accepted:true,
    reason:null,
    player:{...player,hq_level:level,hq_level_source:source,hq_level_confirmed_at:stamp}
  };
}

function evidence(player={}){
  const fields=normalizePlayerHqFields(player);
  return {
    ...fields,
    confirmed:Boolean(fields.hq_level_source&&fields.hq_level_confirmed_at),
    at:fields.hq_level_confirmed_at?Date.parse(fields.hq_level_confirmed_at):0
  };
}

function sourcePriority(source){
  return source==="manual_profile"?2:source==="confirmed_scan"?1:0;
}

function fieldsFromEvidence(value){
  return {
    hq_level:value?.hq_level??null,
    hq_level_source:value?.hq_level_source||null,
    hq_level_confirmed_at:value?.hq_level_confirmed_at||null
  };
}

// HQ is an account-owned profile field, not an alliance-roster metric. Legacy
// values have no trustworthy field timestamp, so two legacy values merge upward;
// an explicit confirmation wins over an ambiguous legacy value, and two explicit
// confirmations are ordered by their own timestamps rather than the profile clock.
export function mergePlayerHqFields(basePlayer={},incomingPlayer={},{
  sameAccount=true
}={}){
  const base=evidence(basePlayer),incoming=evidence(incomingPlayer);
  if(!sameAccount)return fieldsFromEvidence(incoming);
  if(base.hq_level===null)return fieldsFromEvidence(incoming);
  if(incoming.hq_level===null)return fieldsFromEvidence(base);

  if(base.confirmed&&incoming.confirmed){
    if(base.at!==incoming.at)return fieldsFromEvidence(base.at>incoming.at?base:incoming);
    if(sourcePriority(base.hq_level_source)!==sourcePriority(incoming.hq_level_source))
      return fieldsFromEvidence(sourcePriority(base.hq_level_source)>sourcePriority(incoming.hq_level_source)?base:incoming);
    return fieldsFromEvidence(base);
  }
  if(base.confirmed!==incoming.confirmed)return fieldsFromEvidence(base.confirmed?base:incoming);
  if(base.hq_level!==incoming.hq_level)return fieldsFromEvidence(base.hq_level>incoming.hq_level?base:incoming);
  return fieldsFromEvidence(base);
}

export function playerHqNeedsCloudSync(localPlayer={},cloudPlayer={},{
  sameAccount=true
}={}){
  if(!sameAccount)return false;
  return JSON.stringify(mergePlayerHqFields(localPlayer,cloudPlayer,{sameAccount:true}))
    !==JSON.stringify(fieldsFromEvidence(evidence(cloudPlayer)));
}