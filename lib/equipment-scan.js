import {parseGear,sanitizeGear} from "./gear.js";

const confidence=value=>typeof value==="number"&&Number.isFinite(value)&&value>=.90&&value<=1;
const level=value=>typeof value==="number"&&Number.isInteger(value)&&value>=0&&value<=100;
const rarities=new Set(["red","orange","gold","purple","blue","green"]);

// Observations come solely from the current capture, never a saved hero/profile.
export function readScannedEquipment(raw,{imageIndex=null,heroSlotIndex=null}={}){
  const evidence={source_image_index:imageIndex,hero_slot_index:heroSlotIndex,pieces:[],rejected:[],partial:true};
  if(!raw||!Array.isArray(raw.pieces)||raw.pieces.length>4)return {value:null,evidence};
  const counts=new Map();
  for(const piece of raw.pieces)counts.set(piece?.slot_index,(counts.get(piece?.slot_index)||0)+1);
  for(const piece of raw.pieces){
    const slot=piece?.slot_index;
    if(!Number.isInteger(slot)||slot<0||slot>3||counts.get(slot)!==1){
      evidence.rejected.push({slot_index:Number.isInteger(slot)?slot:null,reason:"invalid_or_duplicate_slot"});continue;
    }
    if(piece.visible!==true||!confidence(piece.visibility_confidence)){
      evidence.rejected.push({slot_index:slot,reason:"piece_not_reliably_visible"});continue;
    }
    const observedLevel=level(piece.level)&&confidence(piece.level_confidence)&&
      piece.level_evidence==="visible_equipment_label"?piece.level:null;
    const rarity=rarities.has(piece.rarity)&&confidence(piece.rarity_confidence)&&
      ["visible_label","clear_quality_indicator"].includes(piece.rarity_evidence)?piece.rarity:null;
    evidence.pieces.push({slot_index:slot,level:observedLevel,rarity,
      visibility_confidence:piece.visibility_confidence,
      level_confidence:confidence(piece.level_confidence)?piece.level_confidence:null,
      rarity_confidence:confidence(piece.rarity_confidence)?piece.rarity_confidence:null,
      rarity_evidence:rarity?piece.rarity_evidence:"unreadable_or_ambiguous"});
  }
  evidence.pieces.sort((a,b)=>a.slot_index-b.slot_index);
  evidence.partial=evidence.pieces.length<4||evidence.pieces.some(piece=>piece.level===null||piece.rarity===null);
  const value=evidence.pieces.map(piece=>[
    `slot=${piece.slot_index}`,"count=1",
    ...(piece.level!==null?[`level=${piece.level}`]:[]),
    ...(piece.rarity?[`rarity=${piece.rarity}`]:[])
  ].join(";")).join("|");
  return {value:value?sanitizeGear(value):null,evidence};
}

export function partialScannedGear(value){
  const parsed=parseGear(value);
  return parsed.valid&&parsed.segments.some(segment=>segment.slot!==undefined)&&
    (parsed.segments.length<4||parsed.segments.some(segment=>segment.level===null||!segment.rarity));
}

// A zoom is the SAME capture, not independent evidence. Keep exact piece slots,
// do not raise confidence on agreement, and blank contradictory readable fields.
export function reconcileEquipmentZoom(full,zoom,context={}){
  const first=readScannedEquipment(full,context),second=readScannedEquipment(zoom,context);
  const pieces=new Map(first.evidence.pieces.map(piece=>[piece.slot_index,{...piece}]));
  const conflicts=[];
  for(const observed of second.evidence.pieces){
    const base=pieces.get(observed.slot_index);
    if(!base){pieces.set(observed.slot_index,{...observed});continue}
    base.visibility_confidence=Math.min(base.visibility_confidence,observed.visibility_confidence);
    for(const field of ["level","rarity"]){
      const value=observed[field],old=base[field],score=`${field}_confidence`;
      if(value===null)continue;
      if(old!==null&&old!==value){
        base[field]=null;base[score]=null;
        conflicts.push({slot_index:base.slot_index,field,reason:"conflicting_values"});
      }else if(old===null){
        base[field]=value;base[score]=observed[score];
        if(field==="rarity")base.rarity_evidence=observed.rarity_evidence;
      }else base[score]=Math.min(base[score],observed[score]);
    }
  }
  return {equipment:{pieces:[...pieces.values()].sort((a,b)=>a.slot_index-b.slot_index).map(piece=>({
    ...piece,visible:true,level_evidence:piece.level===null?"unreadable":"visible_equipment_label",
    rarity_evidence:piece.rarity===null?"unreadable":piece.rarity_evidence
  }))},evidence:{...context,selection:"same_capture_equipment_zoom",conflicts,
    full_capture:first.evidence,zoom:second.evidence}};
}

