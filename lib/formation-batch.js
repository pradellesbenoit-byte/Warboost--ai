import {catalogHeroName} from "./heroes.js";
import {HERO_IDENTITY_THRESHOLDS,heroAppearanceContext,validIdentityConfidence,visibleHeroClass} from "./hero-recognition.js";
import {validatePortraitReference,portraitFeatureEligible} from "./portrait-diagnostics.js";
import {reconcileEquipmentZoom} from "./equipment-scan.js";

export const MAX_FORMATION_BATCH_LENGTH=3_600_000;
// Identity references supplied by the user; never defaults for extracted data.
export const KNOWN_EXCLUSIVE_WEAPONS=Object.freeze({
  Kimberly:"Ombre de Fusée",Murphy:"Guerrier Inflexible",Stetmann:"Chasseur EM",
  Williams:"Chasseur de tempête",Marshall:"Lame de Légion",DVA:"Lame de Frappe",
  Morrison:"La Faucheuse",Carlie:"Canaille",Lucius:"Chevalier du Ciel",
  Skyler:"Lame Magique",Tesla:"Expert en énergie magnétique",Adam:"Titan",
  McGregor:"Général Cuirassé"
});
const nullable=type=>({type:[type,"null"]});
const object=(properties,optional=false)=>({type:optional?["object","null"]:"object",
  properties,required:Object.keys(properties),additionalProperties:false});
const array=(items,extra={})=>({type:"array",items,...extra});
const stats=["hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"];
const portrait=object({candidate_name:nullable("string"),confidence:nullable("number"),
  variant:nullable("string"),reference_id:nullable("string"),visible_features:array({type:"string"},{maxItems:4})},true);
export const FORMATION_EQUIPMENT_SCHEMA=object({pieces:array(object({
  slot_index:{type:"integer",minimum:0,maximum:3},visible:nullable("boolean"),visibility_confidence:nullable("number"),
  level:nullable("number"),level_confidence:nullable("number"),
  level_evidence:{type:"string",enum:["visible_equipment_label","unreadable"]},
  rarity:nullable("string"),rarity_confidence:nullable("number"),
  rarity_evidence:{type:"string",enum:["visible_label","clear_quality_indicator","ambiguous","unreadable"]}
}),{maxItems:4})},true);
export const FORMATION_PORTRAIT_ZOOM_SCHEMA=object({
  formations:array(object({
    image_index:{type:"integer",minimum:0,maximum:5},
    portraits:array(object({slot_index:{type:"integer",minimum:0,maximum:4},portrait,
      equipment:FORMATION_EQUIPMENT_SCHEMA}),{minItems:5,maxItems:5})
  }),{minItems:1,maxItems:6})
});
const hero=object({name_text:nullable("string"),name_evidence:{type:"string",enum:["visible_text","visible_fragment","unreadable"]},
  name_confidence:nullable("number"),name_image_index:nullable("integer"),portrait,
  class_text:nullable("string"),class_evidence:{type:"string",enum:["visible_text","unreadable"]},class_confidence:nullable("number"),
  level:nullable("number"),level_confidence:nullable("number"),stars:nullable("number"),
  stars_confidence:nullable("number"),gear:nullable("string"),equipment:FORMATION_EQUIPMENT_SCHEMA});
const weapon=object({hero_name:nullable("string"),visible_title:nullable("string"),name_text:nullable("string"),
  name_evidence:{type:"string",enum:["visible_text","unreadable"]},name_confidence:nullable("number"),
  weapon_name:nullable("string"),level:nullable("number"),level_confidence:nullable("number"),
  ...Object.fromEntries(stats.map(key=>[key,nullable("number")])),
  field_confidence:object(Object.fromEntries(stats.map(key=>[key,nullable("number")])) )});
