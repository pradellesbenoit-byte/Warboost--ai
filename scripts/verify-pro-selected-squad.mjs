import assert from "node:assert/strict";
import {scopedDiagnosticState,buildKnowledgeGuidance} from "../lib/knowledge-guidance.js";
import {buildPlayerAnalysis,buildSevenDayPlan} from "../api/advice.js";

let checks=0;
function test(name,fn){fn();checks++;console.log("PASS",name)}

const now=Date.now();
const recent=new Date(now-60*60*1000).toISOString();
const stale=new Date(now-14*24*60*60*1000).toISOString();
const lineups=[
  ["Murphy","Kimberly","Williams","Marshall","Stetmann"],
  ["DVA","Lucius","Carlie","Morrison","Schuyler"],
  ["Adam","McGregor","Tesla","Fiona","Swift"],
  ["Mason","Violet","Scarlett","Monica","Richard"]
];
const confirmed=(values,at=recent)=>({
  ...values,source:"confirmed_scan",updated_at:at,
  field_source:Object.fromEntries(Object.keys(values).map(key=>[key,"confirmed_scan"])),
  field_updated_at:Object.fromEntries(Object.keys(values).map(key=>[key,at]))
});
function makeSquad(id,names=lineups[id-1],{partial=false,at=recent,needs_rescan=false}={}){
  const chosen=partial?names.slice(0,3):names;
  return {
    ...confirmed({power:45+id},at),id,needs_rescan,
    composition_source:"explicit_confirmation",composition_confirmed_at:at,
    confirmed_composition:chosen,last_confirmed_scan_at:at,
    heroes:chosen.map((name,index)=>confirmed({
      name,level:index===0?0:150-index*8,stars:index===0?0:4,
      exclusive:index===0?0:10+index,gear:`count=4;levels=${index},10,20,30;rarity=gold`
    },at))
  };
}
function makeState({ids=[1],partialIds=[],staleIds=[],needsRescanIds=[],selected=1,objective="balanced",tech=null,hq=31,drone=null}={}){
  const state={
    player:confirmed({hq_level:hq},recent),
    squads:Array.from({length:4},(_,i)=>{
      const id=i+1;
      return ids.includes(id)?makeSquad(id,lineups[id-1],{
        partial:partialIds.includes(id),at:staleIds.includes(id)?stale:recent,
        needs_rescan:needsRescanIds.includes(id)
      }):{id,heroes:[],power:null};
    }),
    diagnostic_squad_id:selected,
    player_context:{objective,updated_at:recent},
    ...(tech?{technology:tech}:{}),
    ...(drone?{drone}:{})
  };
  return state;
}
function analyze(state,id=state.diagnostic_squad_id||1,locale="fr-FR"){
  const scoped=scopedDiagnosticState(state,id);
  const resolved=JSON.parse(JSON.stringify(scoped.state));
  return {scoped:scoped.state,analysis:buildPlayerAnalysis(resolved,locale)};
}
const scanRows=analysis=>analysis.priorities.filter(row=>row.kind==="scan");
const targetText=analysis=>analysis.priorities.map(row=>`${row.title} ${row.target||""} ${row.reason} ${row.action}`).join(" ");
const planFor=(state,analysis)=>buildSevenDayPlan(state,analysis);

test("une escouade complète reste analysée seule sans demander les escouades vides",()=>{
  const state=makeState({ids:[1]}),{analysis}=analyze(state,1);
  assert.equal(analysis.focus_squad,1);
  assert.ok(analysis.priorities.length<=3);
  assert.equal(scanRows(analysis).length,0);
  assert.ok(analysis.priorities.length>=2);
  assert.equal(new Set(analysis.priorities.map(row=>`${row.kind}:${row.target||""}`)).size,analysis.priorities.length);
  assert.ok(analysis.priorities.every(row=>!row.target||lineups[0].includes(row.target)||["Drone","Technologie","Technology"].includes(row.target)));
  assert.doesNotMatch(targetText(analysis),/Escouade 2|Escouade 3|Escouade 4|Squad 2|Squad 3|Squad 4/);
  assert.equal(planFor(state,analysis).days.filter(row=>row.mode==="scan").length,0);
});

