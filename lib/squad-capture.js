import {catalogHeroName} from "./heroes.js";
import {validIdentityConfidence} from "./hero-recognition.js";

const text=value=>typeof value==="string"?value.trim().slice(0,160):"";
export function classifySquadCapture(raw={}){
  if(!raw||typeof raw!=="object")return "unknown";
  const label=[raw.screen_type,raw.screen,raw.layout,raw.screen_title,raw.title].map(text).join(" ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/exclusive[\s_-]*weapon|arme[\s_-]*exclusive/.test(label))return "exclusive_weapon_detail";
  if(/formation[\s_-]*(detail|details)|detail[\s_-]*formation|details[\s_-]*de[\s_-]*la[\s_-]*formation/.test(label))return "formation_details";
  if(/formation[\s_-]*(overview|general|preset|current)|team[\s_-]*(overview|screen)|base[\s_-]*formation|prereglage|pre[\s_-]*reglage|formation[\s_-]*actuelle/.test(label))return "formation_overview";
  return "unknown";
}

// Visible named text is mandatory. A weapon icon/name alone never identifies
// its owner, establishes squad membership, or proves a changed appearance.
export function squadWeaponProof(raw={}){
  const title=text(raw.visible_title||raw.name_text);
  const parts=title.split(/\s*[—–−]\s*|\s+-\s+/);
  const fromTitle=parts.length>1?catalogHeroName(parts.at(-1)):catalogHeroName(title);
  const fromName=catalogHeroName(text(raw.name_text));
  const titleHero=fromTitle||fromName;
  const score=validIdentityConfidence(raw.name_confidence);
  const declared=catalogHeroName(raw.hero_name);
  if(raw.name_evidence!=="visible_text"||!titleHero||score===null||score<.70||
    declared&&declared!==titleHero||fromTitle&&fromName&&fromTitle!==fromName)return null;
  const weapon=text(raw.weapon_name)||(parts.length>1?text(parts.slice(0,-1).join(" — ")):"");
  const proof={hero_name:titleHero,weapon_name:weapon,name_text:title,name_confidence:score,
    identity_tier:score>=.88?"strong":"medium",requires_confirmation:true};
  const levelScore=validIdentityConfidence(raw.level_confidence??raw.field_confidence?.level);
  const level=typeof raw.level==="number"?raw.level:/^\d{1,3}$/.test(text(raw.level))?Number(raw.level):null;
  if(levelScore!==null)proof.level_confidence=levelScore;
  if(levelScore!==null&&levelScore>=.90&&Number.isInteger(level)&&level>=0&&level<=999){
    proof.level=level;
  }
  // The large number on a weapon screen is deliberately ignored in formation
  // scans, even if the provider labels it as weapon/hero power.
  const fieldConfidence={};
  for(const key of ["hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"]){
    const confidence=validIdentityConfidence(raw.field_confidence?.[key]);
    if(confidence!==null)fieldConfidence[key]=confidence;
    const value=raw[key]===null||raw[key]===undefined||raw[key]===""?NaN:Number(String(raw[key]).trim().replace(",",".").replace(/%$/,""));
    if(confidence!==null&&confidence>=.90&&Number.isFinite(value)&&value>=0&&
      (key!=="max_skill_level"||Number.isInteger(value)&&value<=999))proof[key]=value;
  }
  if(Object.keys(fieldConfidence).length)proof.field_confidence=fieldConfidence;
  return proof;
}

export function squadWeaponReviewRecord(proof){
  const row={hero_name:proof.hero_name};
  if(proof.weapon_name)row.weapon_name=proof.weapon_name;
  for(const key of ["level","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"])
    if(proof[key]!==undefined)row[key]=proof[key];
  return row;
}

// This helper is ONLY invoked by an explicit, account-bound player association
// action in review. It does not make a portrait or weapon-based automatic guess.
export function associateSquadWeaponProof(draft,proof,slot,{squadId=null}={}){
  const out=JSON.parse(JSON.stringify(draft||{})),squads=(out.squads||[]).filter(Boolean);
  const name=catalogHeroName(proof?.hero_name);
  if(squads.length!==1||!name||!Number.isInteger(slot)||slot<0||slot>4)throw new Error("invalid_weapon_association");
  const squad=squadId===null?squads[0]:out.squads?.[squadId-1];
  if(!squad||squadId!==null&&(!Number.isInteger(squadId)||squadId<1||squadId>4))throw new Error("invalid_weapon_association");
  squad.heroes??=[];
  const current=catalogHeroName(squad.heroes[slot]?.name);
  if(current&&current!==name||squad.heroes.some((hero,index)=>index!==slot&&catalogHeroName(hero?.name)===name))
    throw new Error("conflicting_weapon_association");
  const hero={...squad.heroes[slot],name};
  if(hero.exclusive!=null&&hero.exclusive!==""&&proof.level!==undefined&&String(hero.exclusive)!==String(proof.level))
    throw new Error("conflicting_weapon_levels");
  if(proof.level!==undefined)hero.exclusive=String(proof.level);
  squad.heroes[slot]=hero;
  out.exclusive_weapons??=[];
  if(out.exclusive_weapons.some(row=>catalogHeroName(row?.hero_name)===name))throw new Error("duplicate_weapon_association");
  out.exclusive_weapons.push(squadWeaponReviewRecord(proof));
  return out;
}

export function attachSquadWeaponProofs(squad,proofs=[]){
  const linked=[],pending=[],conflicts=[];
  const heroes=squad?.heroes||[];
  for(const name of new Set(proofs.map(proof=>proof.hero_name))){
    const records=proofs.filter(proof=>proof.hero_name===name);
    const slots=heroes.map((hero,index)=>({hero,index})).filter(({hero})=>
      catalogHeroName(hero?.name)===name&&hero?.scan_evidence?.identity?.candidate===name&&
      ["strong","medium"].includes(hero?.scan_evidence?.identity?.tier));
    const levels=[...new Set(records.map(proof=>proof.level).filter(level=>level!==undefined))];
    const record=records.find(proof=>proof.level!==undefined)||records[0];
    if(slots.length!==1){pending.push({...record,reason:slots.length?"duplicate_formation_identity":"not_linked_to_formation"});continue}
    const {hero,index}=slots[0];
    if(levels.length>1||hero.exclusive!=null&&record.level!==undefined&&String(hero.exclusive)!==String(record.level)){
      conflicts.push(`hero.${name}.exclusive`);pending.push({...record,reason:"conflicting_weapon_levels"});continue;
    }
    if(record.level!==undefined)hero.exclusive=String(record.level);
    hero.scan_evidence={...hero.scan_evidence,exclusive_weapon:{...record,source:"exclusive_weapon_detail"}};
    linked.push({...record,slot:index+1});
  }
  return {linked,pending,conflicts};
}

export function squadCaptureSummary(captures=[],weapons={linked:[],pending:[]},locale="fr"){
  const fr=String(locale).startsWith("fr");
  const formations=captures.filter(c=>["formation_details","formation_overview"].includes(c.type)).length;
  const details=captures.filter(c=>c.type==="exclusive_weapon_detail").length;
  const unknown=captures.filter(c=>c.type==="unknown").length;
  const labels=[fr?`${formations} capture(s) de formation, ${details} écran(s) d’arme exclusive reconnus.`:
    `${formations} formation capture(s), ${details} exclusive-weapon screen(s) recognized.`];
  for(const proof of [...weapons.linked,...weapons.pending]){
    const linked=weapons.linked.includes(proof);
    labels.push(`${proof.hero_name}${proof.weapon_name?` — ${proof.weapon_name}`:""}${proof.level!==undefined?` · ${fr?"arme niv.":"weapon lv."} ${proof.level}`:""} : ${
      linked?(fr?"lié au héros de formation, à confirmer":"linked to formation hero, confirm before saving"):
      proof.reason==="conflicting_weapon_levels"?(fr?"niveaux contradictoires, à confirmer":"conflicting levels, needs confirmation"):
      (fr?"non relié à un emplacement de formation, non appliqué":"not linked to a formation slot, not applied")}.`);
    for(const key of ["hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"])
      if(proof[key]!==undefined)labels.push(`${proof.hero_name} · ${key.replaceAll("_"," ")} : ${proof[key]} (${fr?"à confirmer":"needs confirmation"}).`);
  }
  if(unknown)labels.push(fr?`${unknown} capture(s) de sous-type non reconnu, non appliquée(s).`:`${unknown} unrecognized capture(s), not applied.`);
  return labels.join(" ");
}