export const FORMATION_BATCH_SCHEMA=object({captures:array(object({
  details_layout:object({title_text:nullable("string"),title_confidence:nullable("number"),
    row_count:nullable("integer"),rows_confidence:nullable("number")},true),
  image_index:{type:"integer",minimum:0,maximum:5},
  screen_type:{type:"string",enum:["formation_details","formation_overview","exclusive_weapon_detail","hero_detail","unknown"]},
  squads:array(object({power:nullable("string"),power_confidence:nullable("number"),
    heroes:array(hero,{minItems:5,maxItems:5})}),{maxItems:1}),
  exclusive_weapons:array(weapon,{maxItems:1}),
  equipment_details:array(object({name_text:nullable("string"),
    name_evidence:{type:"string",enum:["visible_text","unreadable"]},name_confidence:nullable("number"),
    equipment:FORMATION_EQUIPMENT_SCHEMA}),{maxItems:1})
}),{minItems:1,maxItems:6})});

const PORTRAIT_ZOOM_ROW_TOPS=[.484,.548,.609,.670,.732];
const ZOOMABLE_FORMATION_ASPECT={min:.42,max:.48,minWidth:600,minHeight:1200};

// Produce one enlarged image per actual "Détails du héros" portrait row. The
// source image index and row number are carried separately; no slot is inferred
// from weapon captures, the six-tile strip, or saved composition.
async function createFormationRowZooms(imageDataUrl,imageIndex,equipment=false){
  // This module also supplies browser-side constants. Native image processing
  // must only load when the server actually executes a crop request.
  if(typeof process==="undefined"||!process.versions?.node)return [];
  const match=String(imageDataUrl||"").match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!match||!Number.isInteger(imageIndex)||imageIndex<0||imageIndex>5)return [];
  try{
    const {default:sharp}=await import("sharp");
    const bytes=Buffer.from(match[1].replace(/\s/g,""),"base64");
    const normalized=await sharp(bytes,{limitInputPixels:16_000_000}).rotate().png().toBuffer();
    const {width,height}=await sharp(normalized).metadata();
    const aspect=width/height;
    if(!width||!height||width<ZOOMABLE_FORMATION_ASPECT.minWidth||height<ZOOMABLE_FORMATION_ASPECT.minHeight||
      aspect<ZOOMABLE_FORMATION_ASPECT.min||aspect>ZOOMABLE_FORMATION_ASPECT.max)return [];
    const left=Math.round(width*(equipment ? .230 : .105));
    const cropWidth=Math.min(width-left,Math.round(width*(equipment ? .480 : .118)));
    const cropHeight=Math.round(height*.054);
    // The former blanket bottom-44% mask also removed visible noses, moustaches
    // and side hair. Mask only the Lv digits and star strip of this supported
    // layout. The intact class icon is context, never a hero identity by itself.
    const uiMask=Buffer.from(`<svg width="384" height="384"><rect x="104" y="234" width="212" height="58" fill="#141820"/><rect x="31" y="294" width="326" height="71" fill="#141820"/></svg>`);
    const output=[];
    for(let slotIndex=0;slotIndex<PORTRAIT_ZOOM_ROW_TOPS.length;slotIndex++){
      const top=Math.round(height*PORTRAIT_ZOOM_ROW_TOPS[slotIndex]);
      if(top+cropHeight>height||cropWidth<1||cropHeight<1)return [];
      const crop=await sharp(normalized).extract({left,top,width:cropWidth,height:cropHeight})
        .resize({width:equipment?1024:384,height:equipment?256:384,fit:"contain",background:{r:20,g:24,b:32}})
        .png().toBuffer();
      const maskedCrop=equipment?crop:await sharp(crop).composite([{input:uiMask,left:0,top:0}]).png().toBuffer();
      output.push({image_index:imageIndex,slot_index:slotIndex,
        image_url:`data:image/png;base64,${maskedCrop.toString("base64")}`});
    }
    return output;
  }catch{return []}
}

export async function createFormationPortraitZooms(imageDataUrl,imageIndex){
  return createFormationRowZooms(imageDataUrl,imageIndex);
}
export async function createFormationEquipmentZooms(imageDataUrl,imageIndex){
  return createFormationRowZooms(imageDataUrl,imageIndex,true);
}

