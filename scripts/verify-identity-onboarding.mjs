import assert from "node:assert/strict";
import fs from "node:fs";
import {profileIdentity,validPlayerIdentity,identityOnboardingRequired,applyIdentityProfile} from "../lib/identity-onboarding.js";
import {createIdentityOnboardingService} from "../lib/identity-onboarding-service.js";
import {LANGUAGES,translator} from "../i18n.js";
import {IDENTITY_ONBOARDING_KEYS} from "../lib/identity-onboarding-copy.js";

const identity={name:"QA Pilot",server_id:"123",alliance_tag:"QAA"};
assert.ok(validPlayerIdentity(identity));
for(const key of Object.keys(identity))assert.equal(validPlayerIdentity({...identity,[key]:" "}),false);
for(const server_id of ["0","abc","12x","-1","1.5"])assert.equal(validPlayerIdentity({...identity,server_id}),false);
assert.equal(validPlayerIdentity({...identity,name:"[QAA]"}),false);
const context={userId:"a",ownerId:"a",betaAllowed:true,consentAccepted:true,identity:{}};
assert.ok(identityOnboardingRequired(context));
assert.equal(identityOnboardingRequired({...context,identity}),false);
assert.equal(identityOnboardingRequired({...context,ownerId:"b"}),false);
assert.equal(identityOnboardingRequired({...context,betaAllowed:false}),false);
assert.equal(identityOnboardingRequired({...context,consentAccepted:false}),false);

function fixture(seed=null){
  const other={player_id:"b",player:{name:"Other",server_id:"999",role:"R5"},alliance:{tag:"BBB"},squads:[{heroes:[{name:"DVA",power:10}]}]};
  const profiles=new Map([["b",{state:structuredClone(other),updated_at:"b0"}]]);
  if(seed)profiles.set("a",{state:structuredClone(seed),updated_at:"a0"});
  let ownContext=null,alliances=[],writes=0,race=false,unavailable=false;
  const service=createIdentityOnboardingService({
    getProfile:async id=>structuredClone(profiles.get(id)||null),
    getAllianceRoster:async()=>structuredClone(ownContext),
    getOwnedAlliance:async()=>null,
    findAllianceByScope:async()=>structuredClone(alliances),
    findProfilesByIdentityScope:async()=>{
      if(unavailable)throw Object.assign(Error("unavailable"),{code:"IDENTITY_CHECK_UNAVAILABLE"});
      return Array.from(profiles,([player_id,row])=>({player_id,state:structuredClone(row.state)}));
    },
    saveProfileIfUnchanged:async(id,state,revision)=>{
      if(race)profiles.set(id,{state:{...profiles.get(id)?.state,concurrent:true},updated_at:"newer"});
      if((profiles.get(id)?.updated_at||null)!==revision)throw Object.assign(Error("conflict"),{code:"profile_write_conflict",status:409});
      writes++;const row={state:structuredClone(state),updated_at:`revision-${writes}`};profiles.set(id,row);return row;
    }
  });
  return {service,profiles,other,writes:()=>writes,setContext:value=>ownContext=value,
    setAlliances:value=>alliances=value,setRace:()=>race=true,setUnavailable:()=>unavailable=true};
}
const fresh=fixture();
assert.equal((await fresh.service.read("a")).state,null);
await fresh.service.complete("a",identity,null);
assert.equal(fresh.profiles.size,2);
assert.deepEqual(profileIdentity(fresh.profiles.get("a").state),identity);
await fresh.service.complete("a",identity,"revision-1");
assert.equal(fresh.profiles.size,2,"same account never creates another profile");
assert.deepEqual(fresh.profiles.get("b").state,fresh.other,"other account unchanged");
await assert.rejects(fresh.service.complete("b",identity,"b0"),{code:"IDENTITY_DUPLICATE"});
const simultaneous=fixture();
const outcomes=await Promise.allSettled([
  simultaneous.service.complete("a",identity,null),
  simultaneous.service.complete("b",identity,"b0")
]);
assert.equal(outcomes.filter(result=>result.status==="fulfilled").length,1,"parallel claims in one worker are serialized");
assert.equal(outcomes.find(result=>result.status==="rejected").reason.code,"IDENTITY_DUPLICATE");
assert.equal(simultaneous.writes(),1);
assert.deepEqual(simultaneous.profiles.get("b").state,simultaneous.other);

const partial={player_id:"a",player:{name:"Existing",hq_level:31,role:"R4"},
  alliance:{tag:"",invite_code:"keep-code",role:"R4"},drone:{level:100,power_m:5},squads:[{id:1,heroes:[{name:"DVA",power:12}]}],shop:{offers:[{item:"keep"}]}};
