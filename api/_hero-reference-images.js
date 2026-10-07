import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {HERO_REFERENCE_INDEX} from "../lib/hero-reference-index.js";

const root=new URL("../research/hero-references/",import.meta.url);
const sha=b=>createHash("sha256").update(b).digest("hex");
const empty=()=>({references:[],atlases:[],available:false});
// The caller cannot supply URLs, filenames, verification flags or trusted IDs.
// Fail closed as a whole: do not advertise a partially corrupted reference bank.
export async function loadHeroReferenceImages({read=readFile}={}){
  try{
    const manifest=JSON.parse(await read(new URL("manifest.json",root),"utf8"));
    const primaryCount=HERO_REFERENCE_INDEX.filter(ref=>ref.variant==="normal"&&ref.id.endsWith(".fandom")).length;
    const expectedAtlases=Math.ceil(primaryCount/16)+Math.ceil((HERO_REFERENCE_INDEX.length-primaryCount)/16);
    if(manifest.schemaVersion!==1||manifest.references?.length!==HERO_REFERENCE_INDEX.length||manifest.atlases?.length!==expectedAtlases)return empty();
    const references=[];
    for(const ref of manifest.references){
      const registered=HERO_REFERENCE_INDEX.find(x=>x.id===ref.id);
      if(!registered||ref.status!=="verified"||ref.verification!=="named_source_and_visual_review"||
        ref.canonicalName!==registered.canonicalName||ref.variant!==registered.variant||
        ref.sourcePage!==registered.sourcePage||!/^[a-z0-9.]+$/.test(ref.id)||
        !new RegExp(`^images/${ref.id.replaceAll(".","\\.")}\\.(png|jpg|webp)$`).test(ref.file)||ref.bytes>6000000)return empty();
      const bytes=await read(new URL(ref.file,root));
      if(bytes.length!==ref.bytes||sha(bytes)!==ref.sha256)return empty();
      references.push({...registered,sourceName:ref.sourceName});
    }
    if(new Set(references.map(r=>r.id)).size!==HERO_REFERENCE_INDEX.length)return empty();
    const atlases=[],attachedIds=[];
    for(const atlas of manifest.atlases){
      if(!/^atlases\/(primary|supplementary)-[1-9]\d*\.jpg$/.test(atlas.file)||atlas.bytes>3000000||
        !Array.isArray(atlas.referenceIds)||atlas.referenceIds.some(id=>!references.some(r=>r.id===id)))return empty();
      const bytes=await read(new URL(atlas.file,root));
      if(bytes.length!==atlas.bytes||sha(bytes)!==atlas.sha256)return empty();
      attachedIds.push(...atlas.referenceIds);
      atlases.push({id:atlas.id,referenceIds:atlas.referenceIds,imageUrl:`data:image/jpeg;base64,${bytes.toString("base64")}`});
    }
    if(attachedIds.length!==references.length||new Set(attachedIds).size!==references.length)return empty();
    return {references,atlases,available:true};
  }catch{return empty();}
}
export function heroReferenceRequestContent(bank){
  if(!bank?.available||!bank.atlases?.length)return [];
  return [
    {type:"input_text",text:`REFERENCE ATLAS ONLY — not a player capture. Match every roster hero equally; the number of supplementary images is not a weight. Never extract power, stars, levels, squad order or equipment from these references. Labels map reference IDs to canonical heroes: ${JSON.stringify(bank.references.map(r=>({id:r.id,name:r.displayName,canonical_name:r.canonicalName,variant:r.variant})))}`},
    ...bank.atlases.flatMap(a=>[
      {type:"input_text",text:`REFERENCE ATLAS ${a.id}; IDs: ${a.referenceIds.join(", ")}`},
      {type:"input_image",image_url:a.imageUrl,detail:"high"}
    ])
  ];
}
