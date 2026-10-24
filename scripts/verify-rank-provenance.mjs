import assert from "node:assert/strict";
import {sanitizeRosterRows} from "../api/scan.js";
import {applyRosterImportLifecycle,mergeRosterLifecycleMetadata} from "../lib/alliance-roster-lifecycle.js";
import {applyAllianceRankChanges,permissionTransitions,previewAllianceRankChanges,rankManagementKey} from "../lib/alliance-rank-management.js";
import {mergeCanonicalRoster} from "../lib/alliance-scope.js";
import {LAST_WAR_SCAN_RANK_SOURCE,MANUAL_RANK_SOURCE} from "../lib/rank-provenance.js";

const older="2026-09-20T10:00:00.000Z";
const manualAt="2026-09-21T10:00:00.000Z";
const newerScanAt="2026-09-22T10:00:00.000Z";
const ctx={serverId:"884",allianceTag:"WB"};
const member=(name,role,extra={})=>({name,role,server_id:"884",alliance_tag:"WB",player_id:`id-${name}`,warboost_linked:true,management_role:role==="R4"?"R4":"R1",...extra});

const scannedR4=sanitizeRosterRows({alliance_roster:[{name:"Alpha",role:"R4",hq_level:35,power_m:200}]},newerScanAt,"WB")[0];
assert.equal(scannedR4.role,"R4");
assert.equal(scannedR4.rank_confirmed_source,LAST_WAR_SCAN_RANK_SOURCE);
assert.equal(scannedR4.rank_confirmed_at,newerScanAt);

const scannedWithoutRank=sanitizeRosterRows({alliance_roster:[{name:"NoRank",hq_level:35,power_m:100}]},newerScanAt,"WB")[0];
assert.equal(scannedWithoutRank.role,null);
assert.equal(scannedWithoutRank.rank_confirmation_status,"unconfirmed");

const manualDemotion=member("Alpha","R3",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE});
const staleScan={...scannedR4,name:"Alpha",server_id:"884",alliance_tag:"WB",rank_confirmed_at:older};
const afterStale=mergeRosterLifecycleMetadata([manualDemotion],[staleScan])[0];
assert.equal(afterStale.role,"R3");
assert.equal(afterStale.rank_confirmed_source,MANUAL_RANK_SOURCE);

const afterNewScan=mergeRosterLifecycleMetadata([manualDemotion],[{...scannedR4,name:"Alpha",server_id:"884",alliance_tag:"WB"}])[0];
assert.equal(afterNewScan.role,"R4");
assert.equal(afterNewScan.rank_confirmed_source,LAST_WAR_SCAN_RANK_SOURCE);

const imported=applyRosterImportLifecycle({members:[manualDemotion],review:[],former:[]},[{...scannedR4,name:"Alpha",server_id:"884",alliance_tag:"WB"}],{now:newerScanAt});
assert.equal(imported.members[0].role,"R4");

const r4=member("R4","R4",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE});
const r3=member("R3","R3",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE});
const demotionPreview=previewAllianceRankChanges([r4,r3],[{key:rankManagementKey(r4),to_role:"R3"}]);
assert.equal(demotionPreview.ok,true);
assert.equal(permissionTransitions(demotionPreview)[0].management_role,"R1");
const demoted=applyAllianceRankChanges([r4,r3],[{key:rankManagementKey(r4),to_role:"R3"}],{now:newerScanAt}).members;
assert.equal(demoted.find(x=>x.name==="R4").role,"R3");
assert.equal(demoted.find(x=>x.name==="R4").rank_confirmed_source,MANUAL_RANK_SOURCE);

const tenR4=Array.from({length:10},(_,i)=>member(`R4-${i}`,"R4",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE}));
const extraR1=member("R1","R1",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE});
const overLimit=previewAllianceRankChanges([...tenR4,extraR1],[{key:rankManagementKey(extraR1),to_role:"R4"}]);
assert.equal(overLimit.ok,false);
assert.equal(overLimit.errors[0].code,"r4_limit");

const twoR5=[member("Boss","R5",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE}),member("Second","R5",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE})];
const lastR5=previewAllianceRankChanges(twoR5,[{key:rankManagementKey(twoR5[0]),to_role:"R3"}]);
assert.equal(lastR5.ok,true);
const oneR5=previewAllianceRankChanges([twoR5[0]],[{key:rankManagementKey(twoR5[0]),to_role:"R3"}]);
assert.equal(oneR5.ok,false);
assert.equal(oneR5.errors[0].code,"r5_protected");

const canonicalOld=[member("Alpha","R3",{rank_confirmed_at:manualAt,rank_confirmed_source:MANUAL_RANK_SOURCE})];
const canonicalNew=[{...member("Alpha","R4"),rank_confirmed_at:newerScanAt,rank_confirmed_source:LAST_WAR_SCAN_RANK_SOURCE}];
assert.equal(mergeCanonicalRoster(canonicalOld,canonicalNew,ctx)[0].role,"R4");
assert.equal(mergeCanonicalRoster(canonicalNew,[{...canonicalOld[0],rank_confirmed_at:older}],ctx)[0].role,"R4");

console.log("Rank provenance, scan confirmation, manual precedence, R5 uniqueness and R4 limit verification: PASS");