export function normalizeResetGeneration(value){
  if(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0)return value;
  if(typeof value==="string"&&/^(?:0|[1-9]\d*)$/.test(value)){
    const parsed=Number(value);
    if(Number.isSafeInteger(parsed))return parsed;
  }
  return null;
}

export function resetGenerationDecision(storedValue,serverValue){
  const serverGeneration=normalizeResetGeneration(serverValue);
  if(serverGeneration===null)return {ok:false,reason:"generation_unavailable"};
  const storedGeneration=normalizeResetGeneration(storedValue);
  if(storedGeneration===null){
    return {ok:true,serverGeneration,action:serverGeneration===0?"allow_legacy":"invalidate_cache"};
  }
  if(storedGeneration>serverGeneration)return {ok:false,reason:"server_generation_rollback",
    storedGeneration,serverGeneration};
  if(storedGeneration<serverGeneration)return {ok:true,serverGeneration,action:"invalidate_cache",
    storedGeneration};
  return {ok:true,serverGeneration,action:"allow_cache",storedGeneration};
}

export function resetGenerationRequestMatches(requestValue,serverValue){
  const requested=normalizeResetGeneration(requestValue);
  const current=normalizeResetGeneration(serverValue);
  return requested!==null&&current!==null&&requested===current;
}

function parseStored(storage,key){
  const raw=storage.getItem(key);
  if(raw===null)return null;
  try{return JSON.parse(raw)}catch{return {__unreadable_cache:true,raw}}
}

function ownerOf(value){
  const state=value?.state&&typeof value.state==="object"?value.state:value;
  return String(state?.player_id||state?.user_id||"");
}

/**
 * Move only caches provably owned by this account out of active keys.
 * Unowned/ambiguous legacy data and all auth, consent, and preference keys stay untouched.
 */
export function quarantineOwnedAccountCaches(storage,{userId,serverGeneration,keys,extra=[],now=new Date().toISOString()}={}){
  const owner=String(userId||"").trim(),generation=normalizeResetGeneration(serverGeneration);
  if(!owner||generation===null||!storage||!keys)return {ok:false,reason:"invalid_quarantine_request",captured:0};
  const candidates=[keys.store,keys.backup,`${keys.accountPrefix||""}${owner}`,
    ...(Array.isArray(keys.legacy)?keys.legacy:[])].filter(Boolean);
  const entries=[];
  try{
    for(const key of [...new Set(candidates)]){
      const raw=storage.getItem(key);
      if(raw===null)continue;
      let parsed;
      try{parsed=JSON.parse(raw)}catch{continue}
      if(ownerOf(parsed)!==owner)continue;
      entries.push({key,value:parsed});
    }
    for(const item of Array.isArray(extra)?extra:[]){
      if(item?.key&&ownerOf(item.value)===owner&&!entries.some(entry=>entry.key===item.key))
        entries.push({key:String(item.key),value:item.value});
    }
    if(entries.length){
      const quarantineKey=`${keys.quarantinePrefix||"warboost_reset_quarantine:"}${encodeURIComponent(owner)}:${generation}`;
      const existingRaw=storage.getItem(quarantineKey);
      let existing=null;
      if(existingRaw){
        try{existing=JSON.parse(existingRaw)}catch{return {ok:false,reason:"quarantine_unreadable",captured:0}}
      }
      const previous=Array.isArray(existing?.entries)?existing.entries:[];
      const byKey=new Map(previous.map(entry=>[entry.key,entry]));
      for(const entry of entries)if(!byKey.has(entry.key))byKey.set(entry.key,entry);
      storage.setItem(quarantineKey,JSON.stringify({version:1,user_id:owner,reset_generation:generation,
        captured_at:existing?.captured_at||now,entries:[...byKey.values()]}));
      for(const entry of entries)storage.removeItem(entry.key);
    }
    return {ok:true,captured:entries.length};
  }catch{
    // If a recoverable copy cannot be written, leave all original caches intact and block sync.
    return {ok:false,reason:"quarantine_storage_failed",captured:0};
  }
}

/** Preserve an unowned/other-account active cache before a verified account replaces it. */
export function preserveForeignCacheBeforeReplace(storage,{key,userId,archiveKey="warboost_unowned_device_cache",now=new Date().toISOString()}={}){
  const activeKey=String(key||""),owner=String(userId||"").trim();
  if(!activeKey||!owner||!storage)return {ok:false,reason:"invalid_cache_archive_request"};
  try{
    const raw=storage.getItem(activeKey);
    if(raw===null)return {ok:true,archived:false};
    let parsed;
    try{parsed=JSON.parse(raw)}catch{return {ok:false,reason:"active_cache_unreadable"}}
    if(ownerOf(parsed)===owner)return {ok:true,archived:false};
    const previousRaw=storage.getItem(archiveKey);
    let archive={version:1,entries:[]};
    if(previousRaw!==null){
      try{archive=JSON.parse(previousRaw)}catch{return {ok:false,reason:"cache_archive_unreadable"}}
      if(!archive||archive.version!==1||!Array.isArray(archive.entries))return {ok:false,reason:"cache_archive_invalid"};
    }
    if(!archive.entries.some(entry=>entry.key===activeKey&&entry.raw===raw)){
      archive.entries.push({key:activeKey,owner_id:ownerOf(parsed)||null,preserved_at:now,raw});
      storage.setItem(archiveKey,JSON.stringify(archive));
    }
    return {ok:true,archived:true};
  }catch{return {ok:false,reason:"cache_archive_storage_failed"}}
}