test("une escouade partielle reçoit une seule collecte ciblée et reste prudente",()=>{
  const state=makeState({ids:[1],partialIds:[1]}),{analysis}=analyze(state,1);
  assert.equal(analysis.composition.complete,false);
  assert.equal(scanRows(analysis).length,1);
  assert.equal(scanRows(analysis)[0].target,"Escouade 1");
  assert.doesNotMatch(targetText(analysis),/Escouade 2|Escouade 3|Escouade 4/);
  assert.equal(planFor(state,analysis).days.filter(row=>row.mode==="scan").length,1);
});

test("aucune donnée ne fabrique pas de héros ni de priorité",()=>{
  const state=makeState({ids:[],selected:1}),{analysis}=analyze(state,1);
  assert.equal(analysis.focus_squad,null);
  assert.deepEqual(analysis.priorities,[]);
  assert.equal(analysis.confidence,0);
  assert.ok(/scan|escouade/i.test(analysis.summary));
});

test("les valeurs zéro restent des observations valides",()=>{
  const zeroField=(field)=>{
    const state=makeState({ids:[1]});
    for(const hero of state.squads[0].heroes){
      hero.level=150;hero.stars=5;hero.exclusive=30;hero.gear="count=4;levels=40,40,40,40;rarity=gold";
    }
    state.squads[0].heroes[0][field]=0;
    return analyze(state,1).analysis;
  };
  assert.ok(zeroField("level").priorities.some(row=>row.kind==="level"&&row.current===0));
  assert.ok(zeroField("stars").priorities.some(row=>row.kind==="stars"&&row.current===0));
  assert.ok(zeroField("exclusive").priorities.some(row=>row.kind==="exclusive"&&row.current===0));
  const tech=analyze(makeState({ids:[1],tech:{hero_tech_pct:0,updated_at:recent}}),1).analysis;
  assert.ok(tech.priorities.some(row=>row.kind==="technology"&&row.current===0));
});

test("les technologies nommées verrouillées ou max ne deviennent pas des pourcentages inventés",()=>{
  const state=makeState({ids:[1],tech:{branches:{
    locked_branch:{name:"Locked branch",state:"locked",prerequisite:"HQ 40"},
    max_branch:{name:"Completed branch",state:"max"}
  }}});
  const {analysis}=analyze(state,1);
  assert.equal(analysis.priorities.some(row=>row.kind==="technology"),false);
  assert.equal(analysis.adaptive_context.technology.known_count,0);
});

test("une progression technologique explicitement confirmée à 0 reste exploitable",()=>{
  const state=makeState({ids:[1],tech:{hero_tech_pct:0,updated_at:recent}});
  const {analysis}=analyze(state,1);
  const technology=analysis.priorities.find(row=>row.kind==="technology");
  assert.ok(technology);
  assert.equal(technology.current,0);
  assert.equal(technology.current_label,"0%");
});

test("une sélection explicite d'escouade 3 isole sa composition même si les quatre sont scannées",()=>{
  const state=makeState({ids:[1,2,3,4],selected:3});
  const {scoped,analysis}=analyze(state,3);
  assert.equal(analysis.focus_squad,3);
  assert.equal(scoped.squads.filter(row=>row.heroes.length>0).length,1);
  assert.ok(analysis.priorities.every(row=>!row.target||lineups[2].includes(row.target)||["Drone","Technologie","Technology"].includes(row.target)));
  assert.doesNotMatch(targetText(analysis),/Murphy|Kimberly|DVA|Lucius|Escouade 1|Escouade 2|Escouade 4/);
  assert.equal(scanRows(analysis).length,0);
});

test("une escouade sélectionnée peut être choisie explicitement sans favoriser l'escouade 1",()=>{
  const state=makeState({ids:[1,2],selected:2});
  const {analysis}=analyze(state,2);
  assert.equal(analysis.focus_squad,2);
  assert.ok(analysis.priorities.every(row=>!row.target||lineups[1].includes(row.target)||["Skyler","Escouade 2","Drone","Technologie","Technology"].includes(row.target)),
    JSON.stringify(analysis.priorities.map(row=>({kind:row.kind,target:row.target,reason:row.reason}))));
});

test("les données périmées déclenchent une seule actualisation de l'escouade choisie",()=>{
  const state=makeState({ids:[1],staleIds:[1]}),{analysis}=analyze(state,1);
  assert.equal(scanRows(analysis).length,1);
  assert.equal(scanRows(analysis)[0].target,"Escouade 1");
  assert.equal(planFor(state,analysis).days.filter(row=>row.mode==="scan").length,1);
  assert.equal(planFor(state,analysis).days.filter(row=>row.action_key==="measure_progress").length,1);
});

