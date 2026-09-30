const TYPE_BRANCH={
  aircraft:"aircraft_specialization",
  tank:"tank_specialization",
  missile:"missile_specialization"
};
const KNOWN_OBJECTIVES=new Set(["auto","balanced","power","growth","pvp","pve","vs","season","t10","t11"]);

export const TECHNOLOGY_ADVICE_SOURCES=[
  {
    title:"Last War Vault — Tech Center",
    url:"https://lastwarvault.com/guides/tech-center",
    kind:"community",
    checked_on:"2026-09-30"
  },
  {
    title:"Last War Vault — Tech Center research, Season 4",
    url:"https://lastwarvault.com/guides/tech-center/season-4",
    kind:"community",
    checked_on:"2026-09-30"
  },
  {
    title:"Last War Vault — Pre-Season 1 timeline",
    url:"https://lastwarvault.com/guides/pre-season-1/timeline-guide",
    kind:"community",
    checked_on:"2026-09-30"
  }
];

function number(value){
  if(value===null||value===undefined||value==="")return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
function stateBranches(state){
  const branches=state?.technology?.branches;
  return branches&&typeof branches==="object"&&!Array.isArray(branches)?branches:{};
}
function seasonNumber(state){return number(state?.season?.number)}
function isOilEraAvailable(state){
  const observed=stateBranches(state).oil_era;
  return Boolean(observed&&["percent","max"].includes(observed.state));
}
function vsDayIsCurrent(vs,nowMs){
  const updated=Date.parse(vs?.updated_at||"");
  return Number.isFinite(updated)&&nowMs-updated>=0&&nowMs-updated<=36*60*60*1000&&
    Number(vs?.day)>=1&&Number(vs?.day)<=6;
}
function visibleBranches(state){
  const out={};
  for(const [key,row] of Object.entries(stateBranches(state))){
    if(!row||typeof row!=="object"||!["percent","max","locked"].includes(row.state))continue;
    const pct=number(row.percent);
    if(row.state==="percent"&&(pct===null||pct<0||pct>100))continue;
    out[key]={key,name:String(row.name||key).trim(),state:row.state,percent:row.state==="percent"?pct:null,
      prerequisite:String(row.prerequisite||"").trim()};
  }
  return out;
}
function candidateWeight(key,{objective,hq,season,mainType,oilAvailable,vsDay}){
  const early=hq!==null&&hq<25,nearT10=hq!==null&&hq>=25&&hq<=30;
  const endgame=hq!==null&&hq>=35;
  let weight=0,reason="technology_advice_reason_general";
  if(["auto","balanced","power"].includes(objective)){
    if(key==="development"){weight=early?88:nearT10?57:34;reason="technology_advice_reason_foundation"}
    if(key==="economy"){weight=early?74:nearT10?55:36;reason="technology_advice_reason_economy"}
    if(key==="special_forces"&&nearT10){weight=90;reason="technology_advice_reason_t10"}
    if(key==="units"){weight=early?48:34;reason="technology_advice_reason_general"}
    if(key==="heroes"){weight=endgame?55:47;reason="technology_advice_reason_heroes"}
    if(key==="team_1"){weight=endgame?62:48;reason="technology_advice_reason_main_type"}
    if(key==="tactical_weapon"){weight=endgame?57:30;reason="technology_advice_reason_main_type"}
  }
  if(objective==="growth"){
    if(key==="development"){weight=94;reason="technology_advice_reason_foundation"}
    if(key==="economy"){weight=88;reason="technology_advice_reason_economy"}
    if(key==="units")weight=35;
  }
  if(objective==="t10"){
    if(key==="special_forces"){weight=nearT10?100:hq!==null&&hq<25?82:70;reason="technology_advice_reason_t10"}
    if(key==="development")weight=Math.max(weight,nearT10?76:early?80:30);
    if(key==="economy")weight=Math.max(weight,nearT10?68:early?70:28);
  }
  if(["power","pvp","pve","vs","season","balanced","auto"].includes(objective)&&mainType&&key===TYPE_BRANCH[mainType]){
    weight=Math.max(weight,objective==="pvp"||objective==="power"?83:objective==="vs"?72:objective==="pve"?70:58);
    reason="technology_advice_reason_main_type";
  }
  if(objective==="pvp"){
    if(key==="heroes")weight=Math.max(weight,64);
    if(key==="tactical_weapon")weight=Math.max(weight,60);
    if(key==="siege_to_seize"||key==="defensive_fortification")weight=Math.max(weight,51);
    if(key==="team_1")weight=Math.max(weight,62);
    if(key==="heroes"||key==="tactical_weapon"||key==="siege_to_seize"||key==="defensive_fortification")reason="technology_advice_reason_pvp";
  }
  if(objective==="pve"){
    if(key==="heroes")weight=Math.max(weight,76);
    if(key==="units")weight=Math.max(weight,61);
    if(key==="team_1")weight=Math.max(weight,65);
    if(key==="heroes"||key==="units"||key==="team_1")reason="technology_advice_reason_pve";
  }
  if(objective==="vs"){
    if(key==="alliance_duel"){weight=vsDay===3?100:82;reason=vsDay===3?"technology_advice_reason_vs_now":"technology_advice_reason_vs"}
    if(key==="special_forces")weight=Math.max(weight,66);
    if(key==="team_1")weight=Math.max(weight,58);
  }
  if(objective==="season"){
    if(key==="special_forces"&&season!==null&&season<=2){weight=Math.max(weight,89);reason="technology_advice_reason_t10"}
    if(key==="development")weight=Math.max(weight,71);
    if(key==="economy")weight=Math.max(weight,68);
    if(key==="oil_era"&&oilAvailable){weight=Math.max(weight,86);reason="technology_advice_reason_oil"}
    if(key==="tactical_weapon")weight=Math.max(weight,58);
  }
  if(key==="oil_era"&&!oilAvailable)weight=0;
  if(key==="special_forces"&&objective!=="t10"&&!(objective==="season"&&season!==null&&season<=2))weight=Math.min(weight,objective==="vs"?66:objective==="pvp"?45:objective==="power"?48:objective==="auto"||objective==="balanced"?nearT10?90:0:0);
  if(key==="alliance_duel"&&objective!=="vs")weight=0;
  if(key==="development"&&objective==="pvp")weight=Math.max(weight,35);
  if(key==="economy"&&objective==="pvp")weight=Math.max(weight,30);
  if(key.startsWith("team_")&&key!=="team_1")weight=Math.min(weight,objective==="season"?35:objective==="balanced"?30:objective==="auto"?25:20);
  if(key==="tank_specialization"&&mainType!=="tank")weight=0;
  if(key==="missile_specialization"&&mainType!=="missile")weight=0;
  if(key==="aircraft_specialization"&&mainType!=="aircraft")weight=0;
  return {weight,reason};
}
function lockedPath(branch){
  return {
    key:branch.key,name:branch.name,prerequisite:branch.prerequisite||null,
    condition_key:branch.prerequisite?"technology_advice_locked_prerequisite":"technology_advice_locked_unknown"
  };
}

export function buildTechnologyAdvice(state={},{
  mainType=null,
  now=new Date()
}={}){
  const objectiveRaw=String(state?.player_context?.objective||"auto").toLowerCase();
  const objective=KNOWN_OBJECTIVES.has(objectiveRaw)?objectiveRaw:"auto";
  const hq=number(state?.player?.hq_level),season=seasonNumber(state);
  const vs=state?.vs||{},vsDay=vsDayIsCurrent(vs,now.getTime())?number(vs.day):null;
  const oilAvailable=isOilEraAvailable(state),branches=visibleBranches(state),typeText=String(mainType||"").toLowerCase();
  const canonicalMainType=/air/.test(typeText)?"aircraft":/missile/.test(typeText)?"missile":/tank/.test(typeText)?"tank":null;
  const locked=Object.values(branches).filter(item=>item.state==="locked").map(lockedPath).slice(0,4);
  const entries=Object.values(branches).filter(item=>item.state==="percent"&&item.percent<100);
  const context={objective,hq_level:hq,season_number:season,main_type:canonicalMainType,vs_day:vsDay,oil_era_available:oilAvailable};

  if(objective==="t11"){
    return {
      status:"separate_path",main:null,next:[],locked,preserve_key:null,
      path_key:"technology_advice_t11_route",path_name:"Armament Institute",
      data_quality:"branch_only",context,sources:TECHNOLOGY_ADVICE_SOURCES
    };
  }
  const ranked=entries.map(branch=>{
    const choice=candidateWeight(branch.key,{objective,hq,season,mainType:canonicalMainType,oilAvailable,vsDay});
    if(choice.weight<=0)return null;
    return {...branch,reason_key:choice.reason,score:choice.weight};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  const selected=ranked.slice(0,3).map(({score,...item})=>item);
  let preserveKey=null;
  if(objective==="vs"&&vsDay!==3)preserveKey=vsDay===null?"technology_advice_vs_day_unknown":"technology_advice_preserve_badges";
  if(objective==="growth"&&hq!==null&&hq<25)preserveKey="technology_advice_preserve_growth";
  return {
    status:selected.length?"ready":Object.keys(branches).length?"no_action":"no_data",
    main:selected[0]||null,next:selected.slice(1,3),locked,preserve_key:preserveKey,
    path_key:null,path_name:null,data_quality:"confirmed_branches_only",context,sources:TECHNOLOGY_ADVICE_SOURCES
  };
}