import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {previewAllianceRankChanges,permissionTransitions,rankManagementKey,cloudRankManagerAccess,confirmedCanonicalSelfRole} from "../lib/alliance-rank-management.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const member=(name,role,extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",warboost_linked:true,...extra});

{
  const members=[member("Surplus R5","R5",{player_id:"p-surplus"}),member("Keeper R5","R5",{player_id:"p-keeper"}),member("Officer","R4",{player_id:"p4"})];
  const change={key:rankManagementKey(members[0]),to_role:"R3"};
  const preview=previewAllianceRankChanges(members,[change]);
  assert.equal(preview.ok,true);
  assert.equal(preview.after.R5,1);
  assert.equal(preview.changes[0].to_role,"R3");
  assert.deepEqual(permissionTransitions(preview),[]);
  console.log("PASS: R5 -> R3 with two R5 keeps one R5 and needs no permission transition");
}

{
  const only=[member("Only R5","R5",{player_id:"p-only"})];
  const protectedPreview=previewAllianceRankChanges(only,[{key:rankManagementKey(only[0]),to_role:"R1"}]);
  assert.equal(protectedPreview.ok,false);
  assert.equal(protectedPreview.errors[0].code,"r5_protected");
  const invalidPromotion=previewAllianceRankChanges([member("Officer","R4",{player_id:"p4"})],[{key:rankManagementKey({name:"Officer",server_id:"884",alliance_tag:"ALL4"}),to_role:"R5"}]);
  assert.equal(invalidPromotion.ok,false);
  assert.equal(invalidPromotion.errors[0].code,"r5_separate");
  console.log("PASS: last R5 remains protected and R5 promotion stays outside the batch flow");
}

{
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R5",ownerPlayerId:"other"}).allowed,true);
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R4",ownerPlayerId:"other"}).allowed,true);
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R3",ownerPlayerId:"other"}).allowed,false);
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R1",ownerPlayerId:"u"}).allowed,true);
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R5",ownerPlayerId:"other"}).cloud_role_available,true);
  assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"",ownerPlayerId:"other"}).allowed,false);
  console.log("PASS: only verified R4/R5 or the owner is authorized; missing cloud role is denied");
}

{
  const unique=confirmedCanonicalSelfRole([member("Me","R5",{player_id:"u"})],"u");
  assert.equal(unique.ok,true);
  assert.equal(unique.role,"R5");
  const ambiguous=confirmedCanonicalSelfRole([member("Me A","R5",{player_id:"u"}),member("Me B","R4",{player_id:"u"})],"u");
  assert.equal(ambiguous.ok,false);
  assert.equal(ambiguous.code,"member_identity_ambiguous");
  const other=confirmedCanonicalSelfRole([member("Other","R5",{player_id:"other"})],"u");
  assert.equal(other.ok,false);
  assert.equal(other.code,"member_identity_unconfirmed");
  console.log("PASS: own-role resync requires one and only one linked canonical identity");
}

{
  const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,fetch:globalThis.fetch};
  try{
    process.env.SUPABASE_URL="https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY="test-only";
    const calls=[];
    globalThis.fetch=async(url,options={})=>{
      calls.push({url:String(url),options});
      return new Response("[]",{status:200});
    };
    const {updateAllianceScopeRoster}=await import("../lib/supabase.js?rankSafety=1");
    await assert.rejects(
      ()=>updateAllianceScopeRoster({alliance_id:"a1",roster:[member("Surplus R5","R3")],expected_updated_at:"2026-09-19T10:00:00.000Z"}),
      error=>error?.status===409&&error?.code==="alliance_write_conflict"
    );
    assert.match(calls[0].url,/updated_at=eq\.2026-09-19T10%3A00%3A00\.000Z/);
    console.log("PASS: concurrent alliance revision is rejected by the CAS write");
  }finally{
    globalThis.fetch=previous.fetch;
    if(previous.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previous.url;
    if(previous.key===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
  }
}

const roleApi=read("api/alliance-role.js"),diagnosticApi=read("api/alliance-roster-diagnostic.js"),app=read("app.js");
assert.match(roleApi,/action==="sync_own_role"/);
assert.match(roleApi,/player_id:user\.id/);
assert.match(roleApi,/expected_updated_at:actor\.updated_at/);
assert.match(roleApi,/member_identity_ambiguous/);
assert.match(app,/rank_manager_error_conflict/);
assert.match(app,/cloud_role_verified===true/);
assert.match(app,/rank_manager_current_r5/);
assert.match(app,/data-rank-current="\$\{from\}"/);
assert.match(app,/function rankManagerSyncState\(\)/);
assert.match(app,/rankManagerSyncSelfBtn/);
assert.match(app,/legacy_local_roster_capped_at_100/);
assert.match(app,/\/api\/alliance-roster-diagnostic/);
assert.match(diagnosticApi,/method!=="GET"/);
assert.doesNotMatch(diagnosticApi,/method:"(POST|PATCH|DELETE)"/);
console.log("R5 -> R3 cloud authorization safety verification: PASS");