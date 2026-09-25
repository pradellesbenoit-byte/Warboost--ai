import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createEndgameCoachReport,hasEndgameCoachProAccess} from "../lib/endgame-coach.js";
import {translator} from "../i18n.js";

const namesByType={
  aircraft:["Ambolt","Cage","Carlie","DVA","Lucius"],
  tank:["Farhad","Gump","Kimberly","Loki","Marshall"],
  missile:["Adam","Braz","Elsa","Fiona","Kane"]
};

function makeState(type="aircraft",{complete=false,levels=[180,180,180,180,120]}={}){
  const names=namesByType[type];
  const heroes=names.map((name,index)=>({
    name,level:levels[index]??180,stars:5,gear:complete?{weapon:2,armor:2}:null,
    skills:complete?{one:10,two:10}:null,awakening:complete?{level:1}:null,
    combat_role:index<2?"frontline":"dps"
  }));
  const state={
    version:"2.5.31",
    player:{name:"Test",hq_level:35},
    squads:[{id:1,composition_confirmed_at:"2026-09-25T10:00:00.000Z",confirmed_composition:[...names],heroes}],
    hero_profiles:[],
    exclusive_weapons:complete?names.map((hero_name,index)=>({hero_name,level:index+1,power:1000,updated_at:"2026-09-25T10:00:00.000Z"})):[],
    drone:complete?{level:180,power_m:25,components:{core:4},chips:{one:3}}:{level:null,power_m:null},
    technology:complete?{
      type_mastery_pct:60,hero_tech_pct:70,siege_to_seize_pct:80,
      defensive_fortification_pct:90,tactical_weapon_pct:50,
      mastery_by_type:{[type]:60}
    }:{type_mastery_pct:null,hero_tech_pct:null,siege_to_seize_pct:null,defensive_fortification_pct:null,tactical_weapon_pct:null},
    season:complete?{name:"S6",number:6,day:12,total_days:30,profession:"Engineer",progress_pct:40,resistance:20,focus:"tech",lifecycle:"active",awakening_swap:"confirmed"}:{},
    shop:{currency:"medals",currency_balance:99999,offers:[{name:"Crystal",price:1}]}
  };
  if(complete){
    state.endgame={
      armament_institute_t11:{unlocked:true},
      decorations:{one:{level:5,effect:"confirmed"}},
      overlord:{level:12,effect:"confirmed"},
      rare_resources:[{
        name:"Crystal",stock:120,usage_known:true,current_use:true,
        next_use:{cost:100,expected_gain:500,gain_source:"confirmed account screen"}
      }],
      technology_route:{type,next_research:"Recorded node",source:"confirmed technology screen"},
      before_after:{metric:"Formation size",unit:"members",before:100,after:120,source:"confirmed account comparison"}
    };
  }
  return state;
}

const unknown=createEndgameCoachReport({player:{hq_level:null}});
assert.equal(unknown.eligibility.status,"unknown");
assert.equal(unknown.eligibility.eligible,false);
assert.deepEqual(unknown.top_priorities,[]);

const below=createEndgameCoachReport({player:{hq_level:34},exclusive_weapons:[{hero_name:"DVA",level:9}]});
assert.equal(below.eligibility.status,"below_threshold");
assert.equal(below.eligibility.eligible,false);
assert.deepEqual(below.top_priorities,[]);

const threshold=createEndgameCoachReport({player:{hq_level:35}});
assert.equal(threshold.eligibility.eligible,true);
assert.equal(threshold.top_priorities.length,3);
assert.equal(new Set(threshold.top_priorities.map(item=>item.action_key)).size,3);

for(const type of Object.keys(namesByType)){
  const typed=createEndgameCoachReport(makeState(type));
  assert.equal(typed.squad1.main_type,type,`Squad 1 should identify ${type}`);
  assert.equal(typed.technology_route.main_type,type);
}

const incomplete=makeState("aircraft");
const before=JSON.stringify(incomplete);
const incompleteReport=createEndgameCoachReport(incomplete);
assert.equal(JSON.stringify(incomplete),before,"The report must not mutate player state.");
assert.equal(incompleteReport.top_priorities.length,3);
assert.equal(incompleteReport.resources.length,0,"Shop currency and offers are not player rare-resource stock.");
assert.equal(incompleteReport.missing_data.some(item=>item.id==="rare_resources"),true);
assert.equal(incompleteReport.before_after.available,false);
assert.equal(incompleteReport.technology_route.next_research,null);
assert.equal(incompleteReport.confidence.band,"low");
assert.ok(incompleteReport.top_priorities.some(item=>item.action_key==="qg35_action_scan_technology"));

const duplicate=makeState("aircraft");
duplicate.squads[0].confirmed_composition[4]="Carlie";
duplicate.squads[0].heroes[4].name="Carlie";
const duplicateReport=createEndgameCoachReport(duplicate);
assert.equal(duplicateReport.squad1.identity_review_required,true);
assert.equal(duplicateReport.squad1.main_type,null,"Duplicate hero slots must not distort troop-type inference.");
assert.ok(duplicateReport.missing_data.some(item=>item.id==="squad1_identity_review"));
assert.ok(duplicateReport.top_priorities.some(item=>item.action_key==="qg35_action_review_composition"));

