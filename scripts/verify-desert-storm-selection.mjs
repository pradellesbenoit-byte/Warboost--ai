import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cloudRankManagerAccess,confirmedCanonicalSelfRole} from "../lib/alliance-rank-management.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js"),api=read("api/alliance-role.js");

const member=(name,role,extra={})=>({name,role,server_id:"884",alliance_tag:"ALL4",warboost_linked:true,...extra});
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R5",ownerPlayerId:"other"}).allowed,true);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R4",ownerPlayerId:"other"}).allowed,true);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R3",ownerPlayerId:"other"}).allowed,false);
assert.equal(cloudRankManagerAccess({userId:"u",membershipRole:"R1",ownerPlayerId:"u"}).allowed,true);
assert.equal(confirmedCanonicalSelfRole([member("Me","R4",{player_id:"u"})],"u").ok,true);
assert.equal(confirmedCanonicalSelfRole([member("A","R4",{player_id:"u"}),member("B","R5",{player_id:"u"})],"u").ok,false);

assert.match(api,/req\.body\?\.action==="sync_own_role"/);
assert.match(api,/if\(!access\.owner&&!\["R4","R5"\]\.includes\(self\.role\)\)/);
assert.match(app,/function desertStormSelectionAccess\(\)/);
assert.match(app,/body:JSON\.stringify\(\{action:"sync_own_role"\}\)/);
assert.match(app,/saveState\(\{renderUi:false\}\)/);
assert.match(app,/current\.registered_keys=\[\.\.\.set\]/);
assert.match(app,/data-ds-player-key=.*disabled/);
assert.match(app,/ds_selection_requires_verified_access/);
assert.match(app,/ds_selection_syncing/);
assert.match(app,/desertStormRoleResyncAttempted=true/);
assert.match(app,/if\(rosterDiagnosticPromise\|\|!cloudSession\?\.access_token\)return false/);
const picker=app.slice(app.indexOf("function renderDesertStormPicker()"),app.indexOf("function renderDesertStormPlan()"));
assert.match(picker,/if\(!hasDeclaredAllianceCommandRole\(\)\)\{ch\.checked=!ch\.checked;return\}/);
assert.match(picker,/ch\.checked\?set\.add\(key\):set\.delete\(key\)/);
assert.doesNotMatch(picker,/saveState\(\);\s*render\(\)/);

console.log("Desert Storm mobile selection safety verification: PASS");