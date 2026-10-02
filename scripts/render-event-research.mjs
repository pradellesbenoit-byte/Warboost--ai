import fs from "node:fs";
const {sources}=JSON.parse(fs.readFileSync("research/sources.json","utf8"));
const registry=new Map(sources.map(s=>[s.key,s]));
if(registry.size!==sources.length)throw Error("Duplicate source keys");
for(const source of sources){
  if(!source.url||!fs.existsSync(source.evidencePath))throw Error(`Missing saved evidence: ${source.key}`);
}
let draft=fs.readFileSync("research/report.draft.md","utf8");
const inventory=sources.map(s=>`| ${s.title.replaceAll("|","/")} | ${s.sourceKind} · ${s.access} | [@${s.key}] |`).join("\n");
draft=draft.replace("{{SOURCE_INVENTORY}}",inventory);
const order=[];
draft=draft.replace(/\[@([a-z0-9_-]+)\]/g,(_,key)=>{
  const s=registry.get(key);if(!s)throw Error(`Unknown citation: ${key}`);
  if(!order.includes(key))order.push(key);
  return `[[${order.indexOf(key)+1}]](${s.url})`;
});
draft=draft.replace("{{SOURCE_COUNT}}",String(order.length));
draft+="\n## Sources\n\n"+order.map((key,i)=>{
  const s=registry.get(key);
  return `${i+1}. [${s.title}](${s.url}) — Date publiée : ${s.publishedDate||"non indiquée"} ; Tier ${s.tier} ; ${s.sourceKind}, ${s.access}. Preuve locale : ${s.evidencePath}.`;
}).join("\n")+"\n";
if(/\[@|{{/.test(draft))throw Error("Unrendered markers");
fs.writeFileSync("research/last-war-event-strategy.md",draft);
console.log(`Report rendered: ${order.length} sources, all evidence paths checked.`);