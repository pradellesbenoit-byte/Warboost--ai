import assert from "node:assert/strict";
import fs from "node:fs";
import {availabilityCapacityRoster} from "../lib/alliance-availability-planner.js";

const html=fs.readFileSync("index.html","utf8"),app=fs.readFileSync("app.js","utf8"),css=fs.readFileSync("styles.css","utf8");
const members=[
  {name:"R3 Canyon",role:"R3",canonical_member_key:"canyon-r3",warboost_linked:true},
  {name:"R3 Desert",role:"R3",canonical_member_key:"desert-r3",warboost_linked:true},
  {name:"R4 Manual",role:"R4",canonical_member_key:"manual-r4",warboost_linked:false},
  {name:"No Reply",role:"R2",canonical_member_key:"unknown-r2",warboost_linked:false}
];
const rows=[
  {canonical_member_key:"canyon-r3",event_type:"canyon_storm",status:"present",source:"player_self_report"},
  {canonical_member_key:"desert-r3",event_type:"desert_storm",status:"present",source:"player_self_report"},
  {canonical_member_key:"manual-r4",event_type:"canyon_storm",status:"absent",source:"alliance_manager_manual"}
];
const canyon=availabilityCapacityRoster(members,rows,{event_type:"canyon_storm"});
const desert=availabilityCapacityRoster(members,rows,{event_type:"desert_storm"});
assert.deepEqual(canyon.participants.map(x=>x.name),["R3 Canyon"]);
assert.deepEqual(desert.participants.map(x=>x.name),["R3 Desert"]);
assert.deepEqual(canyon.excluded.map(x=>x.name),["R4 Manual"]);
assert.deepEqual(canyon.confirmation.map(x=>x.name),["R3 Desert","No Reply"]);
assert.match(html,/id="allianceEventWorkspace"/);
assert.doesNotMatch(html,/Suivi détaillé par joueur · 30 jours|id="allianceParticipationTable"/);
for(const group of ["alliance_event_participants","alliance_event_substitutes","alliance_event_confirming","alliance_event_absent"])assert.match(app,new RegExp(group));
assert.match(app,/data-alliance-player-key/);
assert.match(app,/data-alliance-player-close/);
assert.match(app,/alliancePlayerModalCloseButton/);
assert.match(app,/openRoster:true/);
assert.match(app,/groups\.totalMembers/);
assert.doesNotMatch(app,/allianceEventDetailCloseButton|data-alliance-event-close/,"event details close from the event header/card, not extra close buttons");
assert.match(app,/allianceEventDetailOpen/);
assert.match(app,/toggleAllianceEventDetail/);
assert.match(app,/warboostAllianceEventDetail/);
assert.match(app,/history\.pushState[\s\S]*warboostAlliancePlayerModal/);
assert.match(app,/addEventListener\("popstate"/);
assert.match(app,/document\.body\.style\.overflow="hidden"/);
assert.match(app,/alliancePlayerModalScrollTop/);
for(const key of ["events","ranks","members","desert","canyon"])assert.match(html,new RegExp(`data-alliance-accordion="${key}"`),`${key} Alliance block must be an accordion`);
assert.match(app,/bindAllianceAccordions/);
assert.match(app,/resetAllianceAccordions/);
assert.match(app,/allianceEventChevron/);
assert.match(css,/allianceEventCards[\s\S]*@media\(max-width:560px\)/);
assert.match(css,/alliancePlayerModalClose[\s\S]*min-width:48px/);
assert.match(css,/allianceAccordionSummary/);
assert.match(css,/allianceEventChevron/);

console.log("Alliance event-first workspace verification: PASS");