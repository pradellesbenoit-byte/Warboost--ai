import assert from "node:assert/strict";
import fs from "node:fs";

const read=path=>fs.readFileSync(path,"utf8");
const app=read("app.js"),html=read("index.html"),css=read("styles.css"),publisher=read("publisher-ui.js");

assert.doesNotMatch(html,/allianceEventSummary/,"global event summary must be removed from Alliance HTML");
assert.doesNotMatch(app,/allianceEventSummary/,"global event summary must have no Alliance render path");
assert.doesNotMatch(css,/allianceEventSummary|eventCountChip/,"global event summary styles must be removed");
assert.match(html,/participation_player_history/,"detailed per-player participation must remain");
assert.match(html,/unlinkedWarBoostAccounts/,"WarBoost account linking panel must remain");
assert.match(app,/function canonicalSelfRosterMember/,"linked-account display must resolve through the canonical roster");
assert.match(app,/canonicalSelfRosterMember\(\),displayName=canonical\?\.name/,"the profile field must display the linked canonical name");
assert.match(app,/selfNameKeys=new Set/,"stale pending aliases must be filtered for an already-linked account");
assert.match(publisher,/selfLinked=members\.filter/,"stored stale pending aliases must be repaired for the linked account");

console.log("Targeted Alliance UI verification: PASS");