import {requireProductUser} from "../lib/pro-access.js";
import {canonicalHeroName,catalogHeroName,canonicalExclusiveWeaponHeroName} from "../lib/heroes.js";
import {sanitizeGear} from "../lib/gear.js";
import {normalizeSeasonLifecycle} from "../lib/season-lifecycle.js";
import {sanitizeTechnologyCards} from "../lib/technology-scan.js";
import {cleanRosterOcrName,rosterIdentityKey} from "../lib/roster-identity-resolution.js";
import {fetchWithTimeout} from "../lib/http-timeout.js";
import {canonicalPowerMillions} from "../lib/power-units.js";
import {parseHeroPower} from "../lib/hero-power.js";
import {classifyDroneScreen,sanitizeDroneScan} from "../lib/drone-scan.js";
import {explicitLastWarManagerRank,LAST_WAR_SCAN_RANK_SOURCE} from "../lib/rank-provenance.js";
import {scanAbuseGuard} from "../lib/scan-abuse-guard.js";

// HF8.6.28 R2 — stable single-pass WarBoost Vision.
// One screenshot = one bounded provider request. Optional portrait passes are deliberately
// removed from the critical path so a useful scan cannot be lost to a second AI timeout.
const REQUEST_TIMEOUT_MS=46000;
const MAX_IMAGE_DATA_URL=4_150_000;
export const MAX_TECHNOLOGY_IMAGES=3;
export const MAX_TECHNOLOGY_BATCH_LENGTH=6_500_000;
export function validateScanImageBatch(scanType,body={}){
  const type=String(scanType||"").toLowerCase();
  const raw=type==="technology"&&Array.isArray(body?.image_data_urls)?body.image_data_urls:[body?.image_data_url];
  if(!raw.length)return {ok:false,status:400,error:"invalid_image",message:"Image invalide."};
  if(type==="technology"&&raw.length>MAX_TECHNOLOGY_IMAGES)
    return {ok:false,status:413,error:"technology_image_batch_too_large",message:"Choisis au maximum trois captures Technologie compressées."};
  const images=raw.map(value=>String(value||""));
  if(images.some(image=>!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)))
    return {ok:false,status:400,error:"invalid_image",message:"Image invalide."};
  if(images.some(image=>image.length>MAX_IMAGE_DATA_URL))
    return {ok:false,status:413,error:"image_too_large",message:"Capture trop volumineuse. Choisis de nouveau la capture."};
  if(type==="technology"&&images.reduce((sum,image)=>sum+image.length,0)>MAX_TECHNOLOGY_BATCH_LENGTH)
    return {ok:false,status:413,error:"technology_image_batch_too_large",message:"Choisis au maximum trois captures Technologie compressées."};
  return {ok:true,images};
}
function env(name){return String(process.env[name]||"").trim()}
function str(v,max=160){const s=String(v??"").trim();return s?s.slice(0,max):null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
function looseNum(v){
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const match=String(v??"").trim().replace(",",".").match(/[-+]?\d+(?:\.\d+)?/);
  if(!match)return null;
  const n=Number(match[0]);return Number.isFinite(n)?n:null;
}
function visibleLevel(v){
  if(typeof v==="number")return Number.isFinite(v)?Math.round(v):null;
  const text=String(v??"").trim();
  if(!text)return null;
  const labeled=text.match(/(?:lv|lvl|level|niv|niveau)\s*\.?\s*[:#-]?\s*(\d{1,3})/i);
  if(labeled)return Number(labeled[1]);
  if(/^\d{1,3}$/.test(text))return Number(text);
  return null;
}
function objectValue(raw,keys){
  for(const key of keys){
    const value=raw?.[key];
    if(value!==null&&value!==undefined&&value!=="")return value;
  }
  return null;
}
function textValue(raw,keys,max=160){
  const value=objectValue(raw,keys);
  if(value&&typeof value==="object")return str(value.name||value.label||value.title,max);
  return str(value,max);
}
function verifiedRosterContext(scanType,currentState,user){
  if(scanType!=="alliance_roster"||!user?.id||String(currentState?.player_id||"")!==String(user.id))return null;
  const rawTag=str(currentState?.alliance?.tag,16)?.toUpperCase().replace(/[^A-Z0-9]/g,"");
  return rawTag?{alliance:{tag:rawTag}}:null;
}
function safeErrorCode(error){
  const code=String(error?.code||"SCAN_FAILED");
  return new Set(["SCAN_FAILED","SCAN_NOT_CONFIGURED","VISION_TIMEOUT","VISION_INVALID_JSON","VISION_HTTP_ERROR","AUTH_REQUIRED","AUTH_NOT_CONFIGURED","AUTH_INVALID","AUTH_UPSTREAM_TIMEOUT","BETA_INVITES_NOT_CONFIGURED","BETA_INVITE_REVOKED","BETA_INVITE_EXPIRED","BETA_INVITE_REQUIRED","BETA_CONSENT_REQUIRED"]).has(code)?code:"SCAN_FAILED";
}
function exclusiveWeaponRecord(raw,now){
  if(!raw||typeof raw!=="object")return null;
  const nested=raw.weapon_data&&typeof raw.weapon_data==="object"?raw.weapon_data:
    raw.exclusive_weapon_data&&typeof raw.exclusive_weapon_data==="object"?raw.exclusive_weapon_data:
    raw.weapon&&typeof raw.weapon==="object"?raw.weapon:{};
  const merged={...nested,...raw};
  const x={updated_at:now};
  const weapon=textValue(merged,["weapon_name","exclusive_weapon_name","exclusive_name","item_name","title","name"])||
    (typeof raw.weapon==="string"?str(raw.weapon,80):null);
  const hero=canonicalExclusiveWeaponHeroName(textValue(merged,["hero_name","hero","character_name","character","owner_name"]),weapon);
  if(hero)x.hero_name=hero;
  if(weapon)x.weapon_name=weapon;
  const level=visibleLevel(objectValue(merged,["level","weapon_level","exclusive_level","visible_level","lv","lvl","niveau","niveau_arme"]));
  if(level!=null&&level>=0&&level<=999)x.level=level;
  const numericFields={
    power:["power","power_raw","weapon_power","exclusive_power","hero_power","combat_power","combat_power_value"],
    hero_hp_bonus:["hero_hp_bonus","hp_bonus","health_bonus"],
    hero_atk_bonus:["hero_atk_bonus","atk_bonus","attack_bonus"],
    hero_def_bonus:["hero_def_bonus","def_bonus","defense_bonus"],
    all_damage_resistance_pct:["all_damage_resistance_pct","damage_resistance_pct","resistance_pct"],
    max_skill_level:["max_skill_level","skill_cap","skill_level"]
  };
  const rawPower=objectValue(merged,["power","power_raw","visible_power","power_text","weapon_power","exclusive_power","hero_power","combat_power","combat_power_value"]);
  if(rawPower!==null&&rawPower!==undefined&&String(rawPower).trim()){
    if(parseHeroPower(rawPower)===null){
      x.power_raw=str(rawPower,80);
      x.power_parse_status="needs_verification";
    }
  }
  for(const [target,keys] of Object.entries(numericFields)){
    const rawValue=objectValue(merged,keys);
    const value=target==="power"
      ?keys.map(key=>parseHeroPower(merged?.[key])).find(value=>value!==null)??null
      :looseNum(rawValue);
    if(value!=null)x[target]=value;
  }
  return Object.keys(x).length>1?x:null;
}
function jsonFromText(text){
  const raw=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();
  try{return JSON.parse(raw)}catch{}
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{}}
  throw Object.assign(new Error("Vision returned invalid JSON"),{code:"VISION_INVALID_JSON"});
}
function textFromResponse(j){
  if(typeof j?.output_text==="string"&&j.output_text.trim())return j.output_text;
  for(const item of j?.output||[])for(const c of item?.content||[])if(typeof c?.text==="string"&&c.text.trim())return c.text;
  return "";
}
function squadCaptureScreenType(extracted){
  if(!extracted||typeof extracted!=="object")return null;
  const raw=[extracted.screen_type,extracted.screen,extracted.layout,extracted.screen_title,extracted.title].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(!raw)return null;
  if(/formation[\s_-]*(detail|details)|detail[\s_-]*formation|details[\s_-]*de[\s_-]*la[\s_-]*formation/.test(raw))return "details";
  if(/formation[\s_-]*(overview|general|preset|current)|team[\s_-]*(overview|screen)|base[\s_-]*formation|prereglage|pre[\s_-]*reglage|formation[\s_-]*actuelle/.test(raw))return "overview";
  return null;
}
function hmsSeconds(v){const m=String(v||"").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null}
function rosterRole(v){const r=String(v||"").trim().toUpperCase();return /^R[1-5]$/.test(r)?r:null}
function heroNameFromVisibleText(h){
  const evidence=String(h?.name_evidence||"").toLowerCase(),confidence=Number(h?.name_confidence);
  if(evidence!=="visible_text"||!Number.isFinite(confidence)||confidence<0.88)return null;
  return catalogHeroName(h?.name)||canonicalHeroName(h?.name)||null;
}
export function usefulState(scanType,state){
  const t=String(scanType||"").toLowerCase();
  if(t==="profile")return Boolean(state?.player&&Object.keys(state.player).some(k=>k!=="updated_at"));
  if(t==="drone")return Boolean(state?.drone&&(state.drone.level!=null||state.drone.boostCombat?.level!=null||state.drone.power_m!=null||state.drone.components?.length||state.drone.skill_chips?.length));
  const sm=t.match(/^squad([1-4])$/);if(sm){const q=state?.squads?.[Number(sm[1])-1];return Boolean(q&&(q.power!=null||(q.heroes||[]).some(h=>Object.keys(h||{}).length)))}
  if(t==="exclusive")return Boolean(state?.exclusive_weapons?.length);
  if(t==="awakening")return Boolean(state?.hero_progression?.length);
  if(t==="shop")return Boolean(state?.shop&&Object.keys(state.shop).some(k=>k!=="updated_at"));
  if(t==="vs")return Boolean(state?.vs&&Object.keys(state.vs).some(k=>!["updated_at","source"].includes(k)));
  if(t==="technology")return Boolean(state?.technology&&(Object.keys(state.technology.branches||{}).length||state.technology.unmapped?.length));
  if(t==="season")return Boolean(state?.season&&Object.keys(state.season).some(k=>k!=="updated_at")||state?.technology&&Object.keys(state.technology).some(k=>k!=="updated_at"));
  if(t==="secret_mobile_squad")return Boolean(state?.special_events?.secret_mobile_squad?.tasks?.length);
  return Boolean(Object.keys(state||{}).length);
}
function normalizedLooseText(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function safeRosterHq(v){
  const n=num(v);
  // Player profile screens contain several unrelated "Niv." values.
  // Never import those as QG/HQ; impossible values are left for manual review.
  return n!=null&&n>=1&&n<=50?Math.round(n):null;
}
function rosterRowFromRaw(raw,now,allianceTag="",profileContext=null){
  if(!raw||typeof raw!=="object")return null;
  const name=cleanRosterOcrName(str(raw?.name||raw?.player_name||raw?.nickname,80)||"",allianceTag);
  const role=rosterRole(raw?.role||raw?.rank),confirmedRole=explicitLastWarManagerRank(role);
  const hq=safeRosterHq(raw?.hq_level??raw?.hq);
  const power=canonicalPowerMillions(raw?.power_m??raw?.power);
  const key=rosterIdentityKey(name,allianceTag);
  if(!name||!key)return null;

  // Individual profile guard: alliance display name must never become the player nickname.
  const allianceName=profileContext?.alliance_name||raw?.alliance_name||"";
  if(allianceName&&normalizedLooseText(name)===normalizedLooseText(allianceName))return null;

  return {
    name,
    role,
    hq_level:hq,
    power_m:power!=null&&power>0?Math.round(power*100)/100:null,
    updated_at:now,
    source:"roster_scan",
    rank_confirmation_status:confirmedRole?"confirmed_scan":"unconfirmed",
    ...(confirmedRole?{rank_confirmed_at:now,rank_confirmed_source:LAST_WAR_SCAN_RANK_SOURCE}: {})
  };
}
export function sanitizeRosterRows(extracted,now,allianceTag=""){
  const screenType=String(extracted?.screen_type||extracted?.layout||"").trim().toLowerCase();
  const profile=extracted?.player_profile&&typeof extracted.player_profile==="object"?extracted.player_profile:null;

  // "Profil du joueur" is one roster observation. Prefer its dedicated header fields.
  if(profile||screenType==="player_profile"){
    const row=rosterRowFromRaw(profile||extracted?.player||{},now,allianceTag,{
      alliance_name:profile?.alliance_name||extracted?.alliance_name||extracted?.alliance?.name||""
    });
    return row?[row]:[];
  }

  const source=Array.isArray(extracted?.alliance_roster)?extracted.alliance_roster:Array.isArray(extracted?.roster_rows)?extracted.roster_rows:Array.isArray(extracted?.members)?extracted.members:[];
  const out=[],seen=new Set();
  for(const raw of source.slice(0,45)){
    const row=rosterRowFromRaw(raw,now,allianceTag,null);
    if(!row)continue;
    const key=rosterIdentityKey(row.name,allianceTag);if(!key||seen.has(key))continue;seen.add(key);
    out.push(row);
  }
  return out;
}
export function sanitize(extracted,now,scanType){
  const out={},forced=String(scanType||"").match(/^squad([1-4])$/i),forcedId=forced?Number(forced[1]):null;
  if(extracted?.player){const p={updated_at:now};for(const k of ["name","server_id","coordinates","role"]){const v=str(extracted.player[k],80);if(v)p[k]=v}const confirmedRole=explicitLastWarManagerRank(p.role);p.role_confirmation_status=confirmedRole?"confirmed_scan":"unconfirmed";if(confirmedRole){p.rank_confirmed_at=now;p.rank_confirmed_source=LAST_WAR_SCAN_RANK_SOURCE}const hq=num(extracted.player.hq_level),power=canonicalPowerMillions(extracted.player.power_m);if(hq!=null)p.hq_level=hq;if(power!=null)p.power_m=power;if(Object.keys(p).length>1)out.player=p}
  if(scanType==="drone"){const {drone}=sanitizeDroneScan(extracted,now);if(Object.keys(drone).length)out.drone=drone}
   if(Array.isArray(extracted?.squads)&&extracted.squads.length){const arr=Array(4).fill(null),source=forcedId?extracted.squads.slice(0,1):extracted.squads.slice(0,4);for(const raw of source){const id=forcedId||Math.max(1,Math.min(4,Number(raw?.id)||1)),q={id,name:`Squad ${id}`,updated_at:now};const power=canonicalPowerMillions(raw?.power_m??raw?.power);if(power!=null)q.power=power;if(Array.isArray(raw?.heroes)){q.heroes=Array.from({length:5},(_,i)=>{const h=raw.heroes[i]||{},x={};const name=heroNameFromVisibleText(h);if(name)x.name=name;const level=num(h?.level),stars=num(h?.stars),heroPower=parseHeroPower(h?.power);if(level!=null)x.level=level;if(stars!=null)x.stars=stars;if(heroPower!=null)x.power=heroPower;const ex=str(h?.exclusive,100);if(ex)x.exclusive=ex;const gear=sanitizeGear(h?.gear);if(gear)x.gear=gear;return x})}else if(forcedId)q.heroes=Array.from({length:5},()=>({}));arr[id-1]=q}out.squads=arr}
  const rawWeapons=Array.isArray(extracted?.exclusive_weapons)?extracted.exclusive_weapons:
    Array.isArray(extracted?.exclusiveWeapons)?extracted.exclusiveWeapons:
    extracted?.exclusive_weapon?[extracted.exclusive_weapon]:
    extracted?.exclusiveWeapon?[extracted.exclusiveWeapon]:
    extracted?.weapon_data?[extracted.weapon_data]:
    extracted?.weapon||extracted?.weapon_name||extracted?.hero_name?[extracted]:[];
  if(rawWeapons.length)out.exclusive_weapons=rawWeapons.slice(0,12).map(w=>exclusiveWeaponRecord(w,now)).filter(Boolean);
  if(extracted?.shop){const s={updated_at:now};for(const k of ["store_type","currency"]){const v=str(extracted.shop[k],80);if(v)s[k]=v}for(const k of ["currency_balance","vip_level","vip_days_remaining"]){const v=num(extracted.shop[k]);if(v!=null)s[k]=v}if(Array.isArray(extracted.shop.offers))s.offers=extracted.shop.offers.slice(0,24).map(o=>{const x={};for(const k of ["item_name","currency","limit","category","rarity","contents","offer_kind"]){const v=str(o?.[k],240);if(v)x[k]=v}for(const k of ["quantity","price","discount_pct","price_confidence","currency_confidence"]){const v=num(o?.[k]);if(v!=null)x[k]=v}for(const k of ["sold","content_verified","contents_verified","cost_gain_verified"]){if(typeof o?.[k]==="boolean")x[k]=o[k]}return x}).filter(x=>x.item_name);if(Object.keys(s).length>1)out.shop=s}
  const progression=Array.isArray(extracted?.hero_progression)?extracted.hero_progression:(extracted?.awakening_hero?[extracted.awakening_hero]:[]);if(progression.length){out.hero_progression=progression.slice(0,12).map(h=>{const x={updated_at:now},name=canonicalHeroName(h?.hero_name||h?.name);if(name)x.hero_name=name;for(const k of ["stars","exclusive"]){const v=num(h?.[k]);if(v!=null)x[k]=v}if(h?.awakening&&typeof h.awakening==="object"){const a={};for(const k of ["stars","skill_level","named_shards","universal_shards","power","reshape_stage","reshape_value"]){const v=num(h.awakening[k]);if(v!=null)a[k]=v}for(const k of ["unlocked","trial_complete","in_base"]){if(typeof h.awakening[k]==="boolean")a[k]=h.awakening[k]}if(Object.keys(a).length)x.awakening=a}return x}).filter(x=>x.hero_name)}
    if(["season","technology"].includes(scanType)&&extracted?.technology){
     const {branches,unmapped}=sanitizeTechnologyCards(extracted.technology,now);
     if(Object.keys(branches).length||unmapped.length)out.technology={updated_at:now,branches,unmapped};
   }
  if(extracted?.alliance){const a={updated_at:now};for(const k of ["tag","name","role"]){const v=str(extracted.alliance[k],80);if(v)a[k]=k==="tag"?v.toUpperCase():v}if(Object.keys(a).length>1)out.alliance=a}
  if(extracted?.vs){const v={updated_at:now,source:"scan"};for(const k of ["week","day","our_score","their_score","our_percent","their_percent","personal_rank","personal_score","time_remaining_seconds"]){const n=num(extracted.vs[k]);if(n!=null)v[k]=n}for(const k of ["theme","opponent","our_alliance","our_server_id","opponent_server_id","personal_name","time_remaining_text"]){const s=str(extracted.vs[k],160);if(s)v[k]=s}for(const k of ["our_tag","opponent_tag"]){const s=str(extracted.vs[k],24);if(s)v[k]=s.replace(/[\[\]]/g,"").toUpperCase()}if(v.time_remaining_seconds==null&&v.time_remaining_text){const sec=hmsSeconds(v.time_remaining_text);if(sec!=null)v.time_remaining_seconds=sec}if(v.our_score!=null&&v.their_score!=null)v.score_confirmed=true;if(Array.isArray(extracted.vs.leaderboard))v.leaderboard=extracted.vs.leaderboard.slice(0,10).map(r=>({rank:num(r?.rank),alliance_tag:str(r?.alliance_tag,24),player_name:str(r?.player_name||r?.name,80),score:num(r?.score)})).filter(r=>r.player_name||r.rank!=null);if(Object.keys(v).length>2)out.vs=v}
  if(extracted?.season){const s={updated_at:now};for(const k of ["name","profession","focus"]){const v=str(extracted.season[k],80);if(v)s[k]=v}const life=normalizeSeasonLifecycle(extracted.season.lifecycle||extracted.season.status);if(life&&life!=="unknown"){s.lifecycle=life;s.lifecycle_source="scan"}for(const k of ["number","day","total_days","progress_pct","resistance"]){const v=num(extracted.season[k]);if(v!=null)s[k]=v}if(typeof extracted.season.crystal_event_eligible==="boolean"){s.crystal_event_eligible=extracted.season.crystal_event_eligible;s.crystal_event_source="scan"}if(Object.keys(s).length>1)out.season=s}
  if(scanType==="secret_mobile_squad"){
    const source=Array.isArray(extracted?.special_supplementary_tasks)?extracted.special_supplementary_tasks:
      Array.isArray(extracted?.tasks)?extracted.tasks:[];
    const seen=new Set(),tasks=[];
    for(const raw of source.slice(0,30)){
      const label=str(raw?.label||raw?.task_text||raw?.text,200);
      const evidence=String(raw?.label_evidence||raw?.evidence||"").toLowerCase();
      if(!label||evidence&&evidence!=="visible_text")continue;
      const key=normalizedLooseText(label);if(!key||seen.has(key))continue;seen.add(key);
      tasks.push({label});
    }
    if(tasks.length)out.special_events={secret_mobile_squad:{tasks,updated_at:now,source:"screenshot_ocr"}};
  }
  return out;
}
export function promptFor(scanType,locale,allianceTag){
  const common=`You are WarBoost Vision reading a Last War: Survival screenshot. Read only facts actually visible in the image. Never invent hidden values. User locale: ${locale}. Return ONE valid JSON object only, without markdown or commentary.`;
  if(scanType==="alliance_roster")return `${common} This WarBoost action accepts TWO Last War layouts: (A) the alliance member list, or (B) an individual screen titled "PROFIL DU JOUEUR" / "PLAYER PROFILE". First identify the layout.

For an ALLIANCE MEMBER LIST, return exactly {"screen_type":"member_list","alliance_roster":[{"name":string,"role":"R1|R2|R3|R4|R5|null","hq_level":number,"power_m":number}]}. Include only rows visibly present. If the grade is not clearly visible, use null; never use R1/R2/R3 as a guess. Include the R5 if visibly shown separately above the R4/R3/R2/R1 lists. Do not return a confidence score.

For an INDIVIDUAL PLAYER PROFILE, return exactly {"screen_type":"player_profile","player_profile":{"name":string,"role":"R1|R2|R3|R4|R5|null","hq_level":number,"power_m":number,"alliance_tag":string,"alliance_name":string,"server_id":string}} and NO alliance_roster array. If the grade is not clearly visible, use null; never infer R1/R2/R3. On this layout:
- The PLAYER NICKNAME is in the TOP BLUE HEADER, immediately after the player's "Niv.XX" and optional alliance tag. Example: "Niv.35 [ALL4]Space commander" means nickname "Space commander" and HQ/QG 35.
- The HQ/QG is ONLY the "Niv.XX" in that same top header immediately before the nickname.
- NEVER use another level shown elsewhere on the profile as HQ/QG. A value such as "Niv.100" beside another icon/stat is NOT the QG.
- The account POWER is the large value ending in M beside the power/combat icon. Example: 216.8M -> 216.8.
- The member ROLE is the visible R1/R2/R3/R4/R5 badge associated with the alliance membership row.
- The ALLIANCE DISPLAY NAME is separate, often on a row such as "[ALL4]ALL FOR 1". It is NEVER the player's nickname.
- A visible "#884" means server_id "884".
- If nickname or role cannot be clearly distinguished from the alliance name, omit the player instead of guessing.

Alliance tag expected from WarBoost context is ${allianceTag||"unknown"}. A leading [${allianceTag||"TAG"}] decoration is not part of the nickname when it matches that alliance tag. Preserve genuine nickname characters, spaces and trailing digits. Power ending in M is numeric millions. Never infer hidden members, departures, ranks, HQ values or power.`;
  if(/^squad[1-4]$/i.test(scanType)){const id=Number(scanType.slice(-1));return `${common} This is Squad ${id}. First classify the screenshot as screen_type "formation_details", "formation_overview", or "unknown". Use "formation_details" ONLY when the title/details view clearly shows the 5 hero rows/cards and their equipment; use "formation_overview" for the general team/base screen, Formation Preset screen, or Current Formation screen before View Details. If it is "formation_overview", return {"screen_type":"formation_overview"} and do not invent squad or hero values. If it is "formation_details", return {"screen_type":"formation_details","squads":[{"id":${id},"power":number,"heroes":[{"name":string,"name_evidence":"visible_text","name_confidence":number,"level":number,"stars":number,"power":number,"exclusive":string,"gear":string}]}]}. Squad power must be expressed in millions: return 34.29 for a visible 34.29M, never 34290000. Read all 5 hero rows/cards. Hero name is allowed ONLY if the name itself is readable text; do not guess a portrait identity. Read the squad power and every clearly visible level, stars, hero power, exclusive level/text and gear. For gear use count=4;levels=L1,L2,L3,L4;rarity=... when visible. Lv.0 is real data.`}
  if(scanType==="profile")return `${common} Return visible player/account data only as {"player":{"name":string,"server_id":string,"hq_level":number,"power_m":number,"coordinates":string,"role":string},"alliance":{"tag":string,"name":string,"role":string}}.`;
  if(scanType==="drone")return `${common} For components and skill_chip screens, extract only cards whose NAME and LEVEL are explicitly legible on the SAME card: drone.components or drone.skill_chips, each row with name (exact visible text), level (visible integer), confidence (0..1), evidence "visible_same_card". Omit ambiguous or unreadable cards; never supply example/default numbers. FIRST classify the Last War Drone screenshot. Return screen_type EXACTLY one of "attributes", "components", "combat_boost", "skill_chip", "unknown", and screen_title as the exact visible title. "Boost de Combat"/"Combat Boost" is combat_boost, NOT attributes. "Puce de Compétence"/"Skill Chip" is skill_chip.

For attributes ONLY, read the general Drone level as drone.level when directly visible. The general Drone POWER is the large centered integer in the power header, ABOVE the block titled "Attributs du Drone" / "Drone Attributes", often beside a combat/power ICON without any printed power label. Read that header independently of the Drone level. An absent printed power label does NOT mean the visible header power is absent.
Return each clearly visible header-power candidate in drone.power_candidates with text (EXACT visible digits and separators), region "drone_power_header", anchor "above_drone_attributes", evidence "visible_drone_power", and confidence (your reading confidence as a number). Do not invent a power label. Preserve ungrouped large integers and integers grouped with spaces, dots or commas. NEVER convert the number into millions, a decimal fraction, a rate, or a percentage.
Do NOT use +PV/+HP, +ATQ/+ATK, +DEF values in the attributes block, percentages, resource counters, experience/progression fractions, the Drone level, or upgrade requirements as power. If reading several numeric zones, only designate the centered power header as drone_power_header; do not relocate another number there. If header digits are ambiguous, omit the candidate rather than guess.
For combat_boost ONLY, read the visible boost level as boostCombat.level, not drone.level. A clearly labelled Drone power on other classified sub-screens may use the backwards-compatible drone.power_raw, power_label (exact printed label), power_evidence "visible_drone_power", and power_confidence. Do not claim an Attributes header anchor on those screens.
On components and skill_chip, do not report the general Drone level from any component/chip/boost level. Never copy levels between sub-screens. Return ONE JSON object with screen_type, screen_title and ONLY fields actually visible; omit unreadable fields. No example/default level or power values are supplied or permitted.`;
  if(scanType==="exclusive")return `${common} This is an exclusive-weapon detail screen from Last War. The layout and language may vary (for example Arme exclusive / Exclusive Weapon / Arma exclusiva, and Lv., Lvl., Level, Niv. or Niveau). Read only text and numbers that are actually visible.

Identify the hero when the hero name is visible or clearly attached to the weapon screen (for example DVA or D.V.A.). Identify the exact visible exclusive-weapon name/type when present (for example "Lame de Frappe DVA"). Most importantly, read the weapon level shown next to the level marker, such as "Lv.26", and return it as the number 26. Do not confuse the hero level, skill level, star count, or another number with the weapon level.

Return one JSON object, allowing a partial but valid result: {"exclusive_weapons":[{"hero_name":string,"weapon_name":string,"level":number,"power":number|string,"power_raw":string,"hero_hp_bonus":number,"hero_atk_bonus":number,"hero_def_bonus":number,"all_damage_resistance_pct":number,"max_skill_level":number}]}. Omit any field that is absent, cropped, unreadable, or uncertain; never use null, zero, or a guess to fill a missing field. If a visible power cannot be safely converted, preserve its exact visible text in power_raw and omit power. Secondary statistics are optional and must not prevent returning the hero, weapon name, or visible level. The array may contain one item for this screen. Weapon power, if visible, is the full integer, not millions.`;
  if(scanType==="awakening")return `${common} Return visible Awakening data only as {"hero_progression":[{"hero_name":string,"stars":number,"exclusive":number,"awakening":{"unlocked":boolean,"stars":number,"skill_level":number,"named_shards":number,"universal_shards":number,"trial_complete":boolean,"in_base":boolean,"power":number,"reshape_stage":number,"reshape_value":number}}]}.`;
  if(scanType==="shop")return `${common} Return visible shop data only as {"shop":{"store_type":string,"currency":string,"currency_balance":number,"vip_level":number,"vip_days_remaining":number,"offers":[{"item_name":string,"quantity":number,"price":number,"currency":string,"limit":string,"discount_pct":number,"category":string,"rarity":string,"contents":string,"offer_kind":string,"sold":boolean,"content_verified":boolean,"cost_gain_verified":boolean,"price_confidence":number,"currency_confidence":number}]}}. Preserve visible limit and sold-out text; do not infer remaining stock from an ambiguous limit. When the visible item is clearly an Ammo Bonanza or Bullseye Loot ammo pack, use category "event_ammo" and read its exact displayed payment currency, price and limit. Preserve contents only when readable; do not treat a displayed discount as proof of value. Do not invent hidden offers or prices.`;
  if(scanType==="vs")return `${common} Return visible Alliance Duel data only as {"vs":{"theme":string,"time_remaining_text":string,"time_remaining_seconds":number,"our_server_id":string,"our_tag":string,"our_alliance":string,"opponent_server_id":string,"opponent_tag":string,"opponent":string,"our_score":number,"their_score":number,"our_percent":number,"their_percent":number,"personal_name":string,"personal_rank":number,"personal_score":number,"leaderboard":[{"rank":number,"alliance_tag":string,"player_name":string,"score":number}]}}. Read the active theme/day when visible; do not infer a fixed VS schedule if it is not visible.`;
  if(scanType==="technology")return `${common} This scan contains one or more overlapping screenshots of the Last War Technology Center. Read each card independently from its own printed title and the value/state visibly attached to that same card. The screenshots may overlap: emit an identical card observation only once. If the same named card has conflicting visible values or states across screenshots, return BOTH observations; never choose one silently. Return only {"technology":{"cards":[{"name":"exact visible card title","name_evidence":"visible_text","name_confidence":0.0,"percent":"exact visible text including % when shown","state":"percent|max|locked|unknown","value_evidence":"same_card only when this numeric percentage is visibly on this card","value_confidence":0.0,"state_evidence":"same_card when the explicit max/locked text or lock state belongs to this card","state_confidence":0.0,"prerequisite":"visible text only if locked","prerequisite_evidence":"visible_text only if readable"}]}}. A percent requires value_evidence "same_card" and value_confidence at least 0.9. An explicit text state "max" or "locked" is valid without any number or numeric value_evidence, but only when visibly attached to the same card as its reliable title; mark state_evidence "same_card" and confidence at least 0.9. Use state "max" ONLY when "Niveau Max" or its translation is printed; never invent 100%. Use "locked" only for an explicit visible lock state, never invent 0%. A printed 0% IS a valid percent. Preserve readable prerequisites only when they are shown in the capture. If a name or value is unreadable, keep the visible partial name and use "unknown", never guess a branch. Do not return season data or generic legacy categories (type_mastery_pct, hero_tech_pct, siege_to_seize_pct, defensive_fortification_pct or tactical_weapon_pct).`;
  if(scanType==="season")return `${common} Return visible season and/or technology facts only. Either object may be omitted when not visible. On Technology screens, read EACH CARD'S PRINTED NAME FIRST, and associate ONLY that card's own percentage or state with that name. Never associate by position, adjacent card, icon, or category guess. Return {"technology":{"cards":[{"name":"exact visible card title","name_evidence":"visible_text","name_confidence":0.0,"percent":"exact visible text including % when shown","state":"percent|max|locked|unknown","value_evidence":"same_card only when this numeric percentage is visibly on this card","value_confidence":0.0,"state_evidence":"same_card when the explicit max/locked text or lock state belongs to this card","state_confidence":0.0,"prerequisite":"visible text only if locked","prerequisite_evidence":"visible_text only if readable"}]}}. A percent requires value_evidence "same_card" and value_confidence at least 0.9. An explicit text state "max" or "locked" is valid without any number or numeric value_evidence, but only when the state is visibly attached to the same card as its reliable title; mark state_evidence "same_card" and confidence at least 0.9 when available. Use state "max" ONLY when "Niveau Max" or its translation is printed; do not invent 100%. Use "locked" only for an explicit visible lock state, never invent 0%. A printed 0% IS a valid percent. If a name or value is unreadable, keep the visible partial name and use "unknown", never guess a branch. Do not output generic legacy category keys (type_mastery_pct, hero_tech_pct, siege_to_seize_pct, defensive_fortification_pct or tactical_weapon_pct). Technology and season can occur separately. For a Season screen, return {"season":{"name":string,"number":number,"day":number,"total_days":number,"profession":string,"progress_pct":number,"resistance":number,"focus":string,"crystal_event_eligible":boolean,"lifecycle":"active|ended|interseason"}} with only visible facts. Set crystal_event_eligible only when visibly confirmed.`;
   if(scanType==="secret_mobile_squad")return `${common} Read the Secret Mobile Squad screen. Return only Special Supplementary Task labels whose text is visibly printed. Keep the exact visible wording and language; accept the newer text-label layout and older layouts without assuming a task name from an icon, reward, position, or game guide. If a label is partially readable, preserve the visible text. If no task text is visible, omit that row; never invent or normalize an unknown task. Return {"special_supplementary_tasks":[{"label":"exact visible task text","label_evidence":"visible_text","confidence":0.0}]}. WarBoost will retain the exact text as unmapped and require owner confirmation before saving.`;
  return common;
}
export async function openaiVision({image,images,scanType,locale,allianceTag}){
  const key=env("OPENAI_API_KEY");if(!key)return null;
  const model=env("WARBOOST_VISION_MODEL")||"gpt-5.6-luna";
  const content=[{type:"input_text",text:promptFor(scanType,locale,allianceTag)},...(Array.isArray(images)&&images.length?images:[image]).map(imageUrl=>({type:"input_image",image_url:imageUrl,detail:"high"}))];
  const r=await fetchWithTimeout("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify({model,reasoning:{effort:"none"},max_output_tokens:5000,input:[{role:"user",content}]})},REQUEST_TIMEOUT_MS,{code:"VISION_TIMEOUT",message:"WarBoost Vision timed out"});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j?.error?.message||`Vision HTTP ${r.status}`),{status:r.status,code:j?.error?.code||"VISION_HTTP_ERROR"});
  return jsonFromText(textFromResponse(j));
}
async function customVision({image,images,scanType,locale,verifiedContext}){
  const url=env("WARBOOST_VISION_ENDPOINT");if(!url)return null;
  const secret=env("WARBOOST_VISION_SECRET"),r=await fetchWithTimeout(url,{method:"POST",headers:{"content-type":"application/json",...(secret?{"x-warboost-vision-secret":secret}:{})},body:JSON.stringify({image_data_url:image,image_data_urls:images,scan_type:scanType,locale,current_state:verifiedContext})},REQUEST_TIMEOUT_MS,{code:"VISION_TIMEOUT",message:"WarBoost custom Vision timed out"});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j?.message||`Vision HTTP ${r.status}`),{status:r.status,code:"VISION_HTTP_ERROR"});return j?.state||j?.data||j;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  let releaseGuard=()=>{},scanTypeForLog="unknown";
  const startedAt=Date.now();
  try{
    const {user}=await requireProductUser(req,{consent:true,pro:true});
    const scanType=String(req.body?.scan_type||"profile").toLowerCase(),locale=String(req.body?.locale||"fr"),currentState=req.body?.current_state&&typeof req.body.current_state==="object"?req.body.current_state:null;
    const scanTypeValid=/^(profile|squad[1-4]|drone|exclusive|awakening|shop|vs|season|technology|alliance_roster|secret_mobile_squad)$/.test(scanType);
    scanTypeForLog=scanTypeValid?scanType:"invalid";
    if(!scanTypeValid)return res.status(400).json({error:"invalid_scan_type",message:"Type d’analyse invalide."});
    const verifiedContext=verifiedRosterContext(scanType,currentState,user),allianceTag=verifiedContext?.alliance?.tag||"";
    const imageBatch=validateScanImageBatch(scanType,req.body);
    if(!imageBatch.ok)return res.status(imageBatch.status).json({error:imageBatch.error,message:imageBatch.message});
    const images=imageBatch.images;
    const image=images[0];
    const slot=scanAbuseGuard.acquire(user?.id);
    if(!slot.allowed){res.setHeader("Retry-After",String(slot.retryAfterSeconds));return res.status(429).json({error:"scan_rate_limited",code:"SCAN_RATE_LIMITED",message:"Trop d’analyses rapprochées. Réessaie dans un instant.",retry_after_seconds:slot.retryAfterSeconds})}
    releaseGuard=slot.release;
    let extracted=null,engine="openai",firstError=null;
    if(env("OPENAI_API_KEY")){try{extracted=await openaiVision({image,images,scanType,locale,allianceTag})}catch(error){firstError=error}}
    if(!extracted&&env("WARBOOST_VISION_ENDPOINT")){engine="custom";try{extracted=await customVision({image,images,scanType,locale,verifiedContext})}catch(error){if(!firstError)firstError=error}}
    if(!extracted){console.error("WarBoost scan provider unavailable",{code:safeErrorCode(firstError||{code:"SCAN_NOT_CONFIGURED"}),status:Number(firstError?.status)||503,type:scanTypeForLog,duration_ms:Math.max(0,Date.now()-startedAt)});const message=firstError?.code==="VISION_TIMEOUT"?"L’analyse a dépassé le délai. Réessaie avec la même capture.":firstError?.message||"WarBoost Vision n’est pas configuré sur ce déploiement.";return res.status(503).json({error:"scan_provider_unavailable",code:firstError?.code||"SCAN_NOT_CONFIGURED",message})}
    const now=new Date().toISOString();
    const quality={source:"screenshot_ocr",freshness:{observed_at:now,basis:"server_scan_time",screenshot_age:"unknown"},single_pass:true,requires_confirmation:true};
    if(scanType==="alliance_roster"){const rows=sanitizeRosterRows(extracted,now,allianceTag);if(!rows.length)return res.status(422).json({error:"scan_no_useful_data",message:"La liste des membres n’a pas pu être lue clairement. Garde la capture et réessaie."});return res.status(200).json({ok:true,engine,scanned_at:now,roster_rows:rows,quality:{...quality,row_count:rows.length}})}
    if(/^squad[1-4]$/i.test(scanType)&&squadCaptureScreenType(extracted)==="overview")return res.status(422).json({error:"wrong_squad_capture",code:"WRONG_SQUAD_CAPTURE",message:"Cette capture n'est pas la bonne. Dans Last War : Préréglage de Formation → Voir les Détails → prends ensuite la capture “Détails de la formation”."});
    const state=sanitize(extracted,now,scanType),droneScreenType=scanType==="drone"?classifyDroneScreen(extracted):null;
    if(!usefulState(scanType,state)){
      if(scanType==="drone"&&["components","skill_chip"].includes(droneScreenType))
        return res.status(422).json({error:"drone_no_supported_fields",drone_screen_type:droneScreenType});
      return res.status(422).json({error:"scan_no_useful_data",drone_screen_type:droneScreenType,message:"La capture est bien reçue, mais les données utiles ne sont pas assez lisibles. Garde cette capture et réessaie."});
    }
    return res.status(200).json({ok:true,engine,scanned_at:now,state,...(droneScreenType?{drone_screen_type:droneScreenType}:{}),quality:{...quality,requires_confirmation:/^squad[1-4]$/i.test(scanType)||scanType==="exclusive"||["profile","drone","awakening","shop","vs","season","technology","alliance_roster"].includes(scanType),partial_results_allowed:scanType==="exclusive",identity_enrichment_skipped:true}});
  }catch(error){console.error("WarBoost scan R2",{code:safeErrorCode(error),status:Number(error?.status)||500,type:scanTypeForLog,duration_ms:Math.max(0,Date.now()-startedAt)});return res.status(error?.status||500).json({error:"scan_failed",code:error?.code||"SCAN_FAILED",message:error?.message||"La capture n’a pas pu être analysée."})}
  finally{releaseGuard()}
}
