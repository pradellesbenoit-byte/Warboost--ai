const SOURCE_RANK={
  confirmed_manual:100,
  confirmed_scan:100,
  owner_confirmed_scan:100,
  explicit_confirmation:100,
  lastwar_scan_confirmed:100,
  exclusive_weapon:70,
  hero_progression:65,
  confirmed_squad:60,
  squad:40,
  progression_snapshot:40,
  history_scan:40,
  history_snapshot:25,
  legacy:10,
  unknown:0
};

const META_KEYS=new Set(["updated_at","field_updated_at","field_source","source"]);

export function hasFreshnessValue(value){
  return value!==null&&value!==undefined&&value!==""&&!(Array.isArray(value)&&value.length===0);
}

function time(value){
  const parsed=Date.parse(String(value||""));
  return Number.isFinite(parsed)?parsed:0;
}

function rank(source){
  return SOURCE_RANK[String(source||"unknown").toLowerCase()]??0;
}

function fieldEvidence(record,path,{fallbackAt=null,fallbackSource="unknown"}={}){
  const fieldPath=String(path||"");
  const parts=fieldPath.split(".");
  const root=parts[0];
  let parent=null,nested=record;
  for(const part of parts){parent=nested;nested=nested?.[part]}
  const fieldUpdatedAt=record?.field_updated_at||{};
  const fieldSource=record?.field_source||{};
  const parentUpdatedAt=parent?.field_updated_at||{};
  const parentSource=parent?.field_source||{};
  const leaf=parts.at(-1);
  const at=fieldUpdatedAt[fieldPath]||
    parentUpdatedAt[leaf]||
    parentUpdatedAt[fieldPath]||
    (root!==fieldPath?fieldUpdatedAt[root]:null)||
    parent?.updated_at||
    record?.[`${fieldPath.replaceAll(".","_")}_updated_at`]||
    record?.updated_at||fallbackAt||null;
  const source=fieldSource[fieldPath]||
    parentSource[leaf]||
    parentSource[fieldPath]||
    (root!==fieldPath?fieldSource[root]:null)||
    parent?.source||
    record?.source||fallbackSource||"unknown";
  return {at:time(at),rank:rank(source),source,rawAt:at};
}

export function compareFieldEvidence(nextRecord,currentRecord,field,{
  nextFallbackAt=null,currentFallbackAt=null,nextFallbackSource="unknown",currentFallbackSource="unknown"
}={}){
  const next=fieldEvidence(nextRecord,field,{fallbackAt:nextFallbackAt,fallbackSource:nextFallbackSource});
  const current=fieldEvidence(currentRecord,field,{fallbackAt:currentFallbackAt,fallbackSource:currentFallbackSource});
  if(next.rank!==current.rank)return Math.sign(next.rank-current.rank);
  return Math.sign(next.at-current.at);
}

function clone(value){
  if(value===undefined)return undefined;
  if(typeof structuredClone==="function")return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function same(a,b){
  return JSON.stringify(a??null)===JSON.stringify(b??null);
}

function mergeNode(baseValue,nextValue,baseRecord,nextRecord,path,options,meta){
  if(nextValue===null||nextValue===undefined||nextValue==="")return clone(baseValue);
  const bothObjects=baseValue&&nextValue&&typeof baseValue==="object"&&typeof nextValue==="object"&&!Array.isArray(baseValue)&&!Array.isArray(nextValue);
  if(bothObjects){
    const out={...clone(baseValue)};
    for(const [key,value] of Object.entries(nextValue)){
      if(META_KEYS.has(key))continue;
      const childPath=path?`${path}.${key}`:key;
      out[key]=mergeNode(baseValue[key],value,baseRecord,nextRecord,childPath,options,meta);
    }
    return out;
  }
  if(!hasFreshnessValue(baseValue)||compareFieldEvidence(nextRecord,baseRecord,path,{
    nextFallbackAt:options.incomingFallbackAt,
    currentFallbackAt:options.baseFallbackAt,
    nextFallbackSource:options.incomingSource,
    currentFallbackSource:options.baseSource
  })>0){
    const evidence=fieldEvidence(nextRecord,path,{fallbackAt:options.incomingFallbackAt,fallbackSource:options.incomingSource});
    if(evidence.rawAt)meta.field_updated_at[path]=evidence.rawAt;
    if(evidence.source)meta.field_source[path]=evidence.source;
    return clone(nextValue);
  }
  const currentEvidence=fieldEvidence(baseRecord,path,{fallbackAt:options.baseFallbackAt,fallbackSource:options.baseSource});
  if(currentEvidence.rawAt&&!meta.field_updated_at[path])meta.field_updated_at[path]=currentEvidence.rawAt;
  if(currentEvidence.source&&!meta.field_source[path])meta.field_source[path]=currentEvidence.source;
  return clone(baseValue);
}

/**
 * Merge known record fields by confirmation provenance first, then by the
 * field's own timestamp. Generic profile-write timestamps never outrank an
 * explicitly confirmed scan/manual value.
 */
export function mergeFreshRecord(base={},incoming={},fields=[],options={}){
  const current=base&&typeof base==="object"?base:{};
  const next=incoming&&typeof incoming==="object"?incoming:{};
  const meta={
    field_updated_at:{...(current.field_updated_at||{})},
    field_source:{...(current.field_source||{})}
  };
  const out={...clone(current),...Object.fromEntries(Object.entries(next).filter(([key])=>!fields.includes(key)))};
  for(const field of fields){
    if(!hasFreshnessValue(next[field]))continue;
    out[field]=mergeNode(current[field],next[field],current,next,field,options,meta);
  }
  out.field_updated_at=meta.field_updated_at;
  out.field_source=meta.field_source;
  const latest=Math.max(time(current.updated_at),time(next.updated_at));
  if(latest)out.updated_at=new Date(latest).toISOString();
  else out.updated_at=current.updated_at||next.updated_at||null;
  return out;
}

/**
 * Attach a player-confirmed observation to every present leaf without marking
 * omitted/uncertain fields as current.
 */
export function stampConfirmedRecord(input,{at=new Date().toISOString(),source="confirmed_scan"}={}){
  if(!input||typeof input!=="object")return input;
  if(Array.isArray(input))return input.map(value=>stampConfirmedRecord(value,{at,source}));
  const out={...input},fieldUpdatedAt={...(input.field_updated_at||{})},fieldSource={...(input.field_source||{})};
  for(const [key,value] of Object.entries(input)){
    if(META_KEYS.has(key)||key.startsWith("field_")||/_at$|_source$/i.test(key))continue;
    if(value&&typeof value==="object"){
      out[key]=stampConfirmedRecord(value,{at,source});
    }else if(hasFreshnessValue(value)){
      fieldUpdatedAt[key]=at;
      fieldSource[key]=source;
    }
  }
  out.field_updated_at=fieldUpdatedAt;
  out.field_source=fieldSource;
  out.updated_at=at;
  out.source=source;
  return out;
}

export function freshnessSourceRank(source){return rank(source);}
export function freshnessTimestamp(value){return time(value);}