const complete=makeState("aircraft",{complete:true});
const completeReport=createEndgameCoachReport(complete);
assert.equal(completeReport.confidence.score,100,"Complete explicit coverage should produce full confidence.");
assert.equal(completeReport.squad1.main_type,"aircraft");
assert.equal(completeReport.technology_route.mastery_type_confirmed,true);
assert.equal(completeReport.technology_route.next_research.name,"Recorded node");
assert.equal(completeReport.resources[0].recommendation,"UTILISER");
assert.equal(completeReport.before_after.available,true);
assert.equal(completeReport.before_after.after,120);
assert.equal(completeReport.before_after.metric,"Formation size");
assert.equal(completeReport.missing_data.length,0);
assert.equal(completeReport.seven_day_plan.length,7);
assert.equal(completeReport.seven_day_plan[0].use_now.length,0);
assert.deepEqual(completeReport.seven_day_plan[3].use_now,["Crystal"]);

const held=makeState("tank",{complete:true});
held.endgame.rare_resources=[{name:"Crystal",stock:10,usage_known:true,current_use:true,next_use:{cost:100,expected_gain:20,gain_source:"confirmed screen"}}];
assert.equal(createEndgameCoachReport(held).resources[0].recommendation,"CONSERVER");
const lowPriority=makeState("missile",{complete:true});
lowPriority.endgame.rare_resources=[{name:"Crystal",stock:500,usage_known:true,current_use:false}];
assert.equal(createEndgameCoachReport(lowPriority).resources[0].recommendation,"PRIORITÉ FAIBLE");
const antiWaste=makeState("tank",{complete:true});
antiWaste.endgame.rare_resources=[{
  name:"Crystal",stock:70,usage_known:true,current_use:true,
  next_use:{name:"Exclusive tier",cost:100,expected_gain:500,gain_unit:"confirmed points",gain_source:"confirmed tier table"},
  low_priority_use:{name:"Decoration level",cost:40,expected_gain:40,gain_unit:"confirmed points",gain_source:"confirmed decoration table"}
}];
const antiWasteReport=createEndgameCoachReport(antiWaste);
assert.equal(antiWasteReport.anti_waste.length,1,"Only like-for-like sourced costs and gains can produce an anti-waste comparison.");
assert.equal(antiWasteReport.anti_waste[0].params.preferred,"Exclusive tier");

const reloaded=createEndgameCoachReport(JSON.parse(JSON.stringify(complete)));
assert.deepEqual(reloaded,completeReport,"Recalculation after a reload must be deterministic and read-only.");

assert.equal(hasEndgameCoachProAccess({proActive:false}),false);
assert.equal(hasEndgameCoachProAccess({proActive:true}),true);
assert.equal(hasEndgameCoachProAccess({betaMode:true,betaAllowed:true,betaConsentAccepted:true}),true);
assert.equal(hasEndgameCoachProAccess({betaMode:true,betaAllowed:true,betaConsentAccepted:false,proActive:true}),false);
assert.equal(hasEndgameCoachProAccess({betaMode:true,betaAllowed:false,betaConsentAccepted:true}),false);

const fr=translator("fr"),en=translator("en-GB"),es=translator("es");
assert.equal(fr("qg35_title"),"🏆 QG35+ · Coach IA");
assert.equal(en("qg35_title"),"🏆 HQ35+ · AI Coach");
assert.equal(es("qg35_title"),en("qg35_title"),"Other locales should fall back to English.");
for(const [path,source] of [
  ["app.js",await readFile(new URL("../app.js",import.meta.url),"utf8")],
  ["index.html",await readFile(new URL("../index.html",import.meta.url),"utf8")],
  ["lib/endgame-coach.js",await readFile(new URL("../lib/endgame-coach.js",import.meta.url),"utf8")]
]){
  const refs=new Set([...source.matchAll(/["'](qg35_[A-Za-z0-9_]+)["']/g)].map(match=>match[1]));
  const dictionary=await readFile(new URL("../i18n.js",import.meta.url),"utf8");
  for(const key of refs)assert.ok(dictionary.includes(`${key}:`),`${path} references untranslated key ${key}`);
}

const appSource=await readFile(new URL("../app.js",import.meta.url),"utf8");
assert.match(appSource,/if\(requirePro\(\)\)\{renderEndgameCoachDrawer\(\)/,"Advanced details must pass through requirePro().");
assert.match(appSource,/if\(!betaPrivateDataVisible\(\)\)\{hideEndgameCoach\(\);return\}/,"Private-data masking must also hide the QG35 module.");
const packageJson=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
assert.equal(packageJson.version,"2.5.31");
const indexHtml=await readFile(new URL("../index.html",import.meta.url),"utf8");
assert.match(indexHtml,/id="qg35CoachCard"[^>]*class="moduleCard qg35HomeCard hidden"/);

console.log("QG35+ Coach eligibility, report completeness, privacy, access gating, translations, and read-only stability verified.");