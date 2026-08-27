import {canonicalHeroName,heroType} from './heroes.js';

export const S6_AWAKENING_HEROES=Object.freeze({Kimberly:'tank',DVA:'aircraft',Tesla:'missile'});
export const S6_AWAKENING_MIN_STARS=5;
export const S6_AWAKENING_MIN_EX=20;
export const S6_AWAKENING_UNLOCK_SHARDS=50;

function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function bool(v){return v===true?true:v===false?false:null}
function clean(v){return String(v??'').trim()}
function heroName(h){return canonicalHeroName(h?.name||h?.hero_name||'')}
function weaponLevelFor(name,weapons=[]){const key=canonicalHeroName(name).toLowerCase();const row=(weapons||[]).find(w=>canonicalHeroName(w?.hero_name).toLowerCase()===key);const direct=num(row?.level);if(direct!==null)return direct;const raw=clean(row?.exclusive||'');const m=raw.match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null}
function heroExLevel(h,weapons=[]){const byWeapon=weaponLevelFor(heroName(h),weapons);if(byWeapon!==null)return byWeapon;const raw=h?.exclusive;const n=num(raw);if(n!==null)return n;const m=clean(raw).match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null}
function awakeningBlock(h={}){const a=h?.awakening&&typeof h.awakening==='object'?h.awakening:{};return {
  unlocked:bool(a.unlocked??h.awakening_unlocked),
  stars:num(a.stars??h.awakening_stars),
  skill_level:num(a.skill_level??h.awakening_skill_level),
  named_shards:num(a.named_shards??a.specific_shards??h.awakening_shards),
  universal_shards:num(a.universal_shards??h.universal_awakening_shards),
  trial_complete:bool(a.trial_complete??h.awakening_trial_complete),
  in_base:bool(a.in_base??h.in_base),
  power:num(a.power??h.awakening_power),
  reshape_stage:num(a.reshape_stage??h.reshape_stage),
  reshape_value:num(a.reshape_value??h.reshape_value)
}}

export function formationBonusPct(heroes=[]){
  const counts={tank:0,aircraft:0,missile:0};
  for(const h of heroes){const t=heroType(heroName(h));if(t)counts[t]++}
  const values=Object.values(counts).sort((a,b)=>b-a),top=values[0]||0,second=values[1]||0;
  if(top>=5)return 20;
  if(top===4)return 15;
  if(top===3&&second>=2)return 10;
  if(top===3)return 5;
  return 0;
}

export function mainSquadType(heroes=[]){
  const counts={tank:0,aircraft:0,missile:0};
  for(const h of heroes){const t=heroType(heroName(h));if(t)counts[t]++}
  const row=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return row&&row[1]>=3?row[0]:null;
}

export function awakeningReadiness(hero,weapons=[],season={}){
  const name=heroName(hero),eligibleType=S6_AWAKENING_HEROES[name]||null,a=awakeningBlock(hero),stars=num(hero?.stars),ex=heroExLevel(hero,weapons),inSeason6=Number(season?.number)===6;
  const shardsKnown=a.named_shards!==null,trialKnown=a.trial_complete!==null;
  const checks={
    eligible:Boolean(eligibleType),
    season6:inSeason6,
    stars:{known:stars!==null,ok:stars!==null&&stars>=S6_AWAKENING_MIN_STARS,value:stars},
    exclusive:{known:ex!==null,ok:ex!==null&&ex>=S6_AWAKENING_MIN_EX,value:ex},
    named_shards:{known:shardsKnown,ok:shardsKnown&&a.named_shards>=S6_AWAKENING_UNLOCK_SHARDS,value:a.named_shards},
    trial:{known:trialKnown,ok:trialKnown?a.trial_complete:true,value:a.trial_complete}
  };
  const hardReady=checks.eligible&&checks.stars.ok&&checks.exclusive.ok&&(!checks.named_shards.known||checks.named_shards.ok)&&(!checks.trial.known||checks.trial.ok);
  const unlockConfirmed=a.unlocked===true;
  const blockers=[];
  if(!checks.eligible)blockers.push('not_s6_awakening_hero');
  if(checks.stars.known&&!checks.stars.ok)blockers.push('stars_below_5');
  if(checks.exclusive.known&&!checks.exclusive.ok)blockers.push('exclusive_below_20');
  if(checks.named_shards.known&&!checks.named_shards.ok)blockers.push('named_shards_below_50');
  if(checks.trial.known&&!checks.trial.ok)blockers.push('trial_incomplete');
  return {name,eligible_type:eligibleType,awakening:a,checks,hard_ready:hardReady,unlock_confirmed:unlockConfirmed,blockers};
}

function clamp(n,min=0,max=100){return Math.max(min,Math.min(max,n))}
export function awakeningDecisionScore({hero,weapons=[],season={},mainType=null,formationBonus=0,importance=1}={}){
  const r=awakeningReadiness(hero,weapons,season);if(!r.checks.eligible)return null;
  let score=70;
  if(mainType&&r.eligible_type===mainType)score+=14;else if(mainType)score-=12;
  score+=Math.max(-6,Math.min(8,((Number(importance)||1)-1)*40));
  if(formationBonus>=20)score+=4;else if(formationBonus<15)score-=5;
  if(r.unlock_confirmed)score+=8;
  else {
    if(r.checks.stars.ok)score+=5;else if(r.checks.stars.known)score-=14;
    if(r.checks.exclusive.ok)score+=8;else if(r.checks.exclusive.known)score-=18;
    if(r.checks.named_shards.ok)score+=8;else if(r.checks.named_shards.known)score-=12;else score-=2;
    if(r.checks.trial.known&&!r.checks.trial.ok)score-=6;
  }
  const astars=r.awakening.stars;if(astars!==null)score+=Math.min(10,astars*2);
  return clamp(Math.round(score));
}

