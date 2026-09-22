import assert from "node:assert/strict";
import {mergeSharedAllianceRoster} from "../lib/shared-alliance-roster.js";
import {previewSelfIdentityLink} from "../lib/alliance-rank-management.js";

const context={serverId:"884",allianceTag:"ALL4"};
const canonical=Array.from({length:100},(_,i)=>({
  canonical_member_key:`canonical:member-${i}|884|ALL4`,
  name:i===0?"R4Player":`Member${i}`,
  server_id:"884",
  alliance_tag:"ALL4",
  role:i===0?"R4":"R1",
  warboost_linked:false
}));
const localState={members:[]};
const merged=mergeSharedAllianceRoster(canonical,localState.members,context);
assert.equal(merged.length,100,"an empty personal roster must display the complete shared roster");
assert.equal(merged.some(row=>row.name==="Member99"),true,"an unlinked member remains visible");

const exact=previewSelfIdentityLink(merged,{userId:"r4-account",name:"R4Player",serverId:"884",allianceTag:"ALL4"});
assert.equal(exact.ok,true,"the exact shared identity must be linkable");
assert.equal(exact.member.role,"R4");
assert.equal(previewSelfIdentityLink(merged,{userId:"missing",name:"Nobody",serverId:"884",allianceTag:"ALL4"}).code,"self_identity_no_match");

const ambiguous=[...merged,{...merged[0],canonical_member_key:"canonical:r4-duplicate|884|ALL4"}];
assert.equal(previewSelfIdentityLink(ambiguous,{userId:"ambiguous",name:"R4Player",serverId:"884",allianceTag:"ALL4"}).code,"member_identity_ambiguous");

const locallyEnriched=mergeSharedAllianceRoster(canonical,[{...canonical[0],player_id:"r4-account",warboost_linked:true,power_m:812.4,activity_events:[{event_type:"vs",status:"participated",updated_at:"2026-09-22T10:00:00.000Z"}]}],context);
assert.equal(locallyEnriched.length,100,"local enrichment must not append or remove shared rows");
assert.equal(locallyEnriched[0].player_id,"r4-account");
assert.equal(locallyEnriched[0].power_m,812.4);
assert.equal(mergeSharedAllianceRoster(locallyEnriched,[],context).length,100,"reopening keeps the shared roster size");
console.log("shared alliance roster verification passed");