// Subtype labels sometimes disagree with explicit layout OCR. Do NOT crop an
// arbitrary overview: require the actual details title AND five visible rows.
export function normalizeFormationLayouts(extracted){
  if(!Array.isArray(extracted?.captures))return extracted;
  const output=JSON.parse(JSON.stringify(extracted));
  for(const row of output.captures){
    if(!row||typeof row!=="object"||Array.isArray(row))continue;
    const layout=row.details_layout;
    const title=typeof layout?.title_text==="string"
      ?layout.title_text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z]/g,""):"";
    if(row.screen_type!=="formation_overview"||
      !["detailsdelaformation","formationdetails"].includes(title)||
      !(validIdentityConfidence(layout?.title_confidence)>=.90)||
      layout?.row_count!==5||!(validIdentityConfidence(layout?.rows_confidence)>=.90)||
      row.squads?.length!==1||row.squads[0]?.heroes?.length!==5)continue;
    row.screen_type="formation_details";
    row.layout_review={reported_type:"formation_overview",reason:"explicit_details_title_and_five_rows"};
  }
  return output;
}

export function formationPortraitZoomPrompt(imageIndexes){
  const indexes=[...new Set((Array.isArray(imageIndexes)?imageIndexes:[imageIndexes])
    .filter(index=>Number.isInteger(index)&&index>=0&&index<=5))];
  return `This is a slot-bound second look at the indexed PLAYER CAPTURES ${indexes.join(", ")}, already classified as formation_details.
Each formation group below contains its exact full parent capture and five DERIVED pixel crops from the
"Détails du héros" portrait at the LEFT of each row. Every crop is explicitly tagged with its parent image_index
and slot_index (0 is row 1, through 4 is row 5). Never transfer a portrait, slot, or evidence between groups.
The lower crop band is deliberately masked to hide level and star UI; a dark mask is not portrait evidence.
The unchanged parent is context from the same capture, not an independent second observation. Return one
formations entry for each supplied parent image_index, with exactly one portrait proposal for each
slot_index 0 through 4, in row order, matching the exact visible portrait against all eligible verified references
equally. Use each crop only to clarify its own row; never move a candidate to another slot or infer from the drone,
weapons, text from another capture, saved/previous composition, level, stars, power, equipment, or position.
The five actual hero tiles above may clarify a row ONLY when the same portrait is visibly matched to that exact
details-row portrait. The drone is never a hero. Never assume a six-tile strip starts at slot 0 or use its position
alone. A repeated portrait in the same capture is not independent evidence and cannot increase confidence.
If the parent-image impression and that row's crop disagree, report the crop's own proposal without
forcing agreement; two strong contradictory readings remain unresolved. A stronger reading over a weaker one
can only be a review proposal, never independent corroboration or increased confidence. Do not read or return hero names,
hero levels, powers, or weapons in this pass. Separately tagged EQUIPMENT ROW ZOOM images show ONLY the four
equipment tiles to the right of that same hero. Read their own Lv labels and quality indicators into equipment.pieces,
slot_index 0..3 from left to right. Do not use equipment for hero identity. Return null for unreadable levels,
not zero; return zero only when a printed Lv.0 is actually visible. Keep visibility/level/rarity confidence separate.
If no equipment row zoom is supplied, return equipment=null. Never invent a missing tile or copy another row.
These are derived pixels, not independent corroboration; confidence must not increase on agreement.
Inspect every unresolved row against the local verified reference atlases, without reusing another row's answer.
Keep the crop's visual observation separate from any weak name OCR on the parent. If a slot has an explicitly
visible class provided below, use it only to exclude incompatible classes, never to infer a particular hero.
Return candidate_name, confidence, variant, exact reference_id and at least two distinctive visual details
actually visible in that row crop. If unclear, return null candidate/reference/variant/confidence and [].
Do not lower any confidence threshold. A proposal is not a confirmed identity; the player must still review
and confirm it. Match only references with an exact verified ID; source verification is not match verification.
Return JSON matching this schema exactly: ${JSON.stringify(FORMATION_PORTRAIT_ZOOM_SCHEMA)}`;
}

