import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {mergeFreshRecord,stampConfirmedRecord} from "../lib/field-freshness.js";
import {normalizeState,mergeNewest} from "../lib/normalize.js";
import {hydrateHeroFromMemory} from "../api/advice.js";
import {playerAdviceInputSignature} from "../lib/player-advice-signature.js";

const oldAt="2026-10-01T10:00:00.000Z";
const confirmedAt="2026-10-02T10:00:00.000Z";
const staleEnvelopeAt="2026-10-03T10:00:00.000Z";
const currentPower=7617276;
const currentExclusive=28;
const outdatedProfile={
  hero_name:"DVA",exclusive:26,power:7000000,updated_at:staleEnvelopeAt,
  field_updated_at:{exclusive:oldAt,power:oldAt},
  field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}
};
const currentProfile={
  hero_name:"DVA",exclusive:currentExclusive,power:currentPower,updated_at:confirmedAt,
  field_updated_at:{exclusive:confirmedAt,power:confirmedAt},
  field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}
};
const oldHeroes=[
  {name:"DVA",exclusive:26,power:7000000,updated_at:staleEnvelopeAt,field_updated_at:{exclusive:oldAt,power:oldAt},field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}},
  {name:"Kimberly"},{name:"Murphy"},{name:"Mason"},{name:"Monica"}
];
const currentHeroes=[
  {name:"DVA",exclusive:currentExclusive,power:currentPower,updated_at:confirmedAt,field_updated_at:{exclusive:confirmedAt,power:confirmedAt},field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}},
  {name:"Kimberly"},{name:"Murphy"},{name:"Mason"},{name:"Monica"}
];
const confirmedState={
  player_id:"account-a",updated_at:confirmedAt,
  hero_profiles:[currentProfile],
  hero_progression:[{hero_name:"DVA",exclusive:currentExclusive,updated_at:confirmedAt,field_updated_at:{exclusive:confirmedAt},field_source:{exclusive:"confirmed_scan"}}],
  exclusive_weapons:[{hero_name:"DVA",weapon_name:"DVA Exclusive",level:currentExclusive,power:currentPower,updated_at:confirmedAt,field_updated_at:{level:confirmedAt,power:confirmedAt},field_source:{level:"confirmed_scan",power:"confirmed_scan"}}],
  squads:[{id:1,updated_at:confirmedAt,composition_confirmed_at:confirmedAt,composition_source:"explicit_confirmation",confirmed_composition:["DVA","Kimberly","Murphy","Mason","Monica"],heroes:currentHeroes}],
  drone:{level:55,updated_at:confirmedAt,field_updated_at:{level:confirmedAt},field_source:{level:"confirmed_scan"}},
  season:{number:10,updated_at:confirmedAt,field_updated_at:{number:confirmedAt},field_source:{number:"confirmed_scan"}},
  technology:{hero_tech_pct:78,updated_at:confirmedAt,field_updated_at:{hero_tech_pct:confirmedAt},field_source:{hero_tech_pct:"confirmed_scan"}}
};
const staleCloudState={
  player_id:"account-a",updated_at:staleEnvelopeAt,
  hero_profiles:[outdatedProfile],
  hero_progression:[{hero_name:"DVA",exclusive:26,updated_at:staleEnvelopeAt,field_updated_at:{exclusive:oldAt},field_source:{exclusive:"confirmed_scan"}}],
  exclusive_weapons:[{hero_name:"DVA",weapon_name:"DVA Exclusive",level:26,power:7000000,updated_at:staleEnvelopeAt,field_updated_at:{level:oldAt,power:oldAt},field_source:{level:"confirmed_scan",power:"confirmed_scan"}}],
  squads:[{id:1,updated_at:staleEnvelopeAt,composition_confirmed_at:confirmedAt,composition_source:"explicit_confirmation",confirmed_composition:["DVA","Kimberly","Murphy","Mason","Monica"],heroes:oldHeroes}],
  drone:{level:31,updated_at:staleEnvelopeAt,field_updated_at:{level:oldAt},field_source:{level:"confirmed_scan"}},
  season:{number:9,updated_at:staleEnvelopeAt,field_updated_at:{number:oldAt},field_source:{number:"confirmed_scan"}},
  technology:{hero_tech_pct:60,updated_at:staleEnvelopeAt,field_updated_at:{hero_tech_pct:oldAt},field_source:{hero_tech_pct:"confirmed_scan"}}
};

const independent=mergeFreshRecord(
  {exclusive:currentExclusive,power:currentPower,updated_at:confirmedAt,field_updated_at:{exclusive:confirmedAt,power:confirmedAt},field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}},
  {exclusive:26,power:8000000,updated_at:staleEnvelopeAt,field_updated_at:{exclusive:oldAt,power:staleEnvelopeAt},field_source:{exclusive:"confirmed_scan",power:"confirmed_scan"}},
  ["exclusive","power"]
);
assert.equal(independent.exclusive,currentExclusive,"a newer envelope must not roll back an older field observation");
assert.equal(independent.power,8000000,"fields arbitrate independently when only one field is refreshed");