export function heroReshapeDecisionValue({hero,weapons=[],season={},mainType=null,formationBonus=0,importance=1}={}){
  const readiness=awakeningReadiness(hero,weapons,season),score=awakeningDecisionScore({hero,weapons,season,mainType,formationBonus,importance});
  if(score===null)return null;
  // Decision index only. WarBoost never invents an exact post-Awakening combat power value.
  const observedPower=num(readiness.awakening.power),reshapeObserved=num(readiness.awakening.reshape_value);
  return {
    hero:readiness.name,
    decision_value_index:score,
    observed_awakening_power:observedPower,
    observed_reshape_value:reshapeObserved,
    exact_power_projected:false,
    model:'relative-decision-value-only',
    readiness
  };
}

function techPct(technology={},keys=[]){for(const k of keys){const n=num(technology?.[k]);if(n!==null)return Math.max(0,Math.min(100,n))}return null}
export function season6TechPriorities(technology={},context={}){
  const rows=[
    {key:'type_mastery',label:'Type Mastery',pct:techPct(technology,['type_mastery_pct','mastery_pct']),base:100},
    {key:'hero_tech',label:'Hero Tech',pct:techPct(technology,['hero_tech_pct','hero_pct']),base:96},
    {key:'siege_to_seize',label:'Siege to Seize',pct:techPct(technology,['siege_to_seize_pct','siege_pct']),base:88},
    {key:'defensive_fortification',label:'Defensive Fortification',pct:techPct(technology,['defensive_fortification_pct','defense_fortification_pct','defense_pct']),base:88},
    {key:'tactical_weapon',label:'Tactical Weapon',pct:techPct(technology,['tactical_weapon_pct']),base:94}
  ];
  const hasAny=rows.some(r=>r.pct!==null);if(!hasAny)return {known:false,priorities:[]};
  const offense=Boolean(context?.offense||context?.city_attack||context?.siege),defense=Boolean(context?.defense||context?.garrison),out=[];
  for(const r of rows){if(r.pct===null||r.pct>=100)continue;let weight=r.base;if(r.key==='siege_to_seize'&&offense)weight+=6;if(r.key==='defensive_fortification'&&defense)weight+=6;const gap=100-r.pct;const score=clamp(Math.round(weight*.55+gap*.45));out.push({...r,score});}
  out.sort((a,b)=>b.score-a.score||a.pct-b.pct);return {known:true,priorities:out};
}

function findHeroByName(name,heroes=[]){const key=canonicalHeroName(name).toLowerCase();return (heroes||[]).find(h=>canonicalHeroName(h?.name).toLowerCase()===key)||null}
export function awakeningSwapAssessment({swap={},heroes=[],weapons=[]}={}){
  const sourceName=canonicalHeroName(swap?.source_hero||swap?.from_hero||''),targetName=canonicalHeroName(swap?.target_hero||swap?.to_hero||'');
  const source=findHeroByName(sourceName,heroes),target=findHeroByName(targetName,heroes),attempts=num(swap?.attempts_remaining),active=bool(swap?.active),warnings=[],blockers=[];
  const assess=(h,label)=>{
    if(!h){blockers.push(`${label}_hero_missing`);return null}
    const r=awakeningReadiness(h,weapons,{number:6});
    if(r.awakening.unlocked!==true)blockers.push(`${label}_awakening_not_confirmed`);
    if(!r.checks.exclusive.ok)blockers.push(`${label}_exclusive_below_20_or_unknown`);
    if(!r.checks.stars.ok)blockers.push(`${label}_stars_below_5_or_unknown`);
    if(r.awakening.in_base===false)blockers.push(`${label}_not_in_base`);
    return r;
  };
  const sr=sourceName?assess(source,'source'):null,tr=targetName?assess(target,'target'):null;
  if(attempts!==null&&attempts<=0)blockers.push('no_swap_attempt_remaining');
  if(active===false)blockers.push('swap_event_not_active');
  if(tr?.awakening?.named_shards!=null&&tr.awakening.named_shards>0)warnings.push('spend_target_specific_awakening_shards_before_swap');
  if(sr?.awakening?.named_shards!=null&&sr.awakening.named_shards>0)warnings.push('review_source_specific_awakening_shards_before_swap');
  const requirementsKnown=Boolean(sourceName&&targetName&&source&&target&&sr&&tr&&sr.awakening.unlocked!==null&&tr.awakening.unlocked!==null&&sr.checks.exclusive.known&&tr.checks.exclusive.known&&sr.checks.stars.known&&tr.checks.stars.known&&sr.awakening.in_base!==null&&tr.awakening.in_base!==null&&attempts!==null&&active!==null);
  return {source_hero:sourceName||null,target_hero:targetName||null,attempts_remaining:attempts,active,requirements_known:requirementsKnown,safe_to_swap:requirementsKnown&&blockers.length===0&&warnings.length===0,blockers,warnings,rule:'Both heroes must already have Awakening unlocked and EX20+; verify 5★, base availability and remaining attempts. Spend target-specific Awakening Shards before swapping when present.'};
}
