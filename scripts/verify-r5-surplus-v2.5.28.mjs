import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {previewAllianceRankChanges,applyAllianceRankChanges,rankManagementKey} from "../lib/alliance-rank-management.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const member=(name,role)=>({name,role,server_id:"884",alliance_tag:"ALL4",power_m:100});
const manulegaulois=member("manulegaulois","R5");
const nono=member("Nono 50","R5");
const surplus=[manulegaulois,nono,member("R4-1","R4")];

{
  const change={key:rankManagementKey(manulegaulois),to_role:"R4"};
  const preview=previewAllianceRankChanges(surplus,[change]);
  assert.equal(preview.ok,true);
  assert.equal(preview.before.R5,2);
  assert.equal(preview.after.R5,1);
  assert.equal(preview.changes[0].name,"manulegaulois");
  const applied=applyAllianceRankChanges(surplus,[change],{now:"2026-09-18T12:00:00.000Z"});
  assert.equal(applied.changed,true);
  assert.equal(applied.members.find(x=>x.name==="manulegaulois").role,"R4");
  assert.equal(applied.members.find(x=>x.name==="Nono 50").role,"R5");
  console.log("PASS: with two R5, the selected surplus R5 can be downgraded and one R5 remains");
}

{
  const onlyNono=[nono,member("R4-1","R4")];
  const change={key:rankManagementKey(nono),to_role:"R3"};
  const preview=previewAllianceRankChanges(onlyNono,[change]);
  assert.equal(preview.ok,false);
  assert.equal(preview.errors[0].code,"r5_protected");
  assert.equal(preview.changes.length,0);
  const applied=applyAllianceRankChanges(onlyNono,[change],{now:"2026-09-18T12:00:00.000Z"});
  assert.equal(applied.changed,false);
  assert.equal(applied.members.find(x=>x.name==="Nono 50").role,"R5");
  console.log("PASS: with one R5, downgrade is rejected and the last R5 stays protected");
}

{
  const promotion=previewAllianceRankChanges([member("R4-1","R4")],[{key:rankManagementKey(member("R4-1","R4")),to_role:"R5"}]);
  assert.equal(promotion.ok,false);
  assert.equal(promotion.errors[0].code,"r5_separate");
  console.log("PASS: promotion to R5 remains a separate protected operation");
}

const app=read("app.js"),api=read("api/alliance-role.js"),html=read("index.html");
assert.match(app,/rankManagerR5Warning/);
assert.match(app,/protectedR5/);
assert.match(app,/rank_manager_multiple_r5/);
assert.match(html,/id="rankManagerR5Warning"/);
assert.match(api,/remainingR5/);
assert.match(api,/error:"r5_protected"/);
console.log("WarBoost V2.5.28 surplus R5 verification: PASS");