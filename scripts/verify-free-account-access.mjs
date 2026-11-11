import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {freeAccountAllowed,assertFreeAccount} from "../lib/free-access.js";
import {betaCodeVisible} from "../lib/beta-activation-ui.js";

const confirmed={id:"00000000-0000-4000-8000-000000000001",email:"player@example.test",email_confirmed_at:"2026-11-01T00:00:00.000Z"};
assert.equal(freeAccountAllowed(confirmed),true);
assert.equal(assertFreeAccount(confirmed),confirmed);
assert.equal(freeAccountAllowed({...confirmed,email_confirmed_at:null}),false);
assert.equal(freeAccountAllowed({...confirmed,email:""}),false);
assert.equal(freeAccountAllowed({...confirmed,id:""}),false);
assert.throws(()=>assertFreeAccount({...confirmed,email_confirmed_at:null}),error=>error.code==="EMAIL_CONFIRMATION_REQUIRED"&&error.status===403);
assert.equal(betaCodeVisible({
  enforced:true,allowed:true,access_status:"account",beta_access_status:"open-registration",
  beta_code_eligible:false,alliance_beta_allowed:false
},{logged:true}),false);

const read=file=>readFile(new URL(`../${file}`,import.meta.url),"utf8");
const [proAccess,proApi,stateApi,scanApi,syncApi,roleApi,inviteApi,joinApi]=await Promise.all([
  read("lib/pro-access.js"),read("api/pro.js"),read("api/state.js"),read("api/scan.js"),
  read("api/sync.js"),read("api/alliance-role.js"),read("api/invite.js"),read("api/join.js")
]);
assert.match(proAccess,/assertFreeAccount\(await requireUser\(req\)\)/);
assert.match(proAccess,/if\(pro&&!entitlement\.active\)/,"email confirmation must not grant PRO");
assert.match(proApi,/beta_code_eligible:false/);
assert.match(proApi,/open_registration:true/);
assert.match(proApi,/alliance_beta_allowed:beta\.allowed/);
assert.match(proApi,/assertFreeAccount\(await requireUser\(req\)\)/);
assert.match(stateApi,/assertFreeAccount\(await requireUser\(req\)\)/);
assert.match(scanApi,/requireProductUser\(req,\{consent:true,pro:false\}\)/,"personal scans remain FREE");
assert.match(syncApi,/Personal synchronization has no legacy code requirement/);
assert.match(syncApi,/requestedRosterSync&&!allianceBeta\.allowed/,"canonical roster sync stays invitation-gated");
for(const [name,source] of [["alliance-role",roleApi],["invite",inviteApi],["join",joinApi]])
  assert.match(source,/requireBetaUser/,`${name} must retain its existing alliance access gate`);

const css=await readFile(new URL("../squad-review-status.css",import.meta.url),"utf8");
const html=await read("index.html");
assert.match(html,/<link rel="stylesheet" href="\/squad-review-status\.css\?v=read-only-r1"\s*\/>/);
assert.equal(Buffer.byteLength(css,"utf8"),2296);
console.log("PASS free account access: confirmed accounts need no beta code; unconfirmed accounts are denied; PRO, alliance gates, and squad CSS remain protected.");