test("VS explicite ajuste le contexte sans importer les escouades secondaires",()=>{
  for(const objective of ["pvp","pve","vs","season"]){
    const state=makeState({ids:[1],objective});
    if(objective==="vs")state.vs={day:4,week:12,updated_at:recent};
    const {analysis}=analyze(state,1);
    assert.equal(analysis.adaptive_context.objective,objective);
    assert.ok(analysis.priorities.every(row=>!row.target||lineups[0].includes(row.target)||["Drone","Technologie","Technology"].includes(row.target)));
  }
});

test("les sorties françaises et anglaises gardent le schéma de Diagnostic PRO",()=>{
  for(const locale of ["fr-FR","en-GB"]){
    const state=makeState({ids:[1]}),{analysis}=analyze(state,1,locale),plan=planFor(state,analysis);
    assert.equal(typeof analysis.summary,"string");
    assert.ok(Array.isArray(analysis.priorities));
    assert.ok(analysis.priorities.every(row=>["kind","title","reason","action","target","severity"].every(key=>key in row)));
    assert.ok(Array.isArray(plan.days));
    assert.equal(plan.days.length,7);
    assert.equal(analysis.focus_squad,1);
  }
});

test("le plan sur sept jours ne planifie pas un second rescan après une escouade complète",()=>{
  const state=makeState({ids:[1]}),{analysis}=analyze(state,1);
  const plan=planFor(state,analysis);
  assert.deepEqual(plan.days.map(row=>row.action_key),[
    "top_priority","checkpoint_top","secondary_priority","measure_progress",
    "shop_resources","vs_season_timing","weekly_review"
  ]);
  assert.equal(plan.days.filter(row=>row.mode==="scan").length,0);
  assert.equal(plan.exact_quantities,false);
  assert.equal(plan.days.some(row=>row.kind==="scan"),false);
});

test("la guidance officielle reste bloquée pour des sources non vérifiées et tient compte du QG confirmé",()=>{
  const state=makeState({ids:[1],hq:31}),badSnapshot={
    sources:[{id:"community",kind:"community",editorial:"publisher",status:"verified",url:"https://lastwarvault.com/update",
      content_hash:"a".repeat(64),verified_at:recent}],
    facts:[{id:"unapproved",source_id:"community",source_url:"https://lastwarvault.com/update",topic:"gear",
      statement:"Unverified community claim for fixture testing.",approved_source_hash:"a".repeat(64),
      published_at:recent,verified_at:recent,reviewed_at:recent,review_status:"approved",
      confidence:"confirmed",evidence_verified:true,scope:{kind:"global",hq_min:30}}]
  };
  const guidance=buildKnowledgeGuidance(state,badSnapshot,1,{now});
  assert.equal(guidance.applicable_facts.length,0);
  assert.equal(guidance.official_rules_available,false);
  assert.equal(guidance.missing.includes("hq"),false);
  const unknownHq=makeState({ids:[1],hq:null});
  delete unknownHq.player.hq_level;
  delete unknownHq.player.hq_level_source;
  delete unknownHq.player.field_source.hq_level;
  const unknownGuidance=buildKnowledgeGuidance(unknownHq,badSnapshot,1,{now});
  assert.equal(unknownGuidance.missing.includes("hq"),true);
});

test("les quatre escouades réellement renseignées restent disponibles dans les résultats comparatifs",()=>{
  const state=makeState({ids:[1,2,3,4],selected:1});
  const full=buildPlayerAnalysis(state,"fr-FR");
  assert.deepEqual(full.squads.map(row=>row.id),[1,2,3,4]);
  assert.ok(full.squads.slice(0,4).every(row=>row.composition_complete));
  const explicitlySelected=analyze(state,4);
  assert.equal(explicitlySelected.analysis.focus_squad,4);
  assert.ok(explicitlySelected.analysis.priorities.every(row=>!row.target||lineups[3].includes(row.target)||["Drone","Technologie","Technology"].includes(row.target)));
});

console.log(`PASS PRO selected-squad guidance: ${checks} regression groups; synthetic data only, no network, no writes, no payment calls.`);