export function formationPortraitZoomContent({formations}){
  if(!Array.isArray(formations)||!formations.length||formations.length>6)return [];
  const seen=new Set(),content=[{type:"input_text",text:formationPortraitZoomPrompt(formations.map(row=>row?.imageIndex))}];
  for(const group of formations){
    const {sourceImage,imageIndex,zooms}=group||{};
    if(!Number.isInteger(imageIndex)||imageIndex<0||imageIndex>5||seen.has(imageIndex)||
      typeof sourceImage!=="string"||!Array.isArray(zooms)||zooms.length!==5||
      zooms.some((row,index)=>row?.image_index!==imageIndex||row?.slot_index!==index||typeof row?.image_url!=="string"))return [];
    seen.add(imageIndex);
    content.push({type:"input_text",text:`PLAYER CAPTURE image_index=${imageIndex}; unchanged parent image for all derived crops.`},
      {type:"input_image",image_url:sourceImage,detail:"high"},
      ...zooms.flatMap(row=>[
        {type:"input_text",text:`DERIVED PORTRAIT ZOOM parent_image_index=${row.image_index}; slot_index=${row.slot_index}; source_region=left portrait of that exact hero-details row.${group.heroes?.[row.slot_index]&&visibleHeroClass(group.heroes[row.slot_index])?` Explicitly visible slot class: ${visibleHeroClass(group.heroes[row.slot_index])}; negative filter only.`:""}`},
        {type:"input_image",image_url:row.image_url,detail:"high"}
      ]));
  }
  return content;
}

function zoomRows(extracted,imageIndex){
  const rows=extracted?.portraits;
  if(extracted?.image_index!==imageIndex||!Array.isArray(rows)||rows.length!==5)
    throw Object.assign(new Error("La seconde lecture des portraits est incomplète."),{code:"INVALID_FORMATION_ZOOM"});
  const seen=new Set();
  for(const row of rows){
    if(!Number.isInteger(row?.slot_index)||row.slot_index<0||row.slot_index>4||seen.has(row.slot_index))
      throw Object.assign(new Error("Les lignes de portraits sont incohérentes."),{code:"INVALID_FORMATION_ZOOM"});
    seen.add(row.slot_index);
  }
  return rows.slice().sort((a,b)=>a.slot_index-b.slot_index);
}

function portraitMatch(portrait,references){
  if(!portrait||typeof portrait!=="object")return null;
  const candidate=catalogHeroName(portrait.candidate_name);
  const variant=heroAppearanceContext(portrait.variant);
  const confidence=validIdentityConfidence(portrait.confidence);
  const validation=validatePortraitReference(portrait,candidate,variant,references);
  const features=[...new Set((Array.isArray(portrait.visible_features)?portrait.visible_features:[])
    .filter(portraitFeatureEligible))].slice(0,4);
  const usable=Boolean(candidate&&variant&&confidence!==null&&confidence>=HERO_IDENTITY_THRESHOLDS.medium&&
    features.length>=2&&validation.reference);
  return {candidate,variant,confidence,reference_id:validation.reference?.id||null,features,usable};
}

function reviewObservation(portrait){
  if(!portrait||typeof portrait!=="object")return {candidate_name:null,confidence:null,variant:null,reference_id:null,visible_features:[]};
  return {
    candidate_name:typeof portrait.candidate_name==="string"?portrait.candidate_name.trim().slice(0,120)||null:null,
    confidence:validIdentityConfidence(portrait.confidence),
    variant:typeof portrait.variant==="string"?portrait.variant.trim().slice(0,80)||null:null,
    reference_id:typeof portrait.reference_id==="string"?portrait.reference_id.trim().slice(0,120)||null:null,
    visible_features:[...new Set((Array.isArray(portrait.visible_features)?portrait.visible_features:[])
      .filter(portraitFeatureEligible))].slice(0,4).map(feature=>feature.slice(0,120))
  };
}