// Complementary screenshots may only fill unreadable fields of the same
// canonically identified hero/piece. Conflicting readable values stay in review.
export function mergeEquipmentReadings(existing,incoming){
  const old=parseGear(existing),next=parseGear(incoming),conflicts=[];
  if(!next.valid)return {value:existing,conflicts};
  if(!old.valid)return {value:sanitizeGear(incoming),conflicts};
  if([...old.segments,...next.segments].some(segment=>segment.slot===undefined))
    return {value:existing,conflicts:[{reason:"unlinked_equipment_slots"}]};
  const pieces=new Map(old.segments.map(segment=>[segment.slot,{...segment}]));
  for(const segment of next.segments){
    const base=pieces.get(segment.slot);
    if(!base){pieces.set(segment.slot,{...segment});continue}
    for(const field of ["level","rarity"]){
      const value=segment[field];
      if(value===null||value==="")continue;
      if(base[field]!==null&&base[field]!==""&&base[field]!==value)
        conflicts.push({slot_index:segment.slot,field,reason:"conflicting_values"});
      else base[field]=value;
    }
  }
  return {value:sanitizeGear([...pieces.values()].sort((a,b)=>a.slot-b.slot).map(segment=>[
    `slot=${segment.slot}`,"count=1",
    ...(segment.level!==null?[`level=${segment.level}`]:[]),
    ...(segment.rarity?[`rarity=${segment.rarity}`]:[])
  ].join(";")).join("|")),conflicts};
}

// Called only during explicit review/confirmation, not recognition. Preserve
// existing confirmed values where the new observation is unreadable. Legacy
// grouped gear lacks exact slot provenance: never guess its per-piece mapping.
export function mergeReviewedGear(existing,incoming){
  const next=parseGear(incoming),old=parseGear(existing);
  if(!next.valid)return null;
  if(!partialScannedGear(incoming)||!old.valid)return sanitizeGear(incoming);
  if(old.levelOnly!==null)return undefined;
  let oldPieces=old.segments;
  if(oldPieces.some(segment=>segment.slot===undefined)){
    // A legacy uniform set is unambiguous for every slot. Differing grouped
    // pieces have no proven positional mapping and must remain unchanged.
    if(oldPieces.length!==1||oldPieces[0].count!==4||oldPieces[0].levels||oldPieces[0].rarity?.includes(","))return undefined;
    oldPieces=Array.from({length:4},(_,slot)=>({...oldPieces[0],slot,count:1}));
  }
  const pieces=new Map(oldPieces.map(segment=>[segment.slot,{...segment}]));
  for(const segment of next.segments){
    const base=pieces.get(segment.slot);
    pieces.set(segment.slot,{...segment,
      level:segment.level??base?.level??null,rarity:segment.rarity||base?.rarity||null});
  }
  return sanitizeGear([...pieces.values()].sort((a,b)=>a.slot-b.slot).map(segment=>[
    `slot=${segment.slot}`,"count=1",
    ...(segment.level!==null?[`level=${segment.level}`]:[]),
    ...(segment.rarity?[`rarity=${segment.rarity}`]:[])
  ].join(";")).join("|"));
}
