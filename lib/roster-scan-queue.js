export const DEFAULT_ROSTER_SCAN_FILE_LIMIT=24;

export function rosterScanFileKey(file){
  if(!file||typeof file!=="object")return "";
  const name=String(file.name||"").trim().toLowerCase();
  const size=Number(file.size)||0;
  const lastModified=Number(file.lastModified)||0;
  const type=String(file.type||"").trim().toLowerCase();
  return `${name}|${size}|${lastModified}|${type}`;
}

export function appendRosterScanFiles(current,incoming,{limit=DEFAULT_ROSTER_SCAN_FILE_LIMIT}={}){
  const max=Math.max(1,Number(limit)||DEFAULT_ROSTER_SCAN_FILE_LIMIT);
  const files=Array.isArray(current)?current.filter(Boolean).slice(0,max):[];
  const seen=new Set(files.map(rosterScanFileKey).filter(Boolean));
  let added=0,duplicates=0,overflow=0,invalid=0;
  for(const file of Array.from(incoming||[])){
    if(!file||typeof file!=="object"){invalid++;continue}
    const type=String(file.type||"").toLowerCase(),name=String(file.name||"").toLowerCase();
    if(type&&!type.startsWith("image/")&&!/\.(png|jpe?g|webp)$/i.test(name)){invalid++;continue}
    const key=rosterScanFileKey(file);
    if(key&&seen.has(key)){duplicates++;continue}
    if(files.length>=max){overflow++;continue}
    files.push(file);if(key)seen.add(key);added++;
  }
  return {files,added,duplicates,overflow,invalid,limit:max};
}

export function removeRosterScanFile(files,index){
  const list=Array.isArray(files)?[...files]:[];
  const i=Number(index);
  if(Number.isInteger(i)&&i>=0&&i<list.length)list.splice(i,1);
  return list;
}