// Merge only the five zoom portrait observations into their exact parent image
// and row. Strong contradictions stay blank; a crop never changes other fields.
export function mergeFormationPortraitZooms(extracted,zoomed,{imageIndex,references=[]}={}){
  const rows=zoomRows(zoomed,imageIndex);
  return mergeFormationPortraitZoomGroups(extracted,{formations:[{image_index:imageIndex,portraits:rows}]},
    {imageIndexes:[imageIndex],references});
}

// A missing or invalid optional group is left at its first-pass state. Valid
// groups are merged only by their exact image index and each crop's slot index.
export function mergeFormationPortraitZoomGroups(extracted,zoomed,{imageIndexes,references=[]}={}){
  if(!Array.isArray(imageIndexes))return JSON.parse(JSON.stringify(extracted));
  const requested=[...new Set(imageIndexes.filter(index=>Number.isInteger(index)&&index>=0&&index<=5))];
  const groups=Array.isArray(zoomed?.formations)?zoomed.formations:[];
  const counts=new Map();
  for(const group of groups)counts.set(group?.image_index,(counts.get(group?.image_index)||0)+1);
  const output=JSON.parse(JSON.stringify(extracted));
  for(const imageIndex of requested){
    if(counts.get(imageIndex)!==1)continue;
    let rows;
    try{rows=zoomRows(groups.find(group=>group?.image_index===imageIndex),imageIndex)}catch{continue}
    const parent=output?.captures?.find(row=>row?.image_index===imageIndex);
    if(!parent||parent.screen_type!=="formation_details"||!Array.isArray(parent.squads)||
      !Array.isArray(parent.squads[0]?.heroes)||parent.squads[0].heroes.length!==5)continue;
    const target=parent.squads[0].heroes;
    for(let slotIndex=0;slotIndex<5;slotIndex++){
      const hero=target[slotIndex],full=hero.portrait||{},zoom=rows[slotIndex].portrait||{};
      const fullMatch=portraitMatch(full,references),zoomMatch=portraitMatch(zoom,references);
      const conflict=Boolean(fullMatch?.usable&&zoomMatch?.usable&&
        fullMatch.candidate!==zoomMatch.candidate);
      const variantDisagreement=Boolean(fullMatch?.usable&&zoomMatch?.usable&&
        fullMatch.candidate===zoomMatch.candidate&&fullMatch.variant!==zoomMatch.variant);
      let selection="unresolved",chosen=full,confidenceCap=null;
      const fullStrong=fullMatch?.usable&&fullMatch.confidence>=HERO_IDENTITY_THRESHOLDS.strong;
      const zoomStrong=zoomMatch?.usable&&zoomMatch.confidence>=HERO_IDENTITY_THRESHOLDS.strong;
      if(conflict&&Boolean(fullStrong)!==Boolean(zoomStrong)){
        selection=zoomStrong?"zoom_over_weak_full":"full_over_weak_zoom";
        chosen=zoomStrong?zoom:full;
        // Same pixels are not independent corroboration. The better view can
        // propose a candidate, but its final confidence cannot exceed the
        // weaker admissible observation. Keep both observations for review.
        confidenceCap=Math.min(fullMatch.confidence,zoomMatch.confidence);
      }else if(conflict){
        selection="conflict";
        chosen={candidate_name:null,confidence:null,variant:null,reference_id:null,visible_features:[]};
      }else if(variantDisagreement){
        // Both references attest the SAME canonical hero. Appearance uncertainty
        // is not an identity contradiction; keep the full view's proposal and
        // both variant observations, without claiming a verified image match.
        selection="same_identity_variant_uncertain";
        chosen={...full,confidence:Math.min(fullMatch.confidence,zoomMatch.confidence)};
      }else if(zoomMatch?.usable){
        selection=fullMatch?.usable?"agreement":"zoom_only";
        chosen={...zoom,confidence:fullMatch?.usable?Math.min(fullMatch.confidence,zoomMatch.confidence):zoomMatch.confidence};
      }else if(fullMatch?.usable){
        selection="full_capture_only";
      }else if(zoom.candidate_name||zoom.reference_id){
        selection="zoom_unverified";
        chosen=zoom;
      }else if(full.candidate_name||full.reference_id){
        selection="full_capture_unverified";
      }
      hero.portrait={...chosen,zoom_evidence:{
        method:"formation_details_row_zoom",source_image_index:imageIndex,slot_index:slotIndex,
        source_region:"left_portrait_of_hero_details_row",derived_from_same_capture:true,selection,
        confidence_cap:confidenceCap,
        full_capture:reviewObservation(full),zoom:reviewObservation(zoom)
      }};
      if(rows[slotIndex].equipment){
        const merged=reconcileEquipmentZoom(hero.equipment,rows[slotIndex].equipment,
          {source_image_index:imageIndex,hero_slot_index:slotIndex});
        hero.equipment=merged.equipment;hero.equipment_zoom_evidence=merged.evidence;
      }
    }
  }
  return output;
}