const awakeningBase=normalizeState({updated_at:staleEnvelopeAt,hero_profiles:[{hero_name:"DVA",updated_at:staleEnvelopeAt,awakening:{stars:5,skill_level:2,updated_at:staleEnvelopeAt,field_updated_at:{stars:confirmedAt,skill_level:oldAt},field_source:{stars:"confirmed_scan",skill_level:"confirmed_scan"}}}]}).hero_profiles[0];
const awakeningIncoming=normalizeState({updated_at:staleEnvelopeAt,hero_profiles:[{hero_name:"DVA",updated_at:staleEnvelopeAt,awakening:{stars:4,skill_level:4,updated_at:staleEnvelopeAt,field_updated_at:{stars:oldAt,skill_level:confirmedAt},field_source:{stars:"confirmed_scan",skill_level:"confirmed_scan"}}}]}).hero_profiles[0];
const awakeningMerge=mergeFreshRecord(awakeningBase,awakeningIncoming,["awakening"]);
assert.equal(awakeningMerge.awakening.stars,5,"an older nested awakening field must not replace its newer confirmation");
assert.equal(awakeningMerge.awakening.skill_level,4,"a newer nested awakening field must merge despite tied global timestamps");

const persisted=normalizeState(confirmedState);
assert.equal(persisted.hero_profiles[0].field_updated_at.exclusive,confirmedAt,"local normalization must retain field provenance");
assert.equal(persisted.squads[0].heroes[0].field_updated_at.power,confirmedAt,"slot normalization must retain field provenance");
const restored=normalizeState(JSON.parse(JSON.stringify(persisted)));
assert.equal(restored.hero_profiles[0].exclusive,currentExclusive,"reload must retain the last confirmed hero field");

const merged=mergeNewest(confirmedState,staleCloudState);
assert.equal(merged.hero_profiles[0].exclusive,currentExclusive,"cloud merge must retain the newer exclusive level");
assert.equal(merged.hero_profiles[0].power,currentPower,"cloud merge must retain the newer confirmed power");
assert.equal(merged.hero_progression[0].exclusive,currentExclusive,"progression merge must be field-fresh");
assert.equal(merged.exclusive_weapons[0].level,currentExclusive,"exclusive-weapon merge must be field-fresh");
assert.equal(merged.squads[0].heroes[0].exclusive,String(currentExclusive),"squad slot merge must be field-fresh");
assert.equal(merged.drone.level,55,"stale profile timestamps must not roll back Drone scans");
assert.equal(merged.season.number,10,"stale cloud envelopes must not roll back confirmed season fields");
assert.equal(merged.technology.hero_tech_pct,78,"stale cloud envelopes must not roll back confirmed Technology fields");

const apiState=normalizeState(confirmedState);
const hydrated=hydrateHeroFromMemory(apiState,{...oldHeroes[0],updated_at:staleEnvelopeAt});
assert.equal(hydrated.exclusive,currentExclusive,"Diagnostic PRO must hydrate the latest confirmed exclusive value");
assert.equal(hydrated.power,currentPower,"Diagnostic PRO must hydrate the latest confirmed hero power");
const otherAccount=normalizeState({player_id:"account-b"});
const isolated=hydrateHeroFromMemory(otherAccount,{name:"DVA"});
assert.equal(isolated.exclusive,undefined,"a different account must not inherit another account's hero memory");
assert.notEqual(playerAdviceInputSignature(apiState),playerAdviceInputSignature(otherAccount),"the Diagnostic PRO request identity must include account ownership");

const stamp=stampConfirmedRecord({hero:{exclusive:currentExclusive,power:currentPower,gear:null}}, {at:confirmedAt,source:"confirmed_scan"});
assert.equal(stamp.hero.field_updated_at.exclusive,confirmedAt,"player review must stamp the confirmation time");
assert.equal(stamp.hero.field_updated_at.power,confirmedAt);
assert.equal(stamp.hero.field_updated_at.gear,undefined,"missing scan fields must not be stamped or overwrite confirmed values");
assert.equal(playerAdviceInputSignature({...apiState,updated_at:staleEnvelopeAt,sync:{last_sync:staleEnvelopeAt}}),playerAdviceInputSignature(apiState),"transport timestamps must not invalidate the analysis input");
assert.notEqual(playerAdviceInputSignature({...apiState,hero_profiles:[{...currentProfile,exclusive:27}]}),playerAdviceInputSignature(apiState),"changed player data must invalidate a prior analysis");

const appSource=await readFile(new URL("../app.js",import.meta.url),"utf8");
assert.match(appSource,/stampConfirmedRecord\(reviewed,\{at:hqConfirmedAt/,"scan review must stamp data at player confirmation time");
assert.match(appSource,/signature!==playerAdviceInputSignature\(state\)/,"late Diagnostic PRO responses must be rejected after player data changes");
assert.match(appSource,/invalidatePlayerAdvice\(\{autoRefresh:!squadId\}\)/,"confirmed scans must invalidate and refresh the derived diagnosis");

console.log("Field freshness, persistence, cloud restore, account isolation, and Diagnostic PRO checks passed.");