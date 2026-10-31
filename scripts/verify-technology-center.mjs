import test from "node:test";
import assert from "node:assert/strict";
import {validateScanImageBatch,MAX_TECHNOLOGY_IMAGES,MAX_TECHNOLOGY_BATCH_LENGTH} from "../api/scan.js";
import {sanitizeTechnologyCards,mergeTechnologyBranches,finalizeTechnologyReview} from "../lib/technology-scan.js";
import {createScanReviewDraft,applyScanReviewEdits,scanReviewEntries} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {buildTechnologyAdvice} from "../lib/technology-advisor.js";
import {buildPersonalTechnologyAdvice,createTechnologyAdvisorUI,renderPersonalTechnologyAdvice,technologyAdvisorSquad} from "../lib/technology-advisor-ui.js";
import {TECHNOLOGY_ADVISOR_LOCALES,technologyAdvisorCopy} from "../lib/technology-advisor-copy.js";
import {normalizeState} from "../lib/normalize.js";
import {translator} from "../i18n.js";
import technologyI18nWest from "../lib/technology-i18n-west.js";
import technologyI18nCjk from "../lib/technology-i18n-cjk.js";
import technologyI18nEast from "../lib/technology-i18n-east.js";
import technologyI18nRest from "../lib/technology-i18n-rest.js";
import {savePendingTechnologyFiles,loadPendingTechnologyFiles,clearPendingTechnologyFiles} from "../lib/pending-scan-storage.js";

const image="data:image/jpeg;base64,AA==";
const card=(name,percent,extra={})=>({
  name,name_evidence:"visible_text",name_confidence:.99,
  percent:`${percent}%`,state:"percent",value_evidence:"same_card",value_confidence:.99,
  ...extra
});
const stateWith=(objective,branches,extra={})=>({
  player:{hq_level:28},player_context:{objective},season:{number:1},
  technology:{branches},...extra
});
const techBranch=(key,percent,extra={})=>({
  name:key.replaceAll("_"," "),state:"percent",percent,updated_at:"2026-09-30T10:00:00.000Z",...extra
});

test("technology scan accepts up to three compressed screenshots and respects request-size bounds",()=>{
  assert.equal(MAX_TECHNOLOGY_IMAGES,3);
  const batch=validateScanImageBatch("technology",{image_data_urls:[image,image,image]});
  assert.equal(batch.ok,true);assert.equal(batch.images.length,3);
  assert.equal(validateScanImageBatch("technology",{image_data_urls:[image,image,image,image]}).error,"technology_image_batch_too_large");
  assert.equal(validateScanImageBatch("profile",{image_data_url:image,image_data_urls:[image,image]}).images.length,1);
  const prefix="data:image/jpeg;base64,";
  const large=`${prefix}${"A".repeat(3_300_000-prefix.length)}`;
  assert.ok(large.length<4_150_000);
  const tooLarge=validateScanImageBatch("technology",{image_data_urls:[large,large]});
  assert.equal(tooLarge.ok,false);assert.equal(tooLarge.status,413);
  assert.ok(large.length*2>MAX_TECHNOLOGY_BATCH_LENGTH);
  assert.equal(validateScanImageBatch("technology",{image_data_urls:["not-an-image"]}).error,"invalid_image");
});

test("overlapping identical observations deduplicate and printed zero remains a real value",()=>{
  const result=sanitizeTechnologyCards({cards:[card("Development",0),card("Development",0)]},"2026-09-30T12:00:00.000Z");
  assert.equal(result.branches.development.state,"percent");
  assert.equal(result.branches.development.percent,0);
  assert.equal(result.unmapped.length,0);
});

test("conflicting duplicate branch readings remain unresolved for human review",()=>{
  const result=sanitizeTechnologyCards({cards:[card("Team 3",18),card("Team 3",31)]},"2026-09-30T12:00:00.000Z");
  assert.equal(result.branches.team_3,undefined);
  assert.equal(result.unmapped.length,2);
  assert.deepEqual(result.unmapped.map(item=>item.percent).sort((a,b)=>a-b),[18,31]);
});

