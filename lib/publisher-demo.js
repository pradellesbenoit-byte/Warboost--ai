export const PUBLISHER_DEMO_MODE=true;
export const PUBLISHER_DEMO_VERSION="2.5.21";
export const PUBLISHER_CONTACT_CONTEXT={
  subject:"WarBoost – Official Last War Data & API Permission Request",
  status:"awaiting-written-authorization",
  requested_access:"official documented read-only player-authorized data/API access",
  requested_domains:["profile","progression","heroes","gear","squads","resources","shops","events","seasons","alliance"],
  commitments:["no gameplay automation","no client modification","no unauthorized access","player-authorized/self-profile data","security/privacy/branding/usage compliance"]
};

function hero(name,power,exclusive=null,gear="count=4;level=40;rarity=orange"){
  return {name,level:150,stars:5,power,exclusive,gear};
}
function member(name,role,power_m,now){return {name,role,power_m,updated_at:now,last_active_at:now,delta_m:1,vs_points:1000+Math.round(power_m*10)};}

export function buildPublisherDemoState(now=new Date().toISOString()){
  return {
    version:PUBLISHER_DEMO_VERSION,
    player_id:"publisher-demo-player",
    updated_at:now,
    player:{name:"WarBoost Demo Player",server_id:"DEMO",hq_level:32,power_m:219,coordinates:null,role:"R5"},
    player_context:{objective:"balanced",account_age_days:null,server_profile:"auto",updated_at:now},
    exclusive_weapons:[],hero_progression:[],hero_profiles:[],
    drone:{level:157,power_m:8.84,updated_at:now},
    shop:{store_type:"",currency:"diamonds",currency_balance:25000,vip_level:null,vip_days_remaining:null,offers:[],snapshots:[],updated_at:null},
    squads:[
      {id:1,name:"Squad 1",power:42.58,updated_at:now,needs_rescan:false,composition_changed_at:null,heroes:[hero("Carlie",5.16,5),hero("Lucius",5.03,1),hero("DVA",5.44,null),hero("Morrison",5.33,10),hero("Skyler",4.84,1)]},
      {id:2,name:"Squad 2",power:34.61,updated_at:now,needs_rescan:false,composition_changed_at:null,heroes:[hero("Murphy",4.9,null),hero("Williams",4.8,null),hero("Stetmann",4.7,null),hero("Marshall",4.6,null),hero("Kimberly",5.0,null)]},
      {id:3,name:"Squad 3",power:29.62,updated_at:now,needs_rescan:false,composition_changed_at:null,heroes:[hero("Adam",4.2,null),hero("Violet",4.1,null),hero("Tesla",4.5,null),hero("Sarah",4.0,null),hero("Mason",4.3,null)]},
      {id:4,name:"Squad 4",power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:Array.from({length:5},()=>({name:"",level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null}))}
    ],
    alliance:{id:"publisher-demo-alliance",tag:"WBX",name:"WarBoost Demo Alliance",role:"R5",invite_code:"DEMO-R5",updated_at:now,members:[
      member("Alpha","R5",91,now),member("Bravo","R4",84,now),member("Charlie","R4",79,now),member("Delta","R3",74,now),member("Echo","R3",69,now),member("Foxtrot","R2",63,now),member("Golf","R2",58,now),member("Hotel","R1",52,now)
    ]},
    vs:{week:null,day:3,our_alliance:"WBX",opponent:"DEMO",our_score:1284000,their_score:1219000,updated_at:now},
    season:{name:"Demo Season",number:null,day:18,total_days:35,profession:"Engineer",progress_pct:51,resistance:5500,focus:"balanced",lifecycle:"active",lifecycle_source:"publisher-demo",ended_at:null,measured_hybrid_synergy:false,awakening_swap:null,updated_at:now},
    technology:{type_mastery_pct:72,hero_tech_pct:68,siege_to_seize_pct:61,defensive_fortification_pct:66,tactical_weapon_pct:64,updated_at:now},
    sync:{provider:"warboost-publisher-demo",provider_kind:"publisher-demo",access_status:"awaiting-written-authorization",capabilities:["anonymized-sample-data","read-only-ai-analysis","publisher-sandbox"],status:"publisher-demo",last_sync:now,last_error:null,auto_ready:true,last_scan:now,official_last_sync:null,public_last_sync:null,sources:{official:false,public:false,scan:true,alliance:true}}
  };
}

export function buildPublisherScanState(scanType,now=new Date().toISOString()){
  const full=buildPublisherDemoState(now),kind=String(scanType||"profile").toLowerCase();
  if(/^squad[1-4]$/.test(kind)){const id=Number(kind.slice(-1));return {squads:Array.from({length:4},(_,i)=>i===id-1?full.squads[i]:null)};}
  if(kind==="drone")return {drone:full.drone};
  if(kind==="vs")return {vs:full.vs};
  if(kind==="season")return {season:full.season,technology:full.technology};
  if(kind==="exclusive")return {squads:[full.squads[0],null,null,null]};
  if(kind==="shop")return {shop:full.shop};
  if(kind==="awakening")return {season:full.season,hero_progression:[]};
  return {player:full.player,drone:full.drone};
}
