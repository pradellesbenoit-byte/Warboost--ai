import {hasExplicitSquadConfirmation,normalizeSquadSlots} from "./squad-identity.js";
import {heroType,canonicalHeroName} from "./heroes.js";
import {parseGear} from "./gear.js";

const confirmed=new Set(["confirmed_scan","confirmed_manual","owner_confirmed_scan","lastwar_scan_confirmed","owner_confirmed","manual"]);
const clone=value=>JSON.parse(JSON.stringify(value??{}));
const validDate=value=>Number.isFinite(Date.parse(value||""));
const present=value=>value!==null&&value!==undefined&&value!=="";
export function diagnosticSquadId(state={},requested){
  const id=Number(requested??state.diagnostic_squad_id??1);
  if(!Number.isInteger(id)||id<1||id>4)throw new Error("invalid_diagnostic_squad");
  return id;
}
export function confirmedField(record,key){
  return present(record?.[key])&&confirmed.has(record.field_source?.[key]||record.source);
}
export function scopedDiagnosticState(input={},requested){
  const state=clone(input),id=diagnosticSquadId(state,requested);
  const matches=(state.squads||[]).filter(row=>Number(row?.id)===id);
  // Legacy positional records are usable only when they contain no contrary ID.
  const raw=matches.length===1?matches[0]:matches.length?{}:
    (state.squads?.[id-1]?.id==null?state.squads?.[id-1]:{});
  const squad=normalizeSquadSlots(raw||{},id);
  const pendingIdentity=raw?.composition_conflict?.scan_pending?.some(item=>item?.field==="name");
  const identityConfirmed=hasExplicitSquadConfirmation(raw||{},id)&&!pendingIdentity;
  if(!identityConfirmed)squad.heroes=Array.from({length:5},()=>({name:""}));
  else squad.heroes=squad.heroes.map((hero,index)=>{
    const current=raw.heroes?.[index];
    return canonicalHeroName(current?.name)===hero.name?{...clone(current),name:hero.name}:{name:hero.name};
  });
  for(const hero of squad.heroes||[]){
    for(const key of ["level","stars","power","gear","exclusive","awakening"])
      if(!confirmedField(hero,key))hero[key]=null;
  }
  if(!confirmedField(squad,"power"))squad.power=null;
  state.squads=Array.from({length:4},(_,i)=>i===id-1?squad:{id:i+1,heroes:[],power:null});
  // Account-wide hero registries must never hydrate a selected formation from
  // another squad, a historical OCR record or a weapon-only capture.
  state.hero_profiles=[];state.hero_progression=[];state.exclusive_weapons=[];
  state.diagnostic_squad_id=id;
  return {state,squad,id,identityConfirmed};
}
export function applicableOfficialFacts(snapshot={},context={},now=Date.now()){
  return (snapshot.facts||[]).filter(fact=>{
    const source=(snapshot.sources||[]).find(row=>row.id===fact.source_id);
    if(source?.kind!=="official"||source.editorial!=="publisher"||source.status!=="verified")return false;
    if(fact.review_status!=="approved"||fact.confidence!=="confirmed"||!fact.evidence_verified)return false;
    if(fact.source_url!==source.url||!/^[a-f0-9]{64}$/.test(fact.approved_source_hash||"")||
      fact.approved_source_hash!==source.content_hash||String(fact.statement||"").trim().length<10)return false;
    if(!validDate(source.verified_at)||Date.parse(source.verified_at)>now)return false;
    if(!validDate(fact.published_at)||!validDate(fact.verified_at)||!validDate(fact.reviewed_at))return false;
    if(Date.parse(fact.published_at)>now||Date.parse(fact.verified_at)>now||
      Date.parse(fact.reviewed_at)>now||now-Date.parse(fact.verified_at)>7*86400000)return false;
    if(fact.valid_until&&(!validDate(fact.valid_until)||Date.parse(fact.valid_until)<now))return false;
    const scope=fact.scope;
    if(!scope||!["global","region"].includes(scope.kind))return false;
    if(scope.kind==="region"&&(!context.region||scope.region!==context.region))return false;
    if(scope.server!=null&&String(scope.server)!==String(context.server??""))return false;
    if(scope.season!=null&&Number(scope.season)!==Number(context.season))return false;
    if(scope.version!=null&&scope.version!==context.version)return false;
    if(scope.squad_type!=null&&scope.squad_type!==context.squad_type)return false;
    if(scope.hq_min!=null&&(!Number.isFinite(context.hq)||context.hq<scope.hq_min))return false;
    if(fact.hero&&!context.heroes?.includes(canonicalHeroName(fact.hero)))return false;
    return ["level","stars","gear","exclusive","drone","technology"].includes(fact.topic);
  });
}
export function buildKnowledgeGuidance(input,snapshot={},requested,{now=Date.now()}={}){
  const scoped=scopedDiagnosticState(input,requested),{state,squad,id,identityConfirmed}=scoped;
  const heroes=(squad.heroes||[]).filter(row=>row.name);
  const player=state.player||{};
  const context={heroes:heroes.map(row=>row.name),region:player.region,server:player.server,
    version:player.game_version,season:state.season?.status==="active"?state.season.number:null,
    hq:confirmedField(player,"hq_level")||confirmed.has(player.hq_level_source)?Number(player.hq_level):null};
  const types=new Set(heroes.map(hero=>heroType(hero.name)).filter(Boolean));
  context.squad_type=heroes.length===5&&types.size===1?[...types][0]:null;
  const facts=applicableOfficialFacts(snapshot,context,now),candidates=[],missing=[];
  const add=(topic,target,used,impact=1)=>{
    const relevant=facts.filter(fact=>fact.topic===topic&&(!fact.hero||canonicalHeroName(fact.hero)===target));
    candidates.push({topic,target,used_data:used,impact:impact+(relevant.length?1:0),
      cost:"verify_in_game",confidence:"medium",source_confidence:relevant.length?"high":"unknown",
      data_confidence:"owner_confirmed",ranking_confidence:"medium",
      basis:relevant.length?"official_notice_and_confirmed_player_data":"relative_player_bottleneck_hypothesis",
      evidence:relevant.map(fact=>({id:fact.id,url:fact.source_url,published_at:fact.published_at,
        verified_at:fact.verified_at,scope:fact.scope,statement:fact.statement})),
      prerequisite:"check_current_cost_and_resources",exact_gain:null,exact_price:null});
  };
  for(const key of ["level","stars","exclusive"]){
    const known=heroes.filter(hero=>confirmedField(hero,key)&&Number.isFinite(Number(hero[key])));
    if(known.length<heroes.length)missing.push(key);
    if(known.length){
      const sorted=known.slice().sort((a,b)=>Number(a[key])-Number(b[key]));
      const low=sorted[0],high=sorted.at(-1);
      // Relative gaps only. No assumed max level, stars, exclusive breakpoint,
      // hero popularity or gain forecast determines this ranking.
      if(Number(low[key])<Number(high[key]))add(key,low.name,[{
        field:key,value:low[key],confirmed_at:low.field_updated_at?.[key]||null,
        comparison:{hero:high.name,value:high[key]}}],key==="stars"?3:2);
    }
  }
  for(const hero of heroes){
    const gear=confirmedField(hero,"gear")?parseGear(hero.gear):null;
    const levels=(gear?.segments||[]).flatMap(piece=>piece.levels?.length?piece.levels:
      piece.level!==null&&piece.level!==undefined?[piece.level]:[]);
    if(!levels.length){missing.push(`gear:${hero.name}`);continue}
    const min=Math.min(...levels),max=Math.max(...levels);
    if(min<max)add("gear",hero.name,[{field:"gear",value:hero.gear,
      confirmed_at:hero.field_updated_at?.gear||null}],3);
  }
  // Drone/technology are account context, never inferred from hero screenshots.
  for(const topic of ["drone","technology"]){
    const record=state[topic];
    if(!record||!confirmed.has(record.source)){missing.push(topic);continue}
    const values=Object.fromEntries(Object.entries(record).filter(([key,value])=>
      /^(level|power|stage|parts_level|percent|name|status)$/.test(key)&&
      (typeof value==="number"||typeof value==="string")));
    if(facts.some(fact=>fact.topic===topic))add(topic,null,[{field:topic,value:values,
      confirmed_at:record.updated_at||null}],1);
  }
  if(!identityConfirmed)missing.push("formation_identity");
  if(!context.hq)missing.push("hq");
  const recommendations=candidates.sort((a,b)=>b.impact-a.impact||
    a.topic.localeCompare(b.topic)||String(a.target).localeCompare(String(b.target))).slice(0,3);
  const lastScan=squad.last_confirmed_scan_at||squad.composition_conflict?.scan_evidence?.reviewed_at||null;
  return {squad_id:id,last_scan_used:lastScan,last_identity_confirmation:squad.composition_confirmed_at||null,
    knowledge_revision:snapshot.revision||null,knowledge_checked_at:snapshot.last_attempt_at||snapshot.verified_at||null,
    knowledge_verified_at:snapshot.verified_at||null,
    applicable_facts:facts,official_rules_available:facts.length>0,missing:[...new Set(missing)],
    composition:heroes.map((hero,slot)=>({slot,name:hero.name,type:heroType(hero.name)})),
    formation_positions:"requires_explicit_front_back_evidence",recommendations,
    resources:confirmed.has(state.resources?.source)?Object.fromEntries(Object.entries(state.resources)
      .filter(([key,value])=>/^[a-z_]{1,40}$/.test(key)&&typeof value==="number"&&Number.isFinite(value)&&value>=0)):null,
    purchase_recommended:false,
    seven_day_plan:Array.from({length:7},(_,i)=>({day:i+1,
      phase:i===0?"confirm_missing_data":i<4?"review_priority_and_in_game_cost":"recheck_confirmed_progress",
      priority:i>0&&i<4?recommendations[i-1]||null:null,automatic_spend:false})),
    discoveries:(snapshot.discoveries||[]).map(({title,url,published_at,review_status})=>({title,url,published_at,review_status})),
    sources:(snapshot.sources||[]).map(({id,url,kind,status,verified_at,published_at})=>({id,url,kind,status,verified_at,published_at}))};
}
