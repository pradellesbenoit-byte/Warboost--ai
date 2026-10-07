import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {applyReviewedSquad,reviewedSquadPower,scanFieldDescription,squadPendingDescription} from "../lib/squad-scan-review.js";
import {createScanReviewDraft,applyOwnedScanReview} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {stampConfirmedRecord} from "../lib/field-freshness.js";
import {confirmedHeroPower} from "../lib/hero-power.js";
import {normalizeState} from "../lib/normalize.js";
import {repairLegacySquadIdentity} from "../lib/squad-identity.js";
import {catalogHeroName} from "../lib/heroes.js";
import {translator} from "../i18n.js";

const clone=x=>JSON.parse(JSON.stringify(x));
const at="2026-10-07T12:00:00.000Z",old="2026-10-01T12:00:00.000Z";
const names=["Kimberly","Murphy","Marshall","DVA","Stetmann"].map(catalogHeroName);
const heroes=names.map(name=>({name,level:150,stars:5,power:5000000,exclusive:null,awakening:null,gear:"count=4;level=40",updated_at:old,source:"confirmed_manual"}));
const base={player_id:"fixture-a",player:{},squads:[{id:1,power:42,power_sync_status:"confirmed",heroes:clone(heroes),confirmed_composition:names,composition_confirmed_at:old,composition_source:"explicit_confirmation"}],sync:{sources:{}}};
let checks=0;
const check=(label,fn)=>{fn();checks++;console.log(`PASS ${label}`)};
check("partial scan preserves confirmed identities/fields and updates exact hero",()=>{
  const before=JSON.stringify(base),result=applyReviewedSquad(base,{squadId:1,heroes:[{name:names[0],level:155}],updatedAt:at});
  assert.equal(JSON.stringify(base),before);
  assert.equal(result.state.squads[0].heroes[0].level,155);
  assert.equal(result.state.squads[0].heroes[0].power,5000000);
  assert.equal(result.state.squads[0].power,42);
  assert.deepEqual(result.state.squads[0].confirmed_composition,names);
  assert.equal(result.state.squads[0].composition_confirmed_at,old);
  assert.ok(result.pending.some(x=>x.slot===2&&x.field==="name"));
  assert.equal(result.state.hero_profiles[0].level,155);
  assert.equal(result.state.squads[0].heroes[0].field_updated_at.power,old,"omitted confirmed power must not get a fresh scan timestamp");
  const reopened=normalizeState(result.state);
  assert.ok(reopened.squads[0].composition_conflict.scan_pending.length);
  assert.equal(reopened.squads[0].heroes[0].level,155);
});
for(const [label,scanned,reason] of [
  ["missing hero",[{level:170}],"missing"],
  ["unrecognized hero",[{name:"OCR ???",level:170}],"unknown"],
  ["duplicate hero",[{name:names[0],level:170},{name:names[0],power:9}],"duplicate"],
  ["new identity in partial scan",[{name:"Tesla",level:170}],"unlinked"]
]){
  check(label,()=>{
    const result=applyReviewedSquad(base,{squadId:1,heroes:scanned,updatedAt:at});
    assert.equal(result.complete,false);
    for(const [index,hero] of heroes.entries())for(const field of Object.keys(hero))assert.deepEqual(result.state.squads[0].heroes[index][field],hero[field]);
    assert.deepEqual(result.state.squads[0].confirmed_composition,names);
    assert.ok(result.pending.some(x=>x.reason===reason));
  });
}
check("complete composition merges missing secondary fields without erasing confirmations",()=>{
  const result=applyReviewedSquad(base,{squadId:1,heroes:names.map(name=>({name})),updatedAt:at});
  assert.equal(result.complete,true);
  assert.deepEqual(result.state.squads[0].confirmed_composition,names);
  assert.equal(result.state.squads[0].heroes[0].level,150);
  assert.equal(result.state.squads[0].heroes[0].power,5000000);
  assert.ok(result.pending.length);
});
check("zero/unreadable secondary values cannot replace saved fields",()=>{
  const result=applyReviewedSquad(base,{squadId:1,heroes:[{name:names[0],level:0,power:"?"}],updatedAt:at});
  assert.equal(result.state.squads[0].heroes[0].level,150);
  assert.equal(result.state.squads[0].heroes[0].power,5000000);
});
check("composition change keeps the previous total in history unless a new total is confirmed",()=>{
  const changed=names.map(name=>({name}));changed[0]={name:"Tesla"};
  const result=applyReviewedSquad(base,{squadId:1,heroes:changed,updatedAt:at});
  assert.equal(result.state.squads[0].power,null);
  assert.equal(result.state.squads[0].last_confirmed_power,42);
  assert.equal(result.state.squads[0].power_sync_status,"pending");
  const withPower=applyReviewedSquad({...clone(base),squads:[{...clone(base.squads[0]),power:44.43}]},{squadId:1,heroes:changed,updatedAt:at,powerConfirmed:true});
  assert.equal(withPower.state.squads[0].power,44.43);
});
check("older partial hero evidence cannot overwrite a newer manual confirmation",()=>{
  const result=applyReviewedSquad(base,{squadId:1,heroes:[{name:names[0],level:100}],updatedAt:"2026-09-01T00:00:00Z"});
  assert.equal(result.state.squads[0].heroes[0].level,150);
});
check("millions normalization and visible accessible M unit",()=>{
  for(const value of ["44,43","44.43","44,43 M",44430000])assert.equal(reviewedSquadPower(value),44.43);
  for(const value of ["",null,0,"?"])assert.equal(reviewedSquadPower(value),null);
  const groups=buildScanReviewGroups("squad1",{squads:[{power:44430000}]});
  assert.equal(groups[0].rows[0].value,44.43);
  const markup=renderScanReviewMarkup(groups,key=>key,String);
  assert.match(markup.html,/scan_review_label_power \(M\)/);
  assert.match(markup.html,/scanReviewPowerUnit[^>]*> M/);
  assert.match(markup.html,/value="44\.43"/);
  assert.match(markup.html,/type="text"[^>]*inputmode="decimal"/);
});
check("field/hero-specific descriptions",()=>{
  assert.equal(scanFieldDescription(["squads",0,"heroes",2,"level"]),"Escouade 1 · héros 3 · niveau");
  assert.match(squadPendingDescription({slot:2,field:"name",reason:"unknown",value:"OCR ???"}),/Héros 2.*non reconnu.*OCR/);
});
check("review pruning retains the target indices for squads 2, 3 and 4",()=>{
  for(let index=1;index<4;index++){
    const squads=Array.from({length:index+1},(_,i)=>i===index?{power:44.43}:null);
    const result=applyOwnedScanReview({owner:"fixture-a",patch:{squads}},"fixture-a",[{path:["squads",index,"power"],value:"44,43"}]);
    assert.equal(result.patch.squads[index].power,44.43);
    assert.equal(result.patch.squads[0],null);
  }
});