export function formationBatchPrompt(count){
  return `
Analyze the ${count} indexed PLAYER CAPTURES jointly as ONE coherent formation batch.
For every capture, independently read details_layout: the actual dialog title, title confidence,
the number of visible "Détails du héros" rows and row-count confidence. Use null when unavailable.
An explicit "DÉTAILS DE LA FORMATION" / "FORMATION DETAILS" dialog with five hero-details rows is
formation_details, even though its upper section also says "Formation Actuelle". Do not classify
it as formation_overview merely because that upper section is visible. Never infer rows or title
from another image, a saved squad, its power or a player's claimed class.
Return JSON matching this schema exactly: ${JSON.stringify(FORMATION_BATCH_SCHEMA)}.
Return exactly one captures entry per PLAYER image, with its actual zero-based image_index.
Classify each independently. Formation details/overview supplies the five ordered slots,
visible levels/stars/gear and TOTAL formation power with its M unit and confidence.
Inspect equipment in EACH hero's own details row/card, separately from the portrait. Return structured equipment.pieces:
the actual piece slot_index 0..3 in left-to-right screen order, visible, visibility_confidence, its printed
level with level_evidence="visible_equipment_label" and separate confidence, and rarity with evidence/confidence.
Do not default to four pieces: report only actual visible pieces, preserving original indexes even when some are
unreadable. Keep partial observations. A clearly visible icon with unreadable level/quality still counts as one
piece; return null for unreadable fields. Null equipment means no reliably visible gear.
Read levels ONLY from that piece's own equipment badge/label, never hero level, stars, exclusive weapon level,
skill level, another hero or another capture. Level 0 is real. Rarity requires a legible quality label or a
clearly distinguishable equipment-quality indicator; ambiguous color/tint alone is not rarity evidence.
Do not copy rarity between pieces. Set legacy gear=null when structured equipment is returned.
A standalone named hero-detail capture is hero_detail, never a five-hero formation. Return squads=[],
exclusive_weapons=[] and one equipment_details entry with the exact visible hero name and its equipment.
If the name is unreadable, leave it null; this capture must never establish formation membership or fill a
formation identity. For other subtypes return equipment_details=[]. An exclusive-weapon screen is NOT hero
equipment: its level/bonuses and large number must never become equipment pieces, equipment levels or rarity.
For each formation slot return class_text/class_evidence/class_confidence only for an explicitly visible
Tank/Aircraft/Missile label in that same slot; otherwise null/unreadable/null. Never infer class from a player's
description, composition stereotypes or another slot. Return separate name OCR and portrait candidates even
when they disagree; never erase a visual observation to match a weak name reading.
Weapon screens supply only the visible hero title, weapon name, weapon level and labeled bonuses.
If a bonus row shows a current value followed by an arrow and a green next-upgrade value, report
only the current value to the LEFT of the arrow; exclude the green preview. For a row with one
current value, report that value only. Never merge or substitute the preview value.
Unknown images supply empty squads and exclusive_weapons arrays. A weapon supplies no squads.
Reference atlases are NOT player captures. Their labels are NOT OCR from a formation.
For each formation portrait compare all eligible verified references equally; return exact reference_id,
variant, confidence and at least two actually visible distinguishing features. Never identify by
stars, level, power, vehicle type, position, a previous composition or a list of weapon owners.
In DETAILS OF THE FORMATION, a strip can show SIX tiles: a drone tile followed by FIVE heroes.
The drone tile/badge is NOT a hero slot and must NEVER produce even a null placeholder in heroes.
When the "Détails du héros" / hero-details section is visible, use its FIVE rows as the
authoritative slot order: row 1 -> heroes[0], row 2 -> heroes[1], through row 5 -> heroes[4].
Inspect the portrait at the LEFT of each details row, independently against the named references.
The gear icons to its right are NOT portraits. Cross-check with the five actual hero tiles
in the formation strip, excluding the drone. Do not shift names between rows or omit a row.
Use repeated views from the SAME capture to resolve small icons; never infer identity from order.
Copy the reference ID printed on the atlas tile, not the hero name or a guessed filename.
name_text is ONLY text visible on that formation image; name_image_index must be that image's index.
Never copy a weapon title into formation name_text. Instead report the independently matched
portrait candidate, so the server can corroborate it with a compatible named weapon.
A clearly named weapon can corroborate a compatible portrait, NEVER place its owner in an
unresolved slot. Missing/weak portraits stay unresolved regardless of available weapon titles.
Skyler and Schuyler are ONE canonical hero (public name Skyler); Stethmann aliases Stetmann.
Known named weapon identity references: ${JSON.stringify(KNOWN_EXCLUSIVE_WEAPONS)}.
These are identity references ONLY: do not fill any weapon name or level from this dictionary.
No reference for another hero means NO assumed weapon association. Read only the screenshot.
Ignore entirely the large number below weapon level, e.g. 5 071 933 or 7 624 892:
it is neither hero power nor weapon power; do not output any such power field.
Individual hero power requires a separately supported dedicated capture outside this batch;
do not output individual powers here, and never infer them from totals or weapons.
Missing fields are null; do not invent names or values to complete a formation. All results are
proposals requiring explicit player confirmation before saving.
`;
}

