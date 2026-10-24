import assert from "node:assert/strict";
import fs from "node:fs";
import {buildDiagnosticShop} from "../lib/diagnostic-shop.js";
import {renderDiagnosticShop} from "../lib/diagnostic-shop-ui.js";
import {buildGlobalDiagnostic} from "../lib/player-global-diagnostic.js";
const now=Date.now(),date=new Date(now).toISOString();
const run=(p,state={})=>buildDiagnosticShop({priorities:[p]},state,"fr",now);
const exclusive={kind:"exclusive",hero:"DVA",title:"Arme exclusive DVA",current:26};
const e=run(exclusive);
assert.match(e[0].note,/pas son déverrouillage initial/);
assert.ok(e[0].options.some(o=>o.item.includes("Universel")));
assert.ok(e[0].options.every(o=>o.fresh===false));
const locked=run({...exclusive,current:0});
assert.equal(locked[0].options[0].type,"unknown");
assert.ok(!locked[0].options.some(o=>/Universel/.test(o.item)));
assert.match(locked[0].options[0].cost,/à vérifier/);
for(const [family,word] of [["drone_parts","Pièce"],["drone_components","Composant"],["drone_chips","Puce"]]){
 const card=run({kind:"drone",resource_family:family,title:family})[0];
 assert.ok(card.options.some(o=>o.item.includes(word)),family);
 assert.ok(card.options.every(o=>!(/Pièce/.test(o.item)&&family!=="drone_parts")));
}
const p={kind:"drone",resource_family:"drone_parts",title:"Pièces Drone"};
const state={shop:{store_type:"alliance",updated_at:date,offers:[
 {item_name:"Pièce de Drone",price:0,currency:"alliance_coins",offer_kind:"reward"},
 {item_name:"Pièce de Drone · pack",price:4.99,currency:"EUR",price_confidence:0.99},
]}};
const c=run(p,state)[0],types=c.options.map(o=>o.type);
assert.deepEqual(types,["free","internal","paid"]);
assert.ok(c.options.every(o=>!o.fresh),"envelope timestamp cannot certify current availability");
const html=renderDiagnosticShop([c]);
assert.match(html,/Gratuit \/ récompense/);assert.match(html,/Monnaie du jeu/);
assert.match(html,/Argent réel · optionnel/);assert.match(html,/Prix observé · peut varier/);
assert.match(html,/4,99/);assert.doesNotMatch(html,/<a |checkout|https?:\/\//);
const unknownPrice=run(p,{shop:{store_type:"alliance",updated_at:date,offers:[
 {item_name:"Pièce de Drone",price:null,currency:"alliance_coins"},
]}})[0];
assert.ok(unknownPrice.options.some(o=>o.cost.includes("à vérifier")));
assert.ok(!unknownPrice.options.some(o=>o.cost==="0 points d’alliance"));
const ancient=run(p,{shop:{store_type:"Centre commercial · Pass Hebdomadaire",updated_at:"2026-10-01",offers:[
 {item_name:"S1 Pass Hebdomadaire de Pièces de Drone",price:7.89,currency:"EUR"},
]}})[0];
assert.ok(ancient.options.some(o=>o.cost.includes("7,89")&&!o.fresh));
assert.match(renderDiagnosticShop([ancient]),/Prix observé · peut varier/);
assert.match(renderDiagnosticShop([ancient]),/non garanti en direct/);
assert.equal(run({kind:"scan"}).length,0);
assert.equal(renderDiagnosticShop([]),"");
const unknownResource=run({kind:"technology",resource_name:"Matériau non reconnu",title:"Technologie"})[0];
assert.match(unknownResource.options[0].cost,/à vérifier/);
assert.equal(unknownResource.options[0].item,"Matériau non reconnu");
const uncertainCurrency=run({kind:"technology",resource_name:"Matériau non reconnu",title:"Technologie"},
 {shop:{offers:[{item_name:"Matériau non reconnu",price:9,currency:"EUR",currency_confidence:0.2}]}})[0];
assert.ok(uncertainCurrency.options.some(o=>o.type==="unknown"&&o.cost.includes("à vérifier")));
const analysis={priorities:[exclusive,p,{kind:"level",title:"EXP"}, {kind:"gear",title:"Equipement"}]};
analysis.global_diagnostic=buildGlobalDiagnostic({drone:{level:164},exclusive_weapons:[{hero_name:"DVA",level:26}]},analysis);
const before=JSON.stringify(analysis);
const cards=buildDiagnosticShop(analysis,{exclusive_weapons:[{hero_name:"DVA",level:26}]},"fr",now);
assert.ok(cards.length<=3);
assert.ok(!cards.some(c=>c.title==="Equipement"));
assert.equal(JSON.stringify(analysis),before,"shop never modifies the approved diagnostic/plan");
const fallback=buildDiagnosticShop({global_diagnostic:{priorities:[{domain:"hero:dva:exclusive",title:"DVA"}]}},
 {exclusive_weapons:[{hero_name:"DVA",level:26}]});
assert.ok(fallback[0].options.some(o=>/Universel/.test(o.item)));
assert.ok(run(p,{shop:{review_state:"pending",offers:[{item_name:"Pièce de Drone",price:0,currency:"alliance_coins"}]}})[0].options.every(o=>o.type!=="free"));
assert.ok(run(p,{shop:{offers:[{item_name:"Pièce de Drone",price:0,currency:"alliance_coins",sold:true}]}})[0].options.every(o=>o.type!=="free"));
const safe=renderDiagnosticShop([{title:"<script>bad</script>",options:[{item:"<img onerror='x'>",store:"x",cost:"?",type:"internal",fresh:false}]}]);
assert.doesNotMatch(safe,/<script|<img/);
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(app,/diagnosticShop\.innerHTML=renderDiagnosticShop\(buildDiagnosticShop\(analysis,state,lang\)/);
assert.match(app,/function invalidatePlayerAdvice/);
assert.ok(!renderDiagnosticShop([c],{locale:"en-GB"}).includes("Argent réel"));
console.log("PASS: compact diagnostic shop — scoped priorities, DVA unlock/upgrade, distinct Drone resources, free/game/paid order, uncertain/old prices, pending/sold exclusion, immutable plan, safe localized markup.");