// Exercise the production confirm handler, not a reimplemented UI controller.
// Storage/rendering and generic merge are isolated; OCR, ownership, parsing,
// squad application, field stamping and normalization are the actual modules.
const app=fs.readFileSync("app.js","utf8");
const handler=app.slice(app.indexOf("function confirmScanReview(){"),app.indexOf('$("#confirmScanReviewBtn")?.addEventListener'));
const statusHandler=app.slice(app.indexOf("function showSquadScanStatus("),app.indexOf("function confirmScanReview(){"));
function runHandler({patch,edits,owner="fixture-a",current=true,save=true}){
  const error={textContent:"",classList:{remove(){}}},status={textContent:"",dataset:{},replaceChildren(...nodes){this.textContent=nodes.map(node=>node.textContent).join("")}};
  const context=vm.createContext({
    state:clone(base),pendingScanReview:{owner:"fixture-a",type:"squad1",request:{},patch},
    lang:"fr",applyOwnedScanReview,applyReviewedSquad,reviewedSquadPower,scanFieldDescription,squadPendingDescription,
    stampConfirmedRecord,confirmedHeroPower,repairLegacySquadIdentity,
    pendingScanOwner:()=>owner,scanRequestIsCurrent:()=>current,scanReviewFormEdits:()=>({edits,issues:[]}),
    $:selector=>selector==="#scanReviewError"?error:selector==="#scanStatus"?status:{classList:{remove(){}}},
    t:translator("fr"),setScanReviewError:key=>{error.textContent=key},
    discardScanReviewDraft:()=>{context.pendingScanReview=null},
    safeClone:clone,emptySquad:()=>({heroes:[]}),
    mergeStateProtected:(previous,incoming)=>{
      const result=clone(previous),row=incoming.squads?.[0];
      if(row)result.squads[0]={...result.squads[0],...row};
      return result;
    },
    recordProgressionSnapshot:()=>{},saveState:()=>save,updateSquadCaptureHelp:()=>{},
    invalidatePlayerAdvice:()=>{},showConfirmedScanStatus:()=>{status.textContent="saved"},
    document:{createTextNode:text=>({textContent:text})},proFeatureAllowed:()=>false
  });
  vm.runInContext(`${statusHandler}\n${handler}\nconfirmScanReview()`,context);
  return {state:clone(context.state),pending:context.pendingScanReview,error:error.textContent,status:status.textContent};
}
check("real confirm handler accepts reliable power with missing heroes",()=>{
  const result=runHandler({patch:{squads:[{power:44.43,heroes:[]}]},edits:[{path:["squads",0,"power"],value:"44,43"}]});
  assert.equal(result.error,"");
  assert.equal(result.pending,null);
  assert.equal(result.state.squads[0].power,44.43);
  for(const [index,hero] of heroes.entries())for(const field of Object.keys(hero))assert.deepEqual(result.state.squads[0].heroes[index][field],hero[field]);
  assert.match(result.status,/Scan partiellement enregistré/);
  assert.match(result.status,/Éléments encore à confirmer/);
  assert.doesNotMatch(result.status,/Confirmé|fusionné/i);
});
check("invalid optional hero field stays pending while valid power saves",()=>{
  const patch={squads:[{power:44.43,heroes:[{name:names[0],level:170}]}]};
  const result=runHandler({patch,edits:[{path:["squads",0,"power"],value:"44,43"},{path:["squads",0,"heroes",0,"level"],value:"abc"}]});
  assert.equal(result.error,"");
  assert.equal(result.state.squads[0].power,44.43);
  assert.equal(result.state.squads[0].heroes[0].level,150);
  assert.match(result.status,/Héros 1.*nombre invalide/);
});
check("invalid squad power gives precise blocking error, no overwrite",()=>{
  for(const value of ["abc","0","-2"]){
    const result=runHandler({patch:{squads:[{power:44.43}]},edits:[{path:["squads",0,"power"],value}]});
    assert.match(result.error,/Escouade 1 · puissance/);
    assert.equal(result.state.squads[0].power,42);
    assert.ok(result.pending);
  }
});
check("localized squad input with M suffix safely normalizes before confirmation",()=>{
  const result=runHandler({patch:{squads:[{power:44.43}]},edits:[{path:["squads",0,"power"],value:"44,43 M"}]});
  assert.equal(result.error,"");
  assert.equal(result.state.squads[0].power,44.43);
});
check("individual hero power accepts a localized M unit without silently losing decimal separators",()=>{
  const result=runHandler({patch:{squads:[{power:44.43,heroes:[{name:names[0]}]}]},edits:[{path:["squads",0,"heroes",0,"power"],value:"5,65 M"}]});
  assert.equal(result.error,"");
  assert.equal(result.state.squads[0].heroes[0].power,5650000);
});
check("missing squad power preserves confirmed power",()=>{
  const result=runHandler({patch:{squads:[{power:0,heroes:[{name:names[0],level:155}]}]},edits:[{path:["squads",0,"power"],value:""}]});
  assert.equal(result.error,"");
  assert.equal(result.state.squads[0].power,42);
});
check("a scan with no reliable value remains open with a precise explanation",()=>{
  const result=runHandler({patch:{squads:[{heroes:[]}]},edits:[]});
  assert.match(result.error,/Aucune valeur fiable à confirmer/);
  assert.equal(result.state.squads[0].power,42);
  assert.ok(result.pending);
});
check("owner and capture guards still prevent confirmation",()=>{
  for(const options of [{owner:"fixture-b"},{current:false}]){
    const result=runHandler({patch:{squads:[{power:44.43}]},edits:[],...options});
    assert.equal(result.state.squads[0].power,42);
    assert.equal(result.pending,null);
  }
});
check("storage failure rolls back state and identifies storage",()=>{
  const result=runHandler({patch:{squads:[{power:44.43}]},edits:[],save:false});
  assert.match(result.error,/Enregistrement local impossible/);
  assert.equal(result.state.squads[0].power,42);
  assert.ok(result.pending);
});
console.log(`PASS ${checks} squad review scenarios`);
