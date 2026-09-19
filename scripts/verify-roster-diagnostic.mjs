import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const apiFiles=fs.readdirSync(path.join(root,"api")).filter(file=>file.endsWith(".js")).sort();
const roleApi=read("api/alliance-role.js"),app=read("app.js"),server=read("server.mjs");

assert.equal(apiFiles.length,12,`Expected 12 Vercel functions, found ${apiFiles.length}`);
assert.equal(apiFiles.includes("alliance-roster-diagnostic.js"),false);
assert.match(roleApi,/req\.method==="GET"&&String\(req\.query\?\.action\|\|""\)==="roster_diagnostic"/);
assert.match(roleApi,/requireBetaUser\(req,\{consent:true\}\)/);
assert.match(roleApi,/getAllianceMembership\(user\.id\)/);
assert.match(roleApi,/getAllianceRoster\(user\.id\)/);
assert.match(roleApi,/source:canonical\.length\?"canonical":"cloud_members"/);
assert.match(app,/\/api\/alliance-role\?action=roster_diagnostic/);
assert.doesNotMatch(app,/\/api\/alliance-roster-diagnostic/);
assert.doesNotMatch(server,/alliance-roster-diagnostic/);

console.log("Roster diagnostic grouping and Vercel function-count verification: PASS (12 functions)");