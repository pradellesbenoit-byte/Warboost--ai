import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read=path=>fs.readFileSync(path,"utf8");
const app=read("app.js"),html=read("index.html"),css=read("styles.css"),publisher=read("publisher-ui.js");

assert.doesNotMatch(html,/allianceEventSummary/,"global event summary must be removed from Alliance HTML");
assert.doesNotMatch(app,/allianceEventSummary/,"global event summary must have no Alliance render path");
assert.doesNotMatch(css,/allianceEventSummary|eventCountChip/,"global event summary styles must be removed");
assert.doesNotMatch(html,/participation_player_history|Suivi détaillé par joueur/,"permanent player follow-up must be absent from the main Alliance page");
assert.match(html,/unlinkedWarBoostAccounts/,"WarBoost account linking panel must remain");
for(const type of ["desert_storm","canyon_storm","vs","season","other"])assert.match(app,new RegExp(`type:"${type}"`),`${type} event card must exist`);
for(const token of ["allianceEventGroups","allianceEventManualStatus","allianceEventPlan","alliancePlayerModal","data-alliance-player-key"])assert.match(app,new RegExp(token),`${token} event-first behavior must exist`);
assert.match(html,/allianceEventWorkspace/,"event-first Alliance workspace must remain visible");
// The activity history predates the visual refresh. It belongs to the
// manager-only activity section, not the event participant workspace.
function verifyActivityHistoryPlacement(markup){
  assert.equal([...markup.matchAll(/id="allianceParticipationTable"/g)].length,1,"activity history must exist exactly once");
  const activityStart=markup.indexOf('<div class="section activitySection allianceManagerOnly">');
  const activityEnd=markup.indexOf('<details id="rankManagerAccordion"',activityStart);
  assert.ok(activityStart>=0&&activityEnd>activityStart,"activity history must retain its manager-only section");
  assert.match(markup.slice(activityStart,activityEnd),/<div id="allianceParticipationTable" class="allianceParticipationTable"><\/div>/,"history starts empty and is populated from real member evidence");
  const workspace=markup.match(/<details id="allianceEventAccordion"[\s\S]*?<\/details>/)?.[0];
  assert.ok(workspace,"event workspace must remain");
  assert.doesNotMatch(workspace,/id="allianceParticipationTable"/,"event workspace must not duplicate activity history");
}
verifyActivityHistoryPlacement(html);
// Prove that the replacement still detects regressions, without editing files.
assert.throws(()=>verifyActivityHistoryPlacement(html.replace('id="allianceParticipationTable"','id="removedHistory"')));
assert.throws(()=>verifyActivityHistoryPlacement(html.replace('<div id="allianceParticipationTable" class="allianceParticipationTable"></div>','<div id="allianceParticipationTable" class="allianceParticipationTable">Fake member</div>')));
assert.throws(()=>verifyActivityHistoryPlacement(html.replace('class="section activitySection allianceManagerOnly"','class="section activitySection"')));
assert.throws(()=>verifyActivityHistoryPlacement(html.replace('<div id="allianceEventCards"','<div id="allianceParticipationTable"></div><div id="allianceEventCards"')));

const historyStart=app.indexOf("function renderAllianceParticipationTable(");
const historyEnd=app.indexOf("const ALLIANCE_EVENT_DEFS=",historyStart);
assert.ok(historyStart>=0&&historyEnd>historyStart,"real activity history renderer remains available");
const box={innerHTML:""};
const escaped=value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const context=vm.createContext({
  $:selector=>selector==="#allianceParticipationTable"?box:null,
  serverNow:new Date("2026-10-10T12:00:00Z"),
  t:key=>key,esc:escaped,
  playerParticipationInsight:member=>({
    member,records:member.records||[],by_type:[],total:{},evidence_key:"confirmed",
    latest_known_date:"2026-10-09",latest_participation_date:null
  }),
  participationCountsLine:()=>"",participationEvidenceLabel:key=>key,
  activityEventLabel:type=>type,participationDateLabel:value=>value,
  participationSourceLabel:source=>source,participationStatusIcon:()=>"",
  participationStatusLabel:status=>status
});
vm.runInContext(app.slice(historyStart,historyEnd),context);
context.renderAllianceParticipationTable([]);
assert.match(box.innerHTML,/participation_no_known/,"empty history shows the unknown state, not fabricated rows");
const members=[
  {name:"<Known & member>",records:[{event_date:"2026-10-09",event_type:"vs",participation_status:"participated",source:"player_self_report"}]},
  {name:"No evidence",records:[]}
];
const original=JSON.stringify(members);
context.renderAllianceParticipationTable(members);
assert.match(box.innerHTML,/&lt;Known &amp; member&gt;/,"real evidence is rendered with escaped member names");
assert.match(box.innerHTML,/player_self_report/,"record provenance remains visible");
assert.doesNotMatch(box.innerHTML,/No evidence/,"members without evidence do not become confirmed history");
assert.equal(JSON.stringify(members),original,"history rendering never modifies the member data");
assert.match(app,/renderAllianceParticipationTable\(members\)/,"alliance activity still invokes its history renderer");
assert.match(app,/function canonicalSelfRosterMember/,"linked-account display must resolve through the canonical roster");
assert.match(app,/canonicalSelfRosterMember\(\),displayName=canonical\?\.name/,"the profile field must display the linked canonical name");
assert.match(app,/selfNameKeys=new Set/,"stale pending aliases must be filtered for an already-linked account");
assert.match(publisher,/normalizeUnlinkedAccounts/,"stored stale pending aliases must use the shared canonical pending-state repair");
assert.match(app,/normalizeUnlinkedAccounts/,"runtime Alliance rendering must use the same canonical pending-state repair");

console.log("Targeted Alliance UI verification: PASS");