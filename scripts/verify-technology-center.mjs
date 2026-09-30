import test from "node:test";
import assert from "node:assert/strict";
import {validateScanImageBatch,MAX_TECHNOLOGY_IMAGES,MAX_TECHNOLOGY_BATCH_LENGTH} from "../api/scan.js";
import {sanitizeTechnologyCards,mergeTechnologyBranches,finalizeTechnologyReview} from "../lib/technology-scan.js";
import {createScanReviewDraft,applyScanReviewEdits,scanReviewEntries} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {buildTechnologyAdvice} from "../lib/technology-advisor.js";
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