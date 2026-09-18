import {requireBetaUser} from "../lib/beta-access.js";
import {canonicalHeroName,catalogHeroName} from "../lib/heroes.js";
import {sanitizeGear} from "../lib/gear.js";
import {normalizeSeasonLifecycle} from "../lib/season-lifecycle.js";
import {cleanRosterOcrName,rosterIdentityKey} from "../lib/roster-identity-resolution.js";
import {fetchWithTimeout} from "../lib/http-timeout.js";
import {canonicalPowerMillions} from "../lib/power-units.js";

// HF8.6.28 R2 — stable single-pass WarBoost Vision.
// One screenshot = one bounded provider request. Optional portrait passes are deliberately
// removed from the critical path so a useful scan cannot be lost to a second AI timeout.
const REQUEST_TIMEOUT_MS=46000;
const MAX_IMAGE_DATA_URL=4_150_000;
function env(name){return String(process.env[name]||"").trim()}
function str(v,max=160){const s=String(v??"").trim();return s?s.slice(0,max):null}
function num(v){const n=Number(v);return Number.isFinite(n)?n:null}
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
function hmsSeconds(v){const m=String(v||"").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3]):null}
function rosterRole(v){const r=String(v||"").trim().toUpperCase();return /^R[1-5]$/.test(r)?r:null}
function heroNameFromVisibleText(h){
  const evidence=String(h?.name_evidence||"").toLowerCase(),confidence=Number(h?.name_confidence);
  if(evidence!=="visible_text"||!Number.isFinite(confidence)||confidence<0.88)return null;
  return catalogHeroName(h?.name)||canonicalHeroName(h?.name)||null;
}
function usefulState(scanType,state){
  const t=String(scanType||"").toLowerCase();
  if(t==="profile")return Boolean(state?.player&&Object.keys(state.player).some(k=>k!=="updated_at"));
  if(t==="drone")return Boolean(state?.drone&&(state.drone.level!=null||state.drone.power_m!=null));
  const sm=t.match(/^squad([1-4])$/);if(sm){const q=state?.squads?.[Number(sm[1])-1];return Boolean(q&&(q.power!=null||(q.heroes||[]).some(h=>Object.keys(h||{}).length)))}
  if(t==="exclusive")return Boolean(state?.exclusive_weapons?.length);
  if(t==="awakening")return Boolean(state?.hero_progression?.length);
  if(t==="shop")return Boolean(state?.shop&&Object.keys(state.shop).some(k=>k!=="updated_at"));
  if(t==="vs")return Boolean(state?.vs&&Object.keys(state.vs).some(k=>!["updated_at","source"].includes(k)));
  if(t==="season")return Boolean(state?.season&&Object.keys(state.season).some(k=>k!=="updated_at")||state?.technology&&Object.keys(state.technology).some(k=>k!=="updated_at"));
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
  const role=rosterRole(raw?.role||raw?.rank);
  const hq=safeRosterHq(raw?.hq_level??raw?.hq);
  const power=canonicalPowerMillions(raw?.power_m??raw?.power);
  const confidence=num(raw?.confidence);
  const key=rosterIdentityKey(name,allianceTag);
  if(!name||!role||!key)return null;

  // Individual profile guard: alliance display name must never become the player nickname.
  const allianceName=profileContext?.alliance_name||raw?.alliance_name||"";
  if(allianceName&&normalizedLooseText(name)===normalizedLooseText(allianceName))return null;

  return {
    name,
    role,
    hq_level:hq,
    power_m:power!=null&&power>0?Math.round(power*100)/100:null,
    confidence:confidence==null?null:Math.max(0,Math.min(1,confidence)),
    updated_at:now,
    source:"roster_scan"
  };
}
function sanitizeRosterRows(extracted,now,allianceTag=""){
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
function sanitize(extracted,now,scanType){
  const out={},forced=String(scanType||"").match(/^squad([1-4])$/i),forcedId=forced?Number(forced[1]):null;
  if(extracted?.player){const p={updated_at:now};for(const k of ["name","server_id","coordinates","role"]){const v=str(extracted.player[k],80);if(v)p[k]=v}const hq=num(extracted.player.hq_level),power=canonicalPowerMillions(extracted.player.power_m);if(hq!=null)p.hq_level=hq;if(power!=null)p.power_m=power;if(Object.keys(p).length>1)out.player=p}
  if(extracted?.drone){const d={updated_at:now},level=num(extracted.drone.level),power=canonicalPowerMillions(extracted.drone.power_m);if(level!=null)d.level=level;if(power!=null)d.power_m=power;if(Object.keys(d).length>1)out.drone=d}
  if(Array.isArray(extracted?.squads)&&extracted.squads.length){const arr=Array(4).fill(null),source=forcedId?extracted.squads.slice(0,1):extracted.squads.slice(0,4);for(const raw of source){const id=forcedId||Math.max(1,Math.min(4,Number(raw?.id)||1)),q={id,name:`Squad ${id}`,updated_at:now};const power=canonicalPowerMillions(raw?.power_m??raw?.power);if(power!=null)q.power=power;if(Array.isArray(raw?.heroes)){q.heroes=Array.from({length:5},(_,i)=>{const h=raw.heroes[i]||{},x={};const name=heroNameFromVisibleText(h);if(name)x.name=name;for(const k of ["level","stars","power"]){const v=num(h?.[k]);if(v!=null)x[k]=v}const ex=str(h?.exclusive,100);if(ex)x.exclusive=ex;const gear=sanitizeGear(h?.gear);if(gear)x.gear=gear;return x})}else if(forcedId)q.heroes=Array.from({length:5},()=>({}));arr[id-1]=q}out.squads=arr}
  const rawWeapons=Array.isArray(extracted?.exclusive_weapons)?extracted.exclusive_weapons:(extracted?.exclusive_weapon?[extracted.exclusive_weapon]:[]);if(rawWeapons.length){out.exclusive_weapons=rawWeapons.slice(0,12).map(w=>{const x={updated_at:now},hero=canonicalHeroName(w?.hero_name),weapon=str(w?.weapon_name,80);if(hero)x.hero_name=hero;if(weapon)x.weapon_name=weapon;for(const k of ["level","power","hero_hp_bonus","hero_atk_bonus","hero_def_bonus","all_damage_resistance_pct","max_skill_level"]){const v=num(w?.[k]);if(v!=null)x[k]=v}return x}).filter(x=>Object.keys(x).length>1)}
  if(extracted?.shop){const s={updated_at:now};for(const k of ["store_type","currency"]){const v=str(extracted.shop[k],80);if(v)s[k]=v}for(const k of ["currency_balance","vip_level","vip_days_remaining"]){const v=num(extracted.shop[k]);if(v!=null)s[k]=v}if(Array.isArray(extracted.shop.offers))s.offers=extracted.shop.offers.slice(0,24).map(o=>{const x={};for(const k of ["item_name","currency","limit","category","rarity"]){const v=str(o?.[k],120);if(v)x[k]=v}for(const k of ["quantity","price","discount_pct","price_confidence","currency_confidence"]){const v=num(o?.[k]);if(v!=null)x[k]=v}if(o?.sold===true)x.sold=true;else if(o?.sold===false)x.sold=false;return x}).filter(x=>x.item_name);if(Object.keys(s).length>1)out.shop=s}
  const progression=Array.isArray(extracted?.hero_progression)?extracted.hero_progression:(extracted?.awakening_hero?[extracted.awakening_hero]:[]);if(progression.length){out.hero_progression=progression.slice(0,12).map(h=>{const x={updated_at:now},name=canonicalHeroName(h?.hero_name||h?.name);if(name)x.hero_name=name;for(const k of ["stars","exclusive"]){const v=num(h?.[k]);if(v!=null)x[k]=v}if(h?.awakening&&typeof h.awakening==="object"){const a={};for(const k of ["stars","skill_level","named_shards","universal_shards","power","reshape_stage","reshape_value"]){const v=num(h.awakening[k]);if(v!=null)a[k]=v}for(const k of ["unlocked","trial_complete","in_base"]){if(typeof h.awakening[k]==="boolean")a[k]=h.awakening[k]}if(Object.keys(a).length)x.awakening=a}return x}).filter(x=>x.hero_name)}
  if(extracted?.technology){const t={updated_at:now};for(const k of ["type_mastery_pct","hero_tech_pct","siege_to_seize_pct","defensive_fortification_pct","tactical_weapon_pct"]){const v=num(extracted.technology[k]);if(v!=null)t[k]=v}if(Object.keys(t).length>1)out.technology=t}
  if(extracted?.alliance){const a={updated_at:now};for(const k of ["tag","name","role"]){const v=str(extracted.alliance[k],80);if(v)a[k]=k==="tag"?v.toUpperCase():v}if(Object.keys(a).length>1)out.alliance=a}
  if(extracted?.vs){const v={updated_at:now,source:"scan"};for(const k of ["week","day","our_score","their_score","our_percent","their_percent","personal_rank","personal_score","time_remaining_seconds"]){const n=num(extracted.vs[k]);if(n!=null)v[k]=n}for(const k of ["theme","opponent","our_alliance","our_server_id","opponent_server_id","personal_name","time_remaining_text"]){const s=str(extracted.vs[k],160);if(s)v[k]=s}for(const k of ["our_tag","opponent_tag"]){const s=str(extracted.vs[k],24);if(s)v[k]=s.replace(/[\[\]]/g,"").toUpperCase()}if(v.time_remaining_seconds==null&&v.time_remaining_text){const sec=hmsSeconds(v.time_remaining_text);if(sec!=null)v.time_remaining_seconds=sec}if(v.our_score!=null&&v.their_score!=null)v.score_confirmed=true;if(Array.isArray(extracted.vs.leaderboard))v.leaderboard=extracted.vs.leaderboard.slice(0,10).map(r=>({rank:num(r?.rank),alliance_tag:str(r?.alliance_tag,24),player_name:str(r?.player_name||r?.name,80),score:num(r?.score)})).filter(r=>r.player_name||r.rank!=null);if(Object.keys(v).length>2)out.vs=v}
  if(extracted?.season){const s={updated_at:now};for(const k of ["name","profession","focus"]){const v=str(extracted.season[k],80);if(v)s[k]=v}const life=normalizeSeasonLifecycle(extracted.season.lifecycle||extracted.season.status);if(life&&life!=="unknown"){s.lifecycle=life;s.lifecycle_source="scan"}for(const k of ["number","day","total_days","progress_pct","resistance"]){const v=num(extracted.season[k]);if(v!=null)s[k]=v}if(Object.keys(s).length>1)out.season=s}
  return out;
}
function promptFor(scanType,locale,allianceTag){
  const common=`You are WarBoost Vision reading a Last War: Survival screenshot. Read only facts actually visible in the image. Never invent hidden values. User locale: ${locale}. Return ONE valid JSON object only, without markdown or commentary.`;
  if(scanType==="alliance_roster")return `${common} This WarBoost action accepts TWO Last War layouts: (A) the alliance member list, or (B) an individual screen titled "PROFIL DU JOUEUR" / "PLAYER PROFILE". First identify the layout.

For an ALLIANCE MEMBER LIST, return exactly {"screen_type":"member_list","alliance_roster":[{"name":string,"role":"R1|R2|R3|R4|R5","hq_level":number,"power_m":number,"confidence":number}]}. Include only rows visibly present. Include the R5 if visibly shown separately above the R4/R3/R2/R1 lists.

For an INDIVIDUAL PLAYER PROFILE, return exactly {"screen_type":"player_profile","player_profile":{"name":string,"role":"R1|R2|R3|R4|R5","hq_level":number,"power_m":number,"alliance_tag":string,"alliance_name":string,"server_id":string,"confidence":number}} and NO alliance_roster array. On this layout:
- The PLAYER NICKNAME is in the TOP BLUE HEADER, immediately after the player's "Niv.XX" and optional alliance tag. Example: "Niv.35 [ALL4]Space commander" means nickname "Space commander" and HQ/QG 35.
- The HQ/QG is ONLY the "Niv.XX" in that same top header immediately before the nickname.
- NEVER use another level shown elsewhere on the profile as HQ/QG. A value such as "Niv.100" beside another icon/stat is NOT the QG.
- The account POWER is the large value ending in M beside the power/combat icon. Example: 216.8M -> 216.8.
- The member ROLE is the visible R1/R2/R3/R4/R5 badge associated with the alliance membership row.
- The ALLIANCE DISPLAY NAME is separate, often on a row such as "[ALL4]ALL FOR 1". It is NEVER the player's nickname.
- A visible "#884" means server_id "884".
- If nickname or role cannot be clearly distinguished from the alliance name, omit the player instead of guessing.

Alliance tag expected from WarBoost context is ${allianceTag||"unknown"}. A leading [${allianceTag||"TAG"}] decoration is not part of the nickname when it matches that alliance tag. Preserve genuine nickname characters, spaces and trailing digits. Power ending in M is numeric millions. Never infer hidden members, departures, ranks, HQ values or power.`;
  if(/^squad[1-4]$/i.test(scanType)){const id=Number(scanType.slice(-1));return `${common} This is Squad ${id}. Focus on the formation/detail panel in the screenshot. Return {"squads":[{"id":${id},"power":number,"heroes":[{"name":string,"name_evidence":"visible_text","name_confidence":number,"level":number,"stars":number,"power":number,"exclusive":string,"gear":string}]}]}. Squad power must be expressed in millions: return 34.29 for a visible 34.29M, never 34290000. Read all 5 hero rows/cards. Hero name is allowed ONLY if the name itself is readable text; do not guess a portrait identity. Read the squad power and every clearly visible level, stars, hero power, exclusive level/text and gear. For gear use count=4;levels=L1,L2,L3,L4;rarity=... when visible. Lv.0 is real data.`}
  if(scanType==="profile")return `${common} Return visible player/account data only as {"player":{"name":string,"server_id":string,"hq_level":number,"power_m":number,"coordinates":string,"role":string},"alliance":{"tag":string,"name":string,"role":string}}.`;
  if(scanType==="drone")return `${common} Return visible drone data only as {"drone":{"level":number,"power_m":number}}.`;
  if(scanType==="exclusive")return `${common} Return visible exclusive weapon data as {"exclusive_weapons":[{"hero_name":string,"weapon_name":string,"level":number,"power":number,"hero_hp_bonus":number,"hero_atk_bonus":number,"hero_def_bonus":number,"all_damage_resistance_pct":number,"max_skill_level":number}]}. Weapon power is the full integer, not millions.`;
  if(scanType==="awakening")return `${common} Return visible Awakening data only as {"hero_progression":[{"hero_name":string,"stars":number,"exclusive":number,"awakening":{"unlocked":boolean,"stars":number,"skill_level":number,"named_shards":number,"universal_shards":number,"trial_complete":boolean,"in_base":boolean,"power":number,"reshape_stage":number,"reshape_value":number}}]}.`;
  if(scanType==="shop")return `${common} Return visible shop data only as {"shop":{"store_type":string,"currency":string,"currency_balance":number,"vip_level":number,"vip_days_remaining":number,"offers":[{"item_name":string,"quantity":number,"price":number,"currency":string,"limit":string,"discount_pct":number,"category":string,"rarity":string,"sold":boolean,"price_confidence":number,"currency_confidence":number}]}}. Do not invent hidden offers or prices.`;
  if(scanType==="vs")return `${common} Return visible Alliance Duel data only as {"vs":{"theme":string,"time_remaining_text":string,"time_remaining_seconds":number,"our_server_id":string,"our_tag":string,"our_alliance":string,"opponent_server_id":string,"opponent_tag":string,"opponent":string,"our_score":number,"their_score":number,"our_percent":number,"their_percent":number,"personal_name":string,"personal_rank":number,"personal_score":number,"leaderboard":[{"rank":number,"alliance_tag":string,"player_name":string,"score":number}]}}.`;
  if(scanType==="season")return `${common} Return visible season/technology facts only as {"season":{"name":string,"number":number,"day":number,"total_days":number,"profession":string,"progress_pct":number,"resistance":number,"focus":string,"lifecycle":"active|ended|interseason"},"technology":{"type_mastery_pct":number,"hero_tech_pct":number,"siege_to_seize_pct":number,"defensive_fortification_pct":number,"tactical_weapon_pct":number}}.`;
  return common;
}
async function openaiVision({image,scanType,locale,allianceTag}){
  const key=env("OPENAI_API_KEY");if(!key)return null;
  const model=env("WARBOOST_VISION_MODEL")||"gpt-5.6-luna";
  const r=await fetchWithTimeout("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify({model,reasoning:{effort:"none"},max_output_tokens:5000,input:[{role:"user",content:[{type:"input_text",text:promptFor(scanType,locale,allianceTag)},{type:"input_image",image_url:image,detail:"high"}]}]})},REQUEST_TIMEOUT_MS,{code:"VISION_TIMEOUT",message:"WarBoost Vision timed out"});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j?.error?.message||`Vision HTTP ${r.status}`),{status:r.status,code:j?.error?.code||"VISION_HTTP_ERROR"});
  return jsonFromText(textFromResponse(j));
}
async function customVision({image,scanType,locale,currentState}){
  const url=env("WARBOOST_VISION_ENDPOINT");if(!url)return null;
  const secret=env("WARBOOST_VISION_SECRET"),r=await fetchWithTimeout(url,{method:"POST",headers:{"content-type":"application/json",...(secret?{"x-warboost-vision-secret":secret}:{})},body:JSON.stringify({image_data_url:image,scan_type:scanType,locale,current_state:currentState})},REQUEST_TIMEOUT_MS,{code:"VISION_TIMEOUT",message:"WarBoost custom Vision timed out"});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j?.message||`Vision HTTP ${r.status}`),{status:r.status});return j?.state||j?.data||j;
}
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{
    await requireBetaUser(req,{consent:true});
    const image=String(req.body?.image_data_url||""),scanType=String(req.body?.scan_type||"profile").toLowerCase(),locale=String(req.body?.locale||"fr"),currentState=req.body?.current_state&&typeof req.body.current_state==="object"?req.body.current_state:null,allianceTag=String(currentState?.alliance?.tag||"").trim().toUpperCase();
    if(!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return res.status(400).json({error:"invalid_image",message:"Image invalide."});
    if(image.length>MAX_IMAGE_DATA_URL)return res.status(413).json({error:"image_too_large",message:"Capture trop volumineuse. Choisis de nouveau la capture."});
    let extracted=null,engine="openai",firstError=null;
    if(env("OPENAI_API_KEY")){try{extracted=await openaiVision({image,scanType,locale,allianceTag})}catch(error){firstError=error}}
    if(!extracted&&env("WARBOOST_VISION_ENDPOINT")){engine="custom";try{extracted=await customVision({image,scanType,locale,currentState})}catch(error){if(!firstError)firstError=error}}
    if(!extracted){const message=firstError?.code==="VISION_TIMEOUT"?"L’analyse a dépassé le délai. Réessaie avec la même capture.":firstError?.message||"WarBoost Vision n’est pas configuré sur ce déploiement.";return res.status(503).json({error:"scan_provider_unavailable",code:firstError?.code||"SCAN_NOT_CONFIGURED",message})}
    const now=new Date().toISOString();
    if(scanType==="alliance_roster"){const rows=sanitizeRosterRows(extracted,now,allianceTag);if(!rows.length)return res.status(422).json({error:"scan_no_useful_data",message:"La liste des membres n’a pas pu être lue clairement. Garde la capture et réessaie."});return res.status(200).json({ok:true,engine,scanned_at:now,roster_rows:rows,quality:{row_count:rows.length,requires_confirmation:true,single_pass:true}})}
    const state=sanitize(extracted,now,scanType);if(!usefulState(scanType,state))return res.status(422).json({error:"scan_no_useful_data",message:"La capture est bien reçue, mais les données utiles ne sont pas assez lisibles. Garde cette capture et réessaie."});
    return res.status(200).json({ok:true,engine,scanned_at:now,state,quality:{single_pass:true,requires_confirmation:/^squad[1-4]$/i.test(scanType),identity_enrichment_skipped:true}});
  }catch(error){console.error("WarBoost scan R2",{message:error?.message,code:error?.code,status:error?.status});return res.status(error?.status||500).json({error:"scan_failed",code:error?.code||"SCAN_FAILED",message:error?.message||"La capture n’a pas pu être analysée."})}
}
