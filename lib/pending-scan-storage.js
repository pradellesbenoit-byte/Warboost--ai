const DB_NAME="warboost-pending-scans-v1";
const DB_VERSION=1;
const STORE="pending";
const SINGLE_TTL_MS=48*60*60*1000;
const ROSTER_TTL_MS=48*60*60*1000;
const ROSTER_MAX_BYTES=60*1024*1024;

function now(){return Date.now()}
function ownerKey(owner){const v=String(owner||"").trim();return v||"device:anonymous"}
function recordKey(owner,kind){return `${ownerKey(owner)}:${kind}`}
function supported(){return typeof indexedDB!=="undefined"}
function openDb(){
  return new Promise((resolve,reject)=>{
    if(!supported())return reject(new Error("indexeddb_unavailable"));
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"key"})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("indexeddb_open_failed"));
  });
}
async function runRequest(mode,operation){
  const db=await openDb();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);let req;
      try{req=operation(store)}catch(e){reject(e);return}
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error("indexeddb_request_failed"));
      tx.onabort=()=>reject(tx.error||new Error("indexeddb_tx_aborted"));
    });
  }finally{try{db.close()}catch{}}
}
const getRecord=key=>runRequest("readonly",store=>store.get(key)).then(v=>v||null);
const putRecord=record=>runRequest("readwrite",store=>store.put(record)).then(()=>true);
const deleteRecord=key=>runRequest("readwrite",store=>store.delete(key)).then(()=>true);

async function readFresh(owner,kind,ttl){
  try{
    const rec=await getRecord(recordKey(owner,kind));
    if(!rec)return null;
    const saved=Number(rec.saved_at_ms)||0;
    if(!saved||now()-saved>ttl){await deleteRecord(rec.key).catch(()=>{});return null}
    return rec;
  }catch{return null}
}

export async function savePendingSingleScan(owner,{scan_type="profile",image_data_url="",name="capture.jpg"}={}){
  const image=String(image_data_url||"");
  if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image))return false;
  try{return await putRecord({key:recordKey(owner,"single"),kind:"single",owner:ownerKey(owner),saved_at_ms:now(),scan_type:String(scan_type||"profile"),name:String(name||"capture.jpg").slice(0,180),image_data_url:image})}catch{return false}
}
export async function loadPendingSingleScan(owner,{ttlMs=SINGLE_TTL_MS}={}){
  const rec=await readFresh(owner,"single",ttlMs);if(!rec)return null;
  return {scan_type:rec.scan_type||"profile",name:rec.name||"capture.jpg",image_data_url:rec.image_data_url||"",saved_at_ms:rec.saved_at_ms||0};
}
export async function clearPendingSingleScan(owner){try{return await deleteRecord(recordKey(owner,"single"))}catch{return false}}

function restoreFile(item){
  const blob=item?.blob instanceof Blob?item.blob:new Blob([], {type:item?.type||"image/jpeg"});
  try{return new File([blob],String(item?.name||"capture.jpg"),{type:item?.type||blob.type||"image/jpeg",lastModified:Number(item?.last_modified)||now()})}
  catch{try{Object.defineProperty(blob,"name",{value:String(item?.name||"capture.jpg"),configurable:true});Object.defineProperty(blob,"lastModified",{value:Number(item?.last_modified)||now(),configurable:true})}catch{}return blob}
}
export async function savePendingRosterFiles(owner,files=[]){
  const list=Array.from(files||[]).filter(Boolean);let total=0;const items=[];
  for(const file of list){const size=Number(file?.size)||0;total+=size;if(total>ROSTER_MAX_BYTES)return false;items.push({name:String(file?.name||"capture.jpg").slice(0,180),type:String(file?.type||"image/jpeg"),size,last_modified:Number(file?.lastModified)||now(),blob:file})}
  try{return await putRecord({key:recordKey(owner,"roster"),kind:"roster",owner:ownerKey(owner),saved_at_ms:now(),items})}catch{return false}
}
export async function loadPendingRosterFiles(owner,{ttlMs=ROSTER_TTL_MS}={}){
  const rec=await readFresh(owner,"roster",ttlMs);if(!rec||!Array.isArray(rec.items))return [];
  return rec.items.map(restoreFile).filter(Boolean);
}
export async function clearPendingRosterFiles(owner){try{return await deleteRecord(recordKey(owner,"roster"))}catch{return false}}

export async function movePendingScans(fromOwner,toOwner){
  const from=ownerKey(fromOwner),to=ownerKey(toOwner);if(from===to)return true;
  try{
    const [single,roster]=await Promise.all([readFresh(from,"single",SINGLE_TTL_MS),readFresh(from,"roster",ROSTER_TTL_MS)]);
    if(single){single.key=recordKey(to,"single");single.owner=to;await putRecord(single);await deleteRecord(recordKey(from,"single")).catch(()=>{})}
    if(roster){roster.key=recordKey(to,"roster");roster.owner=to;await putRecord(roster);await deleteRecord(recordKey(from,"roster")).catch(()=>{})}
    return true;
  }catch{return false}
}

export function pendingScanStorageSupported(){return supported()}