const f=fixture(partial);
assert.equal((await f.service.read("a")).identity.name,"Existing");
const saved=await f.service.complete("a",{...identity,name:"Existing"},"a0");
assert.equal(saved.state.player.hq_level,31);assert.equal(saved.state.player.role,"R4");
assert.equal(saved.state.alliance.invite_code,"keep-code");assert.equal(saved.state.alliance.role,"R4");
assert.deepEqual(saved.state.drone,partial.drone);assert.deepEqual(saved.state.squads,partial.squads);
assert.deepEqual(saved.state.shop,partial.shop);
const localWithPlaceholder={...partial,player:{...partial.player,role:"R1"},alliance:{...partial.alliance,role:"R1",management_verified:false,cloud_role_verified:false}};
const declaration=applyIdentityProfile(localWithPlaceholder,{state:{...partial,player:{...partial.player,role:"R3"}},identity},{saved:true});
assert.equal(declaration.player.role,"R3","saved declared grade must not be replaced by an unconfirmed default");
assert.equal(declaration.alliance.role,"R4");
assert.equal(declaration.alliance.management_verified,false,"declared grade cannot grant management");
assert.equal(declaration.alliance.cloud_role_verified,false);
assert.deepEqual(declaration.drone,partial.drone);assert.deepEqual(declaration.squads,partial.squads);
assert.deepEqual(declaration.shop,partial.shop);
const confirmed=applyIdentityProfile({...localWithPlaceholder,player:{...localWithPlaceholder.player,rank_confirmed_at:"2026-01-01T00:00:00Z",rank_confirmed_source:"manual"}},{state:partial,identity},{saved:true});
assert.equal(confirmed.player.role,"R1","identity completion does not supersede confirmed rank evidence");
const canonicalRank=applyIdentityProfile(localWithPlaceholder,{state:partial,identity},{saved:true,preserveRank:true});
assert.equal(canonicalRank.player.role,"R1","canonical grade remains authoritative");
const canonical={id:"alliance-a",server_id:"123",tag:"QAA",roster:[{name:"Canonical",player_id:"a",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}]};
const linked=fixture(partial);linked.setContext({alliance:canonical,membership:{alliance_id:"alliance-a"}});
assert.deepEqual((await linked.service.read("a")).authority,{name:"Canonical",server_id:"123",alliance_tag:"QAA"});
await assert.rejects(linked.service.complete("a",identity,"a0"),{code:"IDENTITY_AUTHORITY_CONFLICT"});
await assert.rejects(linked.service.complete("a",{...identity,name:"Canonical",server_id:"124"},"a0"),{code:"IDENTITY_AUTHORITY_CONFLICT"});
assert.equal(linked.writes(),0);
await linked.service.complete("a",{...identity,name:"canonical"},"a0");
assert.equal(linked.profiles.get("a").state.player.name,"Canonical");
assert.deepEqual(canonical.roster,[{name:"Canonical",player_id:"a",warboost_linked:true,identity_basis:"lastwar_nickname_server_alliance"}]);

const duplicate=fixture(partial);
duplicate.profiles.set("b",{state:{player_id:"b",player:{name:"QA Pilot",server_id:"123"},alliance:{tag:"QAA"}},updated_at:"b0"});
await assert.rejects(duplicate.service.complete("a",identity,"a0"),{code:"IDENTITY_DUPLICATE"});assert.equal(duplicate.writes(),0);
const roster=fixture(partial);
roster.setAlliances([{roster:[{name:"QA Pilot",player_id:"b",server_id:"123",alliance_tag:"QAA"}]}]);
await assert.rejects(roster.service.complete("a",identity,"a0"),{code:"IDENTITY_DUPLICATE"});
roster.setAlliances([{roster:[{name:"QA Pilot"},{name:"QA Pilot"}]}]);
await assert.rejects(roster.service.complete("a",identity,"a0"),{code:"IDENTITY_AMBIGUOUS"});
const stale=fixture(partial);
await assert.rejects(stale.service.complete("a",identity,"stale-revision"),{code:"profile_write_conflict"});
stale.setRace();await assert.rejects(stale.service.complete("a",identity,"a0"),{code:"profile_write_conflict"});
assert.equal(stale.profiles.get("a").state.concurrent,true);assert.equal(stale.writes(),0);
const outage=fixture(partial);outage.setUnavailable();
await assert.rejects(outage.service.complete("a",identity,"a0"),{code:"IDENTITY_CHECK_UNAVAILABLE"});assert.equal(outage.writes(),0);
await assert.rejects(f.service.complete("a",{}),{code:"IDENTITY_INVALID"});

for(const [code] of LANGUAGES.filter(([code])=>code!=="auto")){
  for(const key of IDENTITY_ONBOARDING_KEYS)assert.notEqual(translator(code)(key),key,`${code}: ${key}`);
}
assert.equal(translator("unsupported")("identity_onboarding_continue"),"Continue","English fallback");
const api=fs.readFileSync(new URL("../lib/identity-onboarding-handler.js",import.meta.url),"utf8");
assert.match(api,/requireProductUser\(req,\{consent:true\}\)/);
assert.match(api,/service.complete\(String\(user.id\)/,"actor comes from auth, not payload");
assert.ok(!api.includes("req.body.player_id"));
assert.equal(fs.readdirSync(new URL("../api/",import.meta.url)).filter(name=>name.endsWith(".js")).length,12);
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.match(app,/identityOnboardingController\?\.sync\(\)/);
assert.match(app,/String\(cloudSession\?\.user\?\.id\|\|""\)!==ownerId/,"late result cannot affect a different account");
console.log("PASS: mandatory identity, validation, partial preservation, canonical authority, duplicate checks, revisions, same-account CAS, isolation, all locales and fallback.");