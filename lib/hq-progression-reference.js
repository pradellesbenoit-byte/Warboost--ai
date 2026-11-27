// WarBoost – Age of Oil / HQ 30–35, community cross-checked, reviewed 2026-11-27.
// Reference-only: no inferred costs after HQ35, no writes, no promises of live unlocks.
export const HQ_PROGRESSION_REVIEWED_ON="2026-11-27";
export const HQ_REFERENCE_SOURCES=Object.freeze([
  "https://lastwar.wiki/buildings/headquarters/",
  "https://theriagames.com/guide/last-war-survival-headquarters-guide/"
]);
export const HQ35_SEASON7_PREVIEW={
  source:"https://wiki.lastwar.com/fr/show/575",published_on:"2026-08-03",
  heroes:["Carlie","McGregor","Murphy"],status:"announced_not_server_verified",
  auto_enable:false
};
// Costs below are FOR THE HQ UPGRADE ONLY, not the entire prerequisite-building chain.
// Food/Iron and oil are undiscounted community table estimates (not player inventory).
const levels={
  30:{cap:150},
  31:{cap:155,food:1600000000,iron:1600000000,coin:510000000,oil:1440000,buildings:["Tech Center 30","Tank Center 30","Barracks 30","HQ Expansion tech"]},
  32:{cap:160,food:1700000000,iron:1700000000,coin:560000000,oil:2304000,buildings:["Tech Center 31","Tank Center 31","Barracks 31","Wall 31"]},
  33:{cap:165,food:1900000000,iron:1900000000,coin:620000000,oil:3916800,buildings:["Tech Center 32","Tank Center 32","Barracks 32","Hospital 32","Drill Ground 32"]},
  34:{cap:170,food:2000000000,iron:2000000000,coin:650000000,oil:7050240,buildings:["Tech Center 33","Tank Center 33","Barracks 33","Wall 33","Alliance Center 33"]},
  35:{cap:175,food:2100000000,iron:2100000000,coin:680000000,oil:14100480,buildings:["Tech Center 34","Tank Center 34","Barracks 34","Hospital 34","Drill Ground 34"]}
};
export const HQ_REFERENCE_TABLE=Object.freeze(Object.fromEntries(Object.entries(levels).map(([k,v])=>[k,Object.freeze({...v,buildings:v.buildings?Object.freeze([...v.buildings]):null})])));
const asLevel=x=>x!==null&&x!==undefined&&x!==""&&Number.isInteger(Number(x))&&Number(x)>0?Number(x):null;
export function referenceHeroCap(hq){
  const value=asLevel(hq);
  return value!==null?levels[value]?.cap??null:null;
}
function oilEraEvidence(technology){
  const row=technology?.branches?.oil_era;
  if(row?.state==="locked")return {state:"locked",percent:null,prerequisite:typeof row.prerequisite==="string"?row.prerequisite:null};
  if(row?.state==="max")return {state:"max",percent:100,prerequisite:null};
  if(row?.state==="percent"){
    const p=Number(row.percent);
    if(row.percent!==null&&row.percent!==undefined&&row.percent!==""&&Number.isFinite(p)&&p>=0&&p<=100)
      return {state:"percent",percent:p,prerequisite:null};
  }
  return {state:"unknown",percent:null,prerequisite:null};
}
function verifiedHqSource(player){
  return ["confirmed_scan","manual_profile"].includes(player?.hq_level_source)
    &&Boolean(player.hq_level_confirmed_at&&Number.isFinite(Date.parse(player.hq_level_confirmed_at)));
}
export function buildHqProgressionIntel(state={}){
  const p=state?.player||{},hq=asLevel(p.hq_level),confirmed=hq!==null&&verifiedHqSource(p);
  const trustedHq=confirmed?hq:null;
  const target=trustedHq!==null&&trustedHq>=30&&trustedHq<35?trustedHq+1:null;
  const next=target?HQ_REFERENCE_TABLE[target]:null;
  return {
    status:hq===null?"hq_unknown":!confirmed?"hq_unconfirmed":hq>35?"beyond_reference":hq<30?"before_oil_era":hq===35?"at_reference_max":"reference_available",
    current_hq:trustedHq,hq_confirmed:confirmed,current_hero_cap:referenceHeroCap(trustedHq),next_hq:target,
    next_hero_cap:next?.cap??null,
    next_hq_buildings:next?[...next.buildings]:[],
    next_hq_costs:next?{food:next.food,iron:next.iron,coin:next.coin,oil:next.oil}:null,
    cost_scope:"hq_building_only_before_discounts_not_total_path",
    cost_evidence:"community_cross_checked_estimate_not_game_confirmed",
    prerequisites_evidence:"community_reference_verify_on_player_server",
    threshold_to_unlock_oil_era:null,
    threshold_note:"special_forces_percent_disputed_in_community_sources_verify_in_game",
    oil_era:oilEraEvidence(state?.technology),
    observed_player_resource_stock:null,
    reference_reviewed_on:HQ_PROGRESSION_REVIEWED_ON,
    reference_sources:[...HQ_REFERENCE_SOURCES],
    season7:{...HQ35_SEASON7_PREVIEW,heroes:[...HQ35_SEASON7_PREVIEW.heroes]}
  };
}