test("explicit max and locked states do not fabricate percentages",()=>{
  const result=sanitizeTechnologyCards({cards:[
    {name:"Heroes",name_evidence:"visible_text",name_confidence:.99,state:"max",state_evidence:"same_card",state_confidence:.99},
    {name:"Special Forces",name_evidence:"visible_text",name_confidence:.99,state:"locked",state_evidence:"same_card",state_confidence:.99,prerequisite:"Unlock condition",prerequisite_evidence:"visible_text"}
  ]},"2026-09-30T12:00:00.000Z");
  assert.equal(result.branches.heroes.state,"max");
  assert.equal("percent" in result.branches.heroes,false);
  assert.equal(result.branches.special_forces.state,"locked");
  assert.equal(result.branches.special_forces.prerequisite,"Unlock condition");
  assert.equal("percent" in result.branches.special_forces,false);
});

test("Technology scan drafts expose values for review before confirmation",()=>{
  const now="2026-09-30T12:00:00.000Z";
  const scanned=sanitizeTechnologyCards({cards:[card("Development",0)]},now);
  const draft=createScanReviewDraft("technology",{technology:{...scanned,updated_at:now}});
  assert.ok(draft?.technology?.branches?.development);
  assert.ok(scanReviewEntries(draft).some(entry=>entry.path.at(-1)==="percent"&&entry.value===0));
  const groups=buildScanReviewGroups("technology",draft);
  assert.equal(groups.length,1);assert.equal(groups[0].kind,"technology");
  const review=applyScanReviewEdits(draft,[{path:["technology","branches","development","percent"],value:"25"}]);
  assert.deepEqual(review.errors,[]);
  const finalized=finalizeTechnologyReview(review.patch.technology,now);
  assert.equal(finalized.branches.development.percent,25);
});

test("Technology screenshots survive local save/reload and clear as one owner-scoped batch",async()=>{
  const records=new Map();let upgraded=false;
  const request=(action)=>{const req={result:undefined,error:null};queueMicrotask(()=>{try{req.result=action();req.onsuccess?.()}catch(error){req.error=error;req.onerror?.()}});return req};
  globalThis.indexedDB={open(){
    const req={result:null,error:null};
    queueMicrotask(()=>{
      const db={
        objectStoreNames:{contains:()=>upgraded},
        createObjectStore(){upgraded=true},
        transaction(){return {objectStore(){return {
          get:key=>request(()=>records.get(key)),
          put:value=>request(()=>{records.set(value.key,value);return value.key}),
          delete:key=>request(()=>records.delete(key))
        }}}},close(){}
      };
      req.result=db;if(!upgraded)req.onupgradeneeded?.();req.onsuccess?.();
    });
    return req;
  }};
  const files=[
    new File([new Blob(["capture-a"])],"technology-a.png",{type:"image/png",lastModified:1}),
    new File([new Blob(["capture-b"])],"technology-b.png",{type:"image/png",lastModified:2})
  ];
  assert.equal(await savePendingTechnologyFiles("user:technology-test",files),true);
  const restored=await loadPendingTechnologyFiles("user:technology-test");
  assert.deepEqual(restored.map(file=>file.name),["technology-a.png","technology-b.png"]);
  assert.deepEqual(restored.map(file=>file.size),files.map(file=>file.size));
  assert.equal(await clearPendingTechnologyFiles("user:technology-test"),true);
  assert.deepEqual(await loadPendingTechnologyFiles("user:technology-test"),[]);
  delete globalThis.indexedDB;
});

test("a newer confirmed branch observation wins over an older one",()=>{
  const older={development:{name:"Development",state:"percent",percent:20,updated_at:"2026-09-20T00:00:00.000Z"}};
  const newer={development:{name:"Development",state:"percent",percent:35,updated_at:"2026-09-30T00:00:00.000Z"}};
  assert.equal(mergeTechnologyBranches(newer,older).development.percent,35);
  assert.equal(mergeTechnologyBranches(older,newer).development.percent,35);
});

test("growth recommendations use goal and stage rather than completion-percent ordering",()=>{
  const advice=buildTechnologyAdvice(stateWith("growth",{
    development:techBranch("development",98),
    economy:techBranch("economy",4)
  }));
  assert.equal(advice.main.key,"development");
  assert.equal(advice.main.percent,98);
  assert.equal(advice.main.reason_key,"technology_advice_reason_foundation");
});