// Validate indexing before sanitization: partial/misaligned provider output must
// not silently attach a weapon to an unrelated capture or an invented slot.
export function formationBatchRecords(extracted,count){
  if(!Array.isArray(extracted?.captures)){
    throw Object.assign(new Error("La réponse Vision ne décrit pas toutes les captures du lot. Réessaie sans confirmer."),
      {code:"INVALID_FORMATION_BATCH",status:422});
  }
  const rows=extracted.captures,seen=new Set();
  if(rows.length!==count||rows.some(row=>!row||!Number.isInteger(row.image_index)||
    row.image_index<0||row.image_index>=count||seen.has(row.image_index)||!seen.add(row.image_index)))
    throw Object.assign(new Error("Les indices des captures Vision sont incomplets ou incohérents. Réessaie sans confirmer."),
      {code:"INVALID_FORMATION_BATCH",status:422});
  if(rows.some(row=>!["formation_details","formation_overview","exclusive_weapon_detail","hero_detail","unknown"].includes(row.screen_type)||
    !Array.isArray(row.squads)||!Array.isArray(row.exclusive_weapons)||
    row.squads.length>1||row.exclusive_weapons.length>1||
    row.equipment_details!==undefined&&(!Array.isArray(row.equipment_details)||row.equipment_details.length>1)||
    row.screen_type==="hero_detail"&&(row.squads.length!==0||row.exclusive_weapons.length!==0)||
    ["formation_details","formation_overview"].includes(row.screen_type)&&
      (row.squads.length!==1||!Array.isArray(row.squads[0]?.heroes)||row.squads[0].heroes.length!==5||
       row.squads[0].heroes.some(hero=>!hero||typeof hero!=="object"||Array.isArray(hero)))))
    throw Object.assign(new Error("La structure des captures Vision est invalide. Réessaie sans confirmer."),
      {code:"INVALID_FORMATION_BATCH",status:422});
  return rows.slice().sort((a,b)=>a.image_index-b.image_index).map(row=>{
    const copy=JSON.parse(JSON.stringify(row));
    if(["formation_details","formation_overview"].includes(copy.screen_type)){
      for(const squad of copy.squads||[]){
        if(!(Number(squad.power_confidence)>=.90))delete squad.power;
        for(const hero of squad.heroes||[]){
          hero.equipment_source_image_index=copy.image_index;
          delete hero.power;delete hero.power_text;delete hero.power_confidence;
          if(hero.portrait&&Array.isArray(hero.portrait.visible_features)){
            const eligible=feature=>typeof feature==="string"&&
              !/(?:level|lvl|niveau|stars?|power|puissance|hp|atk|étoiles?|etoiles?)|\blv\.?\s*\d|\d+\s*[★⭐]|^\s*[\d,.%+ -]+[Mk]?\s*$/i.test(feature);
            hero.portrait.discarded_visual_features=hero.portrait.visible_features.filter(feature=>!eligible(feature));
            hero.portrait.visible_features=hero.portrait.visible_features.filter(eligible);
          }
          if(hero.name_image_index!==copy.image_index){
            delete hero.name;delete hero.name_text;hero.name_evidence="unreadable";
          }
          for(const key of ["level","stars"])if(!(Number(hero[`${key}_confidence`])>=.90))delete hero[key];
        }
      }
    }
    return copy;
  });
}

