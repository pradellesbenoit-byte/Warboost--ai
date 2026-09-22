import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {previewSelfIdentityLink,confirmedCanonicalSelfRole,cloudRankManagerAccess} from "../lib/alliance-rank-management.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const row=(name,extra={})=>({name,server_id:"884",alliance_tag:"ALL4",role:"R5",...extra});
const identity={userId:"u1",name:"Captain Alpha",serverId:"884",allianceTag:"ALL4"};

{
  const result=previewSelfIdentityLink([row("Captain Alpha",{role:"R5"})],identity);
  assert.equal(result.ok,true);
  assert.equal(result.index,0);
  assert.equal(result.member.player_id,undefined);
  const linked={...result.member,player_id:identity.userId,warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"};
  assert.equal(confirmedCanonicalSelfRole([linked],identity.userId).role,"R5");
  assert.equal(cloudRankManagerAccess({userId:identity.userId,membershipRole:"R5",ownerPlayerId:"other"}).allowed,true);
  console.log("PASS: self-only canonical identity link enables verified R5 access");
}

{
  const result=previewSelfIdentityLink([row("Captain Alpha",{player_id:"other",warboost_linked:true})],identity);
  assert.equal(result.ok,false);
  assert.equal(result.code,"roster_member_already_linked");
  console.log("PASS: a canonical row linked to another account is rejected");
}

{
  const result=previewSelfIdentityLink([row("Captain Alpha"),row("Other",{
    player_id:identity.userId,warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"
  })],identity);
  assert.equal(result.ok,false);
  assert.equal(result.code,"account_already_linked");
  console.log("PASS: an account already linked elsewhere is rejected");
}

{
  const result=previewSelfIdentityLink([row("Captain Alpha"),row("Captain Alpha")],identity);
  assert.equal(result.ok,false);
  assert.equal(result.code,"member_identity_ambiguous");
  console.log("PASS: ambiguous normalized nickname/server/alliance match is rejected");
}

const api=read("api/alliance-role.js"),app=read("app.js"),html=read("index.html");
for(const token of ["link_self_identity","previewSelfIdentityLink","expected_updated_at:ctx.alliance.updated_at","player_id:user.id","resolveCanonicalIdentity","joinAlliance"])assert.match(api,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
const linkBranch=api.slice(api.indexOf('if(req.body?.action==="link_self_identity")'),api.indexOf("// Explicitly repair only"));
assert.ok(linkBranch);
assert.doesNotMatch(linkBranch,/req\.body\??\.player_id/);
const linkRequest=app.match(/body:JSON\.stringify\(\{action:"link_self_identity"[\s\S]*?\}\)/)?.[0]||"";
assert.ok(linkRequest);
assert.doesNotMatch(linkRequest,/player_id/);
for(const token of ["linkOwnCanonicalIdentity","management_verified","rankManagerLinkSelfBtn","desertStormRoleResyncAttempted=false"])assert.match(app,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
assert.match(html,/rankManagerIdentityLink/);
console.log("Identity linking and Desert Storm activation verification: PASS");