test("season progression and Oil Era availability change the ranked branch",()=>{
  const advice=buildTechnologyAdvice({
    player:{hq_level:32},player_context:{objective:"season"},
    season:{number:4,name:"Oil Era"},technology:{branches:{
      oil_era:techBranch("oil_era",3),
      development:techBranch("development",90)
    }}
  });
  assert.equal(advice.context.oil_era_available,true);
  assert.equal(advice.main.key,"oil_era");
  assert.equal(advice.main.reason_key,"technology_advice_reason_oil");
  const unscanned=buildTechnologyAdvice({
    player:{hq_level:35},player_context:{objective:"season"},
    season:{number:4,name:"Oil Era"},technology:{branches:{development:techBranch("development",15)}}
  });
  assert.equal(unscanned.context.oil_era_available,false);
  assert.notEqual(unscanned.main?.key,"oil_era");
});

test("T10 goal prioritizes Special Forces and its in-game prerequisites stay visible",()=>{
  const advice=buildTechnologyAdvice(stateWith("t10",{
    special_forces:techBranch("special_forces",12),
    development:techBranch("development",90),
    tank_specialization:techBranch("tank_specialization",8),
    oil_era:{name:"Oil Era",state:"locked",prerequisite:"Visible unlock condition"}
  }));
  assert.equal(advice.main.key,"special_forces");
  assert.equal(advice.main.reason_key,"technology_advice_reason_t10");
  assert.equal(advice.locked[0].prerequisite,"Visible unlock condition");
  assert.equal(advice.next.some(item=>item.key==="oil_era"),false);
});

test("troop specialization only ranks for the confirmed main troop type",()=>{
  const branches={
    tank_specialization:techBranch("tank_specialization",80),
    aircraft_specialization:techBranch("aircraft_specialization",2),
    missile_specialization:techBranch("missile_specialization",5)
  };
  const tank=buildTechnologyAdvice(stateWith("pvp",branches),{mainType:"Tank"});
  assert.equal(tank.main.key,"tank_specialization");
  assert.equal(tank.next.some(item=>item.key==="aircraft_specialization"||item.key==="missile_specialization"),false);
  const unknown=buildTechnologyAdvice(stateWith("pvp",branches));
  assert.equal(unknown.context.main_type,null);
  assert.equal(unknown.main,null);
});

const confirmedSquad=(id,names)=>({
  id,composition_source:"explicit_confirmation",composition_confirmed_at:"2026-10-31T10:00:00.000Z",
  confirmed_composition:names,heroes:names.map(name=>({name}))
});
const playerAdviceState=(names,{objective="pvp",branches={}}={})=>({
  player_id:"account-a",player:{hq_level:31},player_context:{objective},season:{number:4},
  squads:[confirmedSquad(1,names)],technology:{branches}
});
test("personal adviser uses only five saved confirmed Tank, aircraft or missile heroes and requires a 3/5 majority",()=>{
  const cases=[
    {names:["Kimberly","Murphy","Williams","Marshall","Farhad"],type:"tank",count:5},
    {names:["DVA","Carlie","Lucius","Skyler","Morrison"],type:"aircraft",count:5},
    {names:["Tesla","Swift","Adam","Fiona","McGregor"],type:"missile",count:5},
    {names:["Carlie","DVA","Lucius","Kimberly","Murphy"],type:"aircraft",count:3}
  ];
  for(const item of cases){
    const formation=technologyAdvisorSquad({squads:[confirmedSquad(1,item.names)]},1);
    assert.equal(formation.type,item.type);assert.equal(formation.typeCount,item.count);
  }
  const split=technologyAdvisorSquad({squads:[confirmedSquad(1,["Carlie","DVA","Kimberly","Murphy","Tesla"])]},1);
  assert.equal(split.type,null);
  const unconfirmed={
    id:1,heroes:["Carlie","DVA","Lucius","Skyler","Morrison"].map(name=>({name})),
    composition_conflict:{scan_pending:{heroes:["Carlie","DVA","Lucius","Skyler","Morrison"].map(name=>({proposed_name:name,status:"unlinked"}))}}
  };
  assert.equal(technologyAdvisorSquad({squads:[unconfirmed]},1).type,null);
  assert.equal(technologyAdvisorSquad({squads:[confirmedSquad(1,["Carlie","DVA","Lucius","","Morrison"])]},1).type,null);
});