export function corroborateFormationPortraits(results){
  const weapons=results.filter(row=>row.capture_type==="exclusive_weapon_detail")
    .flatMap(row=>row.state?.exclusive_weapons||[]).filter(row=>catalogHeroName(row?.hero_name)&&row.requires_confirmation);
  for(const result of results){
    if(!["formation_details","formation_overview"].includes(result.capture_type))continue;
    for(const squad of result.state?.squads||[]){
      for(const hero of squad?.heroes||[]){
        const identity=hero.scan_evidence?.identity,portrait=identity?.portrait;
        if(identity?.method==="portrait_candidate"&&!portrait?.reference_verified){
          delete hero.name;
          Object.assign(identity,{candidate:null,confidence:null,tier:"low",status:"unresolved",
            method:"unverified_portrait_reference",requires_confirmation:true});
          if(portrait?.diagnostic){portrait.diagnostic.accepted=false;portrait.diagnostic.tier="low"}
          continue;
        }
        // Only a genuine attached, verified reference and an independently
        // eligible portrait candidate can become a strong visual proposal.
        if(!portrait?.reference_verified||identity.method!=="portrait_candidate"||
          catalogHeroName(portrait.candidate)!==catalogHeroName(hero.name))continue;
        const proof=weapons.find(row=>row.hero_name===hero.name);
        const confidence=Math.min(portrait.confidence,proof?.name_confidence??portrait.confidence,
          portrait.confidence_cap??1);
        identity.confidence=confidence;identity.tier=confidence>=HERO_IDENTITY_THRESHOLDS.strong?"strong":"medium";
        identity.status=identity.tier==="strong"?"proposed":"to_confirm";
        identity.requires_confirmation=true;
        identity.method=proof?"portrait_weapon_text":"verified_portrait_reference";
        if(portrait.diagnostic){
          portrait.diagnostic.accepted=true;portrait.diagnostic.tier=identity.tier;
          portrait.diagnostic.reason=proof?"compatible_weapon_corroboration":"verified_reference_proposal";
        }
        if(proof)identity.corroborating_weapon={hero_name:proof.hero_name,text:proof.name_text};
      }
    }
  }
  return results;
}
