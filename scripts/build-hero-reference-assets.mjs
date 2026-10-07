import {readFile,writeFile,mkdir,copyFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {HERO_DEFINITIONS,heroKey} from "../lib/heroes.js";
import {HERO_REFERENCE_INDEX} from "../lib/hero-reference-index.js";

// Offline asset preparation only; never run as a web/mobile build lifecycle hook.
const root=resolve("research/hero-references");
const digest=b=>createHash("sha256").update(b).digest("hex");
const importAt=process.argv.indexOf("--import-reviewed");
const appendAt=process.argv.indexOf("--append-reviewed");
let manifest;
if(importAt>=0||appendAt>=0){
  const candidates=JSON.parse(await readFile(process.argv[(appendAt>=0?appendAt:importAt)+1],"utf8"));
  manifest=appendAt>=0?JSON.parse(await readFile(join(root,"manifest.json"),"utf8")):null;
  const refs=manifest?[...manifest.references]:[];
  if(new Set(candidates.map(x=>x.id)).size!==candidates.length)throw Error("Duplicate reviewed candidate");
  for(const candidate of candidates){
    if(!HERO_REFERENCE_INDEX.some(x=>x.id===candidate.id))throw Error(`Unregistered reviewed source: ${candidate.id}`);
    if(appendAt>=0&&refs.some(x=>x.id===candidate.id))throw Error(`Refusing to replace existing reference: ${candidate.id}`);
  }
  await mkdir(join(root,"images"),{recursive:true});
  for(const entry of HERO_REFERENCE_INDEX.filter(x=>appendAt<0||candidates.some(c=>c.id===x.id))){
    const source=candidates.find(x=>x.id===entry.id&&!x.error);
    if(!source||source.name!==entry.canonicalName||source.variant!==entry.variant)throw Error(`Missing reviewed source: ${entry.id}`);
    if(entry.variant!=="normal"&&(!source.variant_evidence||!source.visual_change||!source.source_sha256||!source.crop))throw Error(`Missing variant proof: ${entry.id}`);
    if(!["png","jpg","webp"].includes(source.extension))throw Error("Raster images only");
    const bytes=await readFile(source.temporary_path);
    if(digest(bytes)!==source.sha256)throw Error(`Reviewed bytes changed: ${entry.id}`);
    const filename=`images/${entry.id}.${source.extension}`;
    await copyFile(source.temporary_path,join(root,filename));
    const dimensions=execFileSync("magick",["identify","-format","%w %h",join(root,filename)],{encoding:"utf8"}).trim().split(" ").map(Number);
    refs.push({...entry,sourceName:source.source_name,sourceImage:source.source_image,
      sourceLabel:source.source_label,sourceKind:source.source_kind,sourceEvidence:source.evidence,
      file:filename,sha256:source.sha256,bytes:bytes.length,width:dimensions[0],height:dimensions[1],
      verification:"named_source_and_visual_review",
      variantEvidence:source.variant_evidence||"Base portrait published in the named hero section; no claim about weapon level or promotion.",
      ...(entry.variant!=="normal"?{visualChange:source.visual_change,comparisonSource:source.comparison_source,
        sourceSha256:source.source_sha256,transformation:{type:"unaltered_rectangular_crop",...source.crop},
        imageRole:source.image_role||"hero_illustration"}:{}),
      rightsStatus:"not_licensed_by_this_manifest"});
  }
  const requested=[
    ...["Kimberly","DVA","Tesla"].map(name=>({name,variant:"awakening"})),
    ...["Mason","Violet","Scarlett","Sarah","Venom","Braz"].map(name=>({name,variant:"ssr_to_ur"})),
    ...["Kimberly","DVA","Tesla","Murphy","Carlie","Swift","Marshall","Skyler","McGregor","Lucius","Adam","Williams","Stetmann","Morrison","Fiona"]
      .map(name=>({name,variant:"exclusive_weapon",level:30}))
  ];
  manifest={...(manifest||{}),schemaVersion:1,reviewedAt:new Date().toISOString(),references:refs,
    unverifiedVariants:requested.filter(x=>!refs.some(ref=>ref.canonicalName===x.name&&ref.variant===x.variant)).map(x=>({...x,status:"unverified",file:null,
      reason:"No separately identified, attested changed portrait was recovered. Upgrade availability alone is not portrait evidence."})),
    sourceAudit:{...(manifest?.sourceAudit||{
      officialWebsite:"Five explicitly named hero images recovered.",
      officialWiki:"Public material about weapons found; no attested changed hero portrait extracted.",
      lastwarWiki:"Sixteen named base hero images recovered; remaining individual hero URLs did not provide portraits.",
      lastwarVault:"Named hero pages/season guides consulted; no usable named portrait images found. Restricted guide content was not accessed.",
      fandom:"Thirty-one named game thumbnails recovered from the public Heroes table; standard browser Referer is required by its image CDN.",
      excluded:"AI search illustrations and reinterpreted lastwar-guide.org portraits were rejected; none imported."
    }),...(refs.some(r=>r.variant!=="normal")?{
      cptHedgehogVariants:"Six named game screenshots visually reviewed; unaltered rectangular crops only. Awakening Kimberly/DVA/Tesla; UR promotion previews Sarah/Venom/Braz.",
      exclusiveWeaponScope:"Only the fifteen requested EW owners were researched. Vehicle upgrades are not hero-portrait evidence; none activated as EW30.",
      variantAudit:"docs/HERO_VARIANT_AUDIT.md"
    }:{})}};
}else manifest=JSON.parse(await readFile(join(root,"manifest.json"),"utf8"));
if(manifest.references.some(ref=>ref.variant!=="normal")){
  manifest.sourceAudit={...manifest.sourceAudit,
    cptHedgehogVariants:`${manifest.references.filter(ref=>ref.variant!=="normal").length} named game screenshot references visually reviewed; unaltered rectangular crops only. Exact identity/variant/source/crop proof retained per reference.`,
    exclusiveWeaponScope:"Only the fifteen requested EW owners were researched. Vehicle upgrades are not hero-portrait evidence; none activated as EW30.",
    variantAudit:"docs/HERO_VARIANT_AUDIT.md"};
}
const temp=await mkdtemp(join(tmpdir(),"warboost-hero-atlas-"));
try{
  const atlases=[];
  await mkdir(join(root,"atlases"),{recursive:true});
  // Every hero has the same primary-thumbnail slot; supplementary sources have
  // no weight or priority. No portraits are generated or retouched.
  const primary=manifest.references.filter(r=>r.variant==="normal"&&r.id.endsWith(".fandom"));
  const supplementary=manifest.references.filter(r=>!primary.includes(r));
  for(const [group,refs]of [["primary",primary],["supplementary",supplementary]]){
    for(let start=0;start<refs.length;start+=16){
      const chunk=refs.slice(start,start+16),tiles=[];
      for(const ref of chunk){
        const b=await readFile(join(root,ref.file));
        if(ref.status!=="verified"||digest(b)!==ref.sha256)throw Error(`Unverified reference ${ref.id}`);
        const tile=join(temp,`${ref.id}.png`),label=`${ref.displayName} | ${ref.variant}\n${ref.id}`;
        execFileSync("magick",[join(root,ref.file),"-auto-orient","-resize","180x180","-background","#172032","-gravity","center","-extent","200x190",
          "-fill","white","-font","DejaVu-Sans","-pointsize","11","-gravity","south","-background","#172032","-splice","0x35","-annotate","+0+8",label,tile]);
        tiles.push(tile);
      }
      const file=`atlases/${group}-${Math.floor(start/16)+1}.jpg`;
      execFileSync("magick",["montage",...tiles,"+set","label","-font","DejaVu-Sans","-tile","4x","-geometry","+0+0","-background","#172032","-quality","88",join(root,file)]);
      const bytes=await readFile(join(root,file));
      atlases.push({id:`${group}-${Math.floor(start/16)+1}`,file,sha256:digest(bytes),bytes:bytes.length,referenceIds:chunk.map(r=>r.id),
        transformation:"Aspect-preserving resize, letterbox and source-ID label only; originals retained unchanged."});
    }
  }
  manifest.atlases=atlases;
  await writeFile(join(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log(`PASS ${manifest.references.length} reviewed references, ${HERO_DEFINITIONS.length} heroes, ${atlases.length} private atlases`);
}finally{await rm(temp,{recursive:true,force:true});}