test("selected primary squad is used only with explicit composition; no weapon level can infer formation type",()=>{
  const state={player_id:"account-a",diagnostic_squad_id:2,squads:[
    confirmedSquad(1,["Kimberly","Murphy","Williams","Marshall","Farhad"]),
    confirmedSquad(2,["Carlie","DVA","Lucius","Skyler","Morrison"])
  ],alliance:{roster:[{name:"AllianceTank",hero_names:["Kimberly","Murphy","Williams","Marshall","Farhad"]}]},technology:{branches:{aircraft_specialization:techBranch("aircraft_specialization",0)}}};
  assert.equal(buildPersonalTechnologyAdvice(state).squadId,2);
  assert.equal(buildPersonalTechnologyAdvice(state).formation.type,"aircraft");
  state.squads[1].composition_source="legacy_saved_v1";
  assert.equal(buildPersonalTechnologyAdvice(state).squadId,1);
  assert.equal(buildPersonalTechnologyAdvice(state).formation.type,"tank");
  const weaponOnly=confirmedSquad(1,["Unknown A","Unknown B","Unknown C","Unknown D","Unknown E"]);
  weaponOnly.heroes=[{name:"Unknown A",exclusive:"30"}];
  assert.equal(technologyAdvisorSquad({squads:[weaponOnly]},1).type,null);
});

test("canonical Skyler alias resolves through the saved confirmed composition",()=>{
  const model=buildPersonalTechnologyAdvice(playerAdviceState(["DVA","Carlie","Lucius","Schuyler","Morrison"]));
  assert.equal(model.formation.type,"aircraft");
  assert.deepEqual(model.formation.heroes,["DVA","Carlie","Lucius","Skyler","Morrison"]);
});

test("personal advice keeps real zero, excludes max, lists locked prerequisites, and separates Oil/T10/VS/T11 paths",()=>{
  const state=playerAdviceState(["Carlie","DVA","Lucius","Skyler","Morrison"],{objective:"season",branches:{
    aircraft_specialization:techBranch("aircraft_specialization",0),
    development:techBranch("development",15),
    oil_era:{name:"The Oil Era",state:"locked",prerequisite:"Confirm the visible prerequisite"},
    heroes:{name:"Heroes",state:"max",updated_at:"2026-10-31T00:00:00.000Z"}
  }});
  let model=buildPersonalTechnologyAdvice(state);
  assert.equal(model.advice.main.key,"development");
  assert.equal(model.advice.locked.some(item=>item.key==="oil_era"&&item.prerequisite==="Confirm the visible prerequisite"),true);
  assert.equal(model.maxBranches.some(item=>item.key==="heroes"),true);
  state.technology.branches.oil_era={...techBranch("oil_era",0),name:"The Oil Era"};
  model=buildPersonalTechnologyAdvice(state);
  assert.equal(model.advice.main.key,"oil_era");
  state.player_context.objective="t10";
  state.technology.branches.special_forces=techBranch("special_forces",10);
  assert.equal(buildPersonalTechnologyAdvice(state).advice.main.key,"special_forces");
  state.technology.branches.alliance_duel=techBranch("alliance_duel",20);
  state.player_context.objective="vs";
  assert.equal(buildPersonalTechnologyAdvice(state).advice.main.key,"alliance_duel");
  state.player_context.objective="t11";
  assert.equal(buildPersonalTechnologyAdvice(state).advice.status,"separate_path");
  assert.equal(buildPersonalTechnologyAdvice(state).advice.path_key,"technology_advice_t11_route");
});

