import assert from "node:assert/strict";
import fs from "node:fs";
import {canonicalRosterMemberKey,resolveCanonicalRosterMember,previewAllianceRankChanges,rankManagementKey} from "../lib/alliance-rank-management.js";

const context={serverId:"884",allianceTag:"ALL4"};
const member=(name,role="R5",extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",...extra});
const manulegaulois=member("manulegaulois");
const roster=Array.from({length:92},(_,i)=>member(`Player ${i+1}`,"R1"));
roster.splice(40,0,manulegaulois,member("other-r5"));
const canonicalKey=canonicalRosterMemberKey(manulegaulois,context);
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const stateApi=fs.readFileSync(new URL("../api/state.js",import.meta.url),"utf8");
assert.match(app,/member_key:memberKey\|\|null/);
assert.match(stateApi,/canonical_member_key:canonicalRosterMemberKey/);
assert.equal(canonicalKey,"canonical:manulegaulois|884|ALL4");

{
  const draft=previewAllianceRankChanges(roster,[{key:rankManagementKey(manulegaulois),to_role:"R3"}]);
  assert.equal(draft.ok,true);
  const resolved=resolveCanonicalRosterMember(roster,{member_key:canonicalKey,name:"manulegaulois",server_id:"884",alliance_tag:"ALL4"},{...context});
  assert.equal(resolved.ok,true);
  assert.equal(resolved.mode,"member_key");
  const next=roster.map((row,index)=>index===resolved.index?{...row,role:"R3"}:row);
  assert.equal(next[resolved.index].name,"manulegaulois");
  assert.equal(next.filter(row=>row.role==="R3").length,1);
  assert.equal(next.filter(row=>row.role==="R5").length,1);
  assert.equal(next.filter(row=>row.name!=="manulegaulois"&&row.role==="R3").length,0);
  console.log("PASS: canonical 94-row roster resolves the UI draft and updates only manulegaulois");
}

{
  const resolved=resolveCanonicalRosterMember(roster,{member_key:"canonical:obsolete|884|ALL4",name:"manulegaulois",server_id:"884",alliance_tag:"ALL4",from_role:"R5"},context);
  assert.equal(resolved.ok,true);
  assert.equal(resolved.mode,"identity_fallback");
  assert.equal(resolved.member.name,"manulegaulois");
  console.log("PASS: obsolete canonical key falls back only to the exact unique identity");
}

{
  const duplicate=[...roster,member("manulegaulois","R5",{server_id:"Server 884"})];
  const resolved=resolveCanonicalRosterMember(duplicate,{member_key:"canonical:obsolete|884|ALL4",name:"manulegaulois",server_id:"884",alliance_tag:"ALL4",from_role:"R5"},context);
  assert.equal(resolved.ok,false);
  assert.equal(resolved.code,"member_identity_ambiguous");
  console.log("PASS: duplicate normalized identity is rejected as ambiguous");
}

{
  const resolved=resolveCanonicalRosterMember(roster,{member_key:"canonical:missing|884|ALL4",name:"missing",server_id:"884",alliance_tag:"ALL4",from_role:"R5"},context);
  assert.equal(resolved.ok,false);
  assert.equal(resolved.code,"member_not_found");
  console.log("PASS: genuinely absent member is rejected");
}

{
  const wrongRole=resolveCanonicalRosterMember(roster,{member_key:"canonical:obsolete|884|ALL4",name:"manulegaulois",server_id:"884",alliance_tag:"ALL4",from_role:"R4"},context);
  assert.equal(wrongRole.ok,false);
  assert.equal(wrongRole.code,"member_not_found");
  const missingExpectedRole=resolveCanonicalRosterMember(roster,{member_key:"canonical:obsolete|884|ALL4",name:"manulegaulois",server_id:"884",alliance_tag:"ALL4"},context);
  assert.equal(missingExpectedRole.ok,false);
  assert.equal(missingExpectedRole.code,"member_identity_required");
  console.log("PASS: fallback requires the expected current role and refuses an absent role");
}