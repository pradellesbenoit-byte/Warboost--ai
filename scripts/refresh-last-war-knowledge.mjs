import {readFile,writeFile,rename} from "node:fs/promises";
import {refreshKnowledgeSnapshot,KNOWLEDGE_REFRESH_MS} from "../server/_knowledge.js";
const path=new URL("../assets/last-war-knowledge.json",import.meta.url);
const snapshot=JSON.parse(await readFile(path,"utf8"));
if(Date.now()-Date.parse(snapshot.last_attempt_at||"1970-01-01")<KNOWLEDGE_REFRESH_MS){
  console.log("SKIP knowledge refresh: at most one operator check per 24 hours.");
}else{
  const result=await refreshKnowledgeSnapshot(snapshot),temp=new URL("../assets/last-war-knowledge.json.tmp",import.meta.url);
  await writeFile(temp,JSON.stringify(result,null,2)+"\n");await rename(temp,path);
  for(const source of result.sources)console.log(source.id,source.status,source.error||"");
  console.log("Knowledge revision:",result.revision,"; approved gameplay facts:",result.facts.filter(f=>f.evidence_verified).length);
}