test("personal technology adviser output is HTML-escaped, account-local, closed by default, and uses explicit RTL",()=>{
  const make=(player_id,branchName)=>({
    player_id,player:{hq_level:31},player_context:{objective:"power"},squads:[confirmedSquad(1,["Carlie","DVA","Lucius","Skyler","Morrison"])],
    technology:{branches:{development:{name:branchName,state:"percent",percent:0,updated_at:"2026-10-31T10:00:00.000Z"}}}
  });
  const hostile=make("account-a","Development");
  hostile.technology.branches.oil_era={name:"The Oil Era",state:"locked",prerequisite:"<img src=x onerror=alert(1)>"};
  const before=JSON.stringify(hostile);
  const a=buildPersonalTechnologyAdvice(hostile);
  const b=buildPersonalTechnologyAdvice(make("account-b","Different"));
  assert.equal(a.owner,"account-a");assert.equal(b.owner,"account-b");
  const testTranslate=(key,vars={})=>key==="squad"?"Escouade":key==="technology_advice_locked_requirement"?`Prérequis visible : ${vars.requirement}`:key;
  const markup=renderPersonalTechnologyAdvice(a,{locale:"fr",t:testTranslate,objectiveLabel:value=>value});
  assert.match(markup,/0 %/);assert.doesNotMatch(markup,/<details[^>]*\sopen(?:\s|=|>)/i);
  assert.doesNotMatch(markup,/<img\b/i);
  assert.match(markup,/&lt;img/);
  assert.match(renderPersonalTechnologyAdvice(a,{locale:"ar",t:key=>key}),/dir="rtl"/);
  assert.doesNotMatch(markup,/<button|fetch\(|\/api\//i);
  assert.equal(JSON.stringify(hostile),before,"advice rendering must not write calculated priorities into player state");
  assert.deepEqual([...TECHNOLOGY_ADVISOR_LOCALES].sort(),["ar","cs","de","el","en","es","fr","id","it","ja","ko","nl","pl","pt","ro","ru","sv","th","tr","uk","vi","zh"].sort());
  for(const locale of TECHNOLOGY_ADVISOR_LOCALES){
    const copy=technologyAdvisorCopy(locale);
    for(const key of ["title","intro","confirmHeroes","noBranches","next","formation","max"])assert.ok(copy[key],`${locale} missing ${key}`);
    for(const type of ["tank","aircraft","missile"])assert.ok(copy.types[type],`${locale} missing ${type}`);
  }
});

test("a 4/5 aircraft formation justifies aircraft research and names the exact in-game branch",()=>{
  const state=playerAdviceState(["Carlie","DVA","Lucius","Skyler","Kimberly"],{objective:"pvp",branches:{
    aircraft_specialization:techBranch("aircraft_specialization",0),
    tank_specialization:techBranch("tank_specialization",20)
  }});
  const model=buildPersonalTechnologyAdvice(state);
  assert.equal(model.formation.type,"aircraft");
  assert.equal(model.advice.main.key,"aircraft_specialization");
  const testTranslate=key=>key==="squad"?"Escouade":key;
  const html=renderPersonalTechnologyAdvice(model,{locale:"fr",t:testTranslate,objectiveLabel:value=>value});
  assert.match(html,/4\/5 héros confirmés sont de type Avion/);
  assert.match(html,/Centre Technologie → Spécialisation avion/i);
  assert.match(html,/0 %/);
});

test("personal adviser clears when private access is absent and resets its open state across account changes",()=>{
  let allowed=false,state=playerAdviceState(["Carlie","DVA","Lucius","Skyler","Morrison"]);
  let markup="old private markup";
  const root={open:false,
    get innerHTML(){return markup},
    set innerHTML(value){markup=value;this.open=/<details[^>]*\sopen(?:\s|=|>)/i.test(value)},
    replaceChildren(){this.innerHTML=""},
    querySelector(){return markup.includes("technologyAdvisorDisclosure")?{open:this.open}:null}
  };
  const ui=createTechnologyAdvisorUI({
    root,getState:()=>state,getLocale:()=>"fr",getPrivateVisible:()=>allowed,
    getSelectedSquadId:()=>1,getTranslate:key=>key==="squad"?"Escouade":key,getObjectiveLabel:value=>value
  });
  ui.render();assert.equal(root.innerHTML,"");
  allowed=true;ui.render();assert.match(root.innerHTML,/Escouade 1/);
  root.open=true;
  state={...state,player_id:"account-b"};
  ui.render();assert.doesNotMatch(root.innerHTML,/<details[^>]*\sopen(?:\s|=|>)/i);
  allowed=false;ui.render();assert.equal(root.innerHTML,"");
});

test("T11 is routed to the separate Armament Institute, not a Tech Center branch",()=>{
  const advice=buildTechnologyAdvice(stateWith("t11",{
    special_forces:techBranch("special_forces",12),
    tactical_weapon:techBranch("tactical_weapon",10)
  }));
  assert.equal(advice.status,"separate_path");
  assert.equal(advice.main,null);assert.deepEqual(advice.next,[]);
  assert.equal(advice.path_name,"Armament Institute");
});

test("VS technology timing uses a fresh Day 3 observation and warns when the day is stale",()=>{
  const now=new Date("2026-09-30T12:00:00.000Z");
  const branches={alliance_duel:techBranch("alliance_duel",40),team_1:techBranch("team_1",10)};
  const current=buildTechnologyAdvice(stateWith("vs",branches,{vs:{day:3,updated_at:"2026-09-30T08:00:00.000Z"}}),{now});
  assert.equal(current.main.key,"alliance_duel");
  assert.equal(current.preserve_key,null);
  const stale=buildTechnologyAdvice(stateWith("vs",branches,{vs:{day:3,updated_at:"2026-09-20T08:00:00.000Z"}}),{now});
  assert.equal(stale.preserve_key,"technology_advice_vs_day_unknown");
});

test("new growth, power, T10 and T11 goals survive state normalization",()=>{
  for(const objective of ["growth","power","t10","t11"])
    assert.equal(normalizeState({player_context:{objective}}).player_context.objective,objective);
});

test("Technology Center labels and advice are native in all 22 supported languages",()=>{
  assert.equal(translator("fr")("scan_technology"),"Centre Technologie");
  assert.equal(translator("en-US")("scan_technology"),"Technology Center");
  const languages=["fr","en-GB","en-US","es","it","de","pt","nl","zh","ja","ru","ar","pl","tr","ko","vi","th","id","uk","ro","el","cs","sv"];
  const nativeTechnologyPacks=Object.assign({},technologyI18nWest,technologyI18nCjk,technologyI18nEast,technologyI18nRest);
  const keys=[
    "scan_technology","scan_technology_help","scan_choose_multiple","scan_technology_capture_count","scan_technology_limit",
    "scan_technology_name","scan_technology_state","scan_technology_percent","scan_technology_prerequisite",
    "scan_technology_unknown_name","scan_technology_state_unknown","scan_technology_state_percent","scan_technology_state_max","scan_technology_state_locked",
    "objective_growth","objective_power","objective_t10","objective_t11",
    "technology_advice_title","technology_advice_intro","technology_advice_priority","technology_advice_next","technology_advice_locked",
    "technology_advice_locked_requirement","technology_advice_locked_unknown","technology_advice_preserve_badges",
    "technology_advice_vs_day_unknown","technology_advice_preserve_growth","technology_advice_t11_route",
    "technology_advice_no_data","technology_advice_no_action","technology_advice_source","technology_advice_reason_general",
    "technology_advice_reason_foundation","technology_advice_reason_economy","technology_advice_reason_heroes",
    "technology_advice_reason_main_type","technology_advice_reason_pvp","technology_advice_reason_pve",
    "technology_advice_reason_t10","technology_advice_reason_oil","technology_advice_reason_vs_now",
    "technology_advice_reason_vs","technology_advice_main_type_unknown","technology_advice_rank_note"
  ];
  for(const language of languages){
    const t=translator(language);
    for(const key of keys)assert.notEqual(t(key),key,`Missing ${language} string: ${key}`);
    if(!language.startsWith("en")){
      if(language!=="fr"){
        const nativePack=nativeTechnologyPacks[language];
        assert.ok(nativePack,`Missing native Technology pack: ${language}`);
        for(const key of keys){
          assert.ok(Object.hasOwn(nativePack,key),`${language} has no native value for ${key}`);
          assert.equal(t(key),nativePack[key],`${language} does not resolve its native value for ${key}`);
        }
      }
    }
  }
});