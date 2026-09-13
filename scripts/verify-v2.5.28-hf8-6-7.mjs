import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {normalizeLastWarNickname,lastWarIdentity,linkCurrentPlayerIdentityIntoRoster} from "../lib/alliance-identity.js";
import {mergeCloudRosterWithIdentity} from "../lib/alliance-roster-merge.js";

assert.equal(normalizeLastWarNickname("[ALL4]ToyN","ALL4"),"toyn");
assert.equal(lastWarIdentity({name:"[ALL4]ToyN",server_id:"884",alliance_tag:"ALL4"}).nickname,"ToyN");
assert.equal(normalizeLastWarNickname("xXx Kaufik ALL4 xXx","ALL4"),"xxx kaufik all4 xxx");
assert.equal(normalizeLastWarNickname("[OTHER]ToyN","ALL4"),"[other]toyn");

const roster=[{name:"ToyN",role:"R4",server_id:"884",alliance_tag:"ALL4",power_m:231},{name:"Bay004",role:"R3",server_id:"884",alliance_tag:"ALL4",power_m:283}];
const cloud=[{player_id:"p-toyn",name:"[ALL4]ToyN",server_id:"884",alliance_tag:"ALL4",power_m:240},{player_id:"p-bay",name:"[ALL4]Bay004",server_id:"884",alliance_tag:"ALL4",power_m:290}];
const merged=mergeCloudRosterWithIdentity(roster,cloud,{serverId:"884",allianceTag:"ALL4"});
assert.equal(merged.unlinked_accounts.length,0);
assert.equal(merged.roster.length,2);
assert.equal(merged.roster[0].name,"ToyN");
assert.equal(merged.roster[0].player_id,"p-toyn");
assert.equal(merged.roster[0].warboost_linked,true);
assert.equal(merged.roster[0].power_m,240);
assert.equal(merged.roster[1].name,"Bay004");
assert.equal(merged.roster[1].player_id,"p-bay");

const wrong=mergeCloudRosterWithIdentity([{name:"ToyN",server_id:"884",alliance_tag:"ALL4"}],[{player_id:"p",name:"[OTHER]ToyN",server_id:"884",alliance_tag:"ALL4"}],{serverId:"884",allianceTag:"ALL4"});
assert.equal(wrong.unlinked_accounts.length,1);
assert.equal(wrong.roster[0].warboost_linked===true,false);

const own=linkCurrentPlayerIdentityIntoRoster([{name:"ToyN",server_id:"884",alliance_tag:"ALL4"}],{playerId:"p-own",name:"[ALL4]ToyN",serverId:"884",allianceTag:"ALL4"});
assert.equal(own.status,"linked_exact");
assert.equal(own.members[0].name,"ToyN");
assert.equal(own.members[0].player_id,"p-own");

const app=fs.readFileSync(path.resolve("app.js"),"utf8");
const sw=fs.readFileSync(path.resolve("sw.js"),"utf8");
const health=fs.readFileSync(path.resolve("api/health.js"),"utf8");
assert.match(app,/RELEASE_LABEL="HF8\.6\.(?:7|17)"/);
assert.match(app,/identity_exact_match_guard/);
assert.match(sw,/hf8-6-7-alliance-association-reliability/);
assert.match(health,/alliance_identity_leading_tag_normalization:true/);
const migrations=fs.readdirSync(path.resolve("supabase")).filter(x=>/hf8_6_7/i.test(x));
assert.equal(migrations.length,0);
const apis=fs.readdirSync(path.resolve("api")).filter(x=>x.endsWith(".js"));
assert.equal(apis.length,12);
console.log("WarBoost V2.5.28 HF8.6.7 Alliance Association Reliability verification: PASS");
