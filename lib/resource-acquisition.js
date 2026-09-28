import {SHOP_REFERENCE_CATALOG,SHOP_REFERENCE_DATE,SHOP_REFERENCE_SOURCE,canonicalShopStore} from "./shop-catalog.js";

function normalized(value){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/\s+/g," ");
}

function findReference(item,store){
  const wantedItem=normalized(item),wantedStore=canonicalShopStore(store);
  return SHOP_REFERENCE_CATALOG.find(row=>normalized(row.item)===wantedItem&&row.store===wantedStore)||null;
}

function inGame(item,store,{amount,currency,unitKey=null}={}){
  const reference=findReference(item,store);
  const exactObservation=Boolean(reference&&(
    amount===undefined||(reference.price!==null&&Number(amount)===Number(reference.price))
  ));
  return {
    type:"internal",
    item:reference?.item||item,
    store:reference?.store||canonicalShopStore(store)||store,
    amount:amount!==undefined?amount:(reference?.price??null),
    currency:currency||reference?.currency||null,
    unitKey,
    observed: Boolean(reference),
    referenceDate:exactObservation?(reference.observed_at||SHOP_REFERENCE_DATE):null,
    referenceSource:exactObservation?(reference.source||SHOP_REFERENCE_SOURCE):null,
  };
}

function paid(item,store,{priceEur=null,amount=null,currency=null,source="reference"}={}){
  const reference=findReference(item,store);
  const observedPrice=priceEur!==null?priceEur:
    reference?.currency==="EUR"&&Number.isFinite(Number(reference.price))?Number(reference.price):null;
  const exactObservation=Boolean(reference&&(
    observedPrice===null||reference.currency==="EUR"&&Number(observedPrice)===Number(reference.price)
  ));
  return {
    type:"paid",
    item:reference?.item||item,
    store:reference?.store||store,
    amount,
    currency,
    priceEur:observedPrice!==null&&observedPrice!==undefined&&Number.isFinite(Number(observedPrice))?Number(observedPrice):null,
    observed:true,
    priceSource:source,
    referenceDate:exactObservation?(reference.observed_at||SHOP_REFERENCE_DATE):null,
    referenceSource:exactObservation?(reference.source||SHOP_REFERENCE_SOURCE):null,
  };
}

const GUIDES={
  exclusive:{
    id:"exclusive_weapon_shards",
    family:"exclusive_weapon_shards",
    resourceKey:"acq_resource_exclusive",
    options:[
      inGame("Fragment d'Arme Exclusive Universel","campaign",{amount:300,currency:"campaign_points",unitKey:"fragment"}),
      inGame("Fragment d'Arme Exclusive Universel","honor",{amount:2500,currency:"honor_medals",unitKey:"fragment"}),
      paid("Pass Arme Exclusive de héros · exemple 70 fragments","Pass Arme Exclusive de héros · exemple 70 fragments",{priceEur:17,amount:2000,currency:"gold_brick",source:"observed-demo-reference"}),
    ],
  },
  gear:{
    id:"gear_materials",
    family:"gear_materials",
    resourceKey:"acq_resource_gear",
    options:[
      inGame("Pierre d'Amélioration · 1.0K","campaign",{amount:300,currency:"campaign_points"}),
      inGame("Pierre d'Amélioration","vip",{amount:4,currency:"diamonds"}),
      inGame("Céramique Diélectrique","alliance"),
    ],
  },
  drone_components:{
    id:"drone_components",
    family:"drone_components",
    resourceKey:"acq_resource_drone_components",
    options:[
      inGame("Coffre de Composant de Drone Niv.1","alliance"),
      paid("S2 Pass Hebdomadaire de Composants de Drone","Centre commercial · Pass Hebdomadaire"),
      paid("Composant de Drone","Centre commercial · Offres Hebdomadaires"),
    ],
  },
  drone_parts:{
    id:"drone_parts",
    family:"drone_parts",
    resourceKey:"acq_resource_drone_parts",
    options:[
      inGame("Pièce de Drone","vip",{amount:400,currency:"diamonds"}),
      inGame("Pièce de Drone","honor",{amount:800,currency:"honor_medals"}),
      paid("S1 Pass Hebdomadaire de Pièces de Drone","Centre commercial · Pass Hebdomadaire"),
    ],
  },
  drone_chips:{
    id:"drone_chips",
    family:"drone_chips",
    resourceKey:"acq_resource_drone_chips",
    options:[
      inGame("Coffre de Puce de Compétence (UR)","honor"),
      inGame("Coffre de Puce de Compétence (SSR)","campaign"),
      paid("Compétence de Drone","Centre commercial · Offres Hebdomadaires"),
    ],
  },
  hero_shards:{
    id:"ur_hero_fragments",
    family:"hero_shards",
    resourceKey:"acq_resource_ur_fragments",
    options:[
      inGame("Fragment de Héros UR Universel","vip",{amount:300,currency:"diamonds"}),
      inGame("Fragment de Héros UR Universel","honor"),
      inGame("Fragment de Héros UR Universel","campaign"),
    ],
  },
  hero_xp:{
    id:"hero_xp",
    family:"hero_xp",
    resourceKey:"acq_resource_hero_xp",
    options:[
      inGame("Coffre d'EXP de Héros","campaign"),
      inGame("Coffre d'EXP de Héros","vip"),
    ],
  },
  armament_core:{
    id:"armament_core",
    family:"armament_core",
    resourceKey:"acq_resource_armament_core",
    options:[
      inGame("Noyau d'Armement","vip"),
      inGame("Noyau d'Armement","honor"),
      paid("S4 Pass Hebdomadaire de Noyau d'Armement","Centre commercial · Pass Hebdomadaire"),
    ],
  },
  armament_research:{
    id:"armament_research",
    family:"armament_research",
    resourceKey:"acq_resource_armament_research",
    options:[
      inGame("Matériaux d'Armement · 5.0K","vip"),
      inGame("Noyau d'Armement","honor"),
      paid("Recherche Spéciale d'Armement","Centre commercial · Offres Hebdomadaires"),
    ],
  },
  armament:{
    id:"armament",
    family:"armament",
    resourceKey:"acq_resource_armament",
    options:[
      inGame("Noyau d'Armement","vip"),
      inGame("Noyau d'Armement","honor"),
      inGame("Matériaux d'Armement · 5.0K","vip"),
    ],
  },
};

function priorityText(priority){
  return normalized([
    priority?.resource_id,priority?.resource_type,priority?.resource_family,
    priority?.technology_lane,priority?.target,priority?.title,priority?.action,
  ].filter(Boolean).join(" "));
}

function confirmedHeroRarity(priority,state){
  const requested=normalized(priority?.hero);
  const row=(state?.squads||[]).flatMap(squad=>Array.isArray(squad?.heroes)?squad.heroes:[])
    .find(hero=>requested&&normalized(hero?.name)===requested);
  return normalized(priority?.hero_rarity||priority?.rarity||row?.rarity||row?.rarity_label||"").toUpperCase();
}

function exclusiveLevel(priority){
  const value=Number(priority?.current);
  if(priority?.current!==null&&priority?.current!==undefined&&priority?.current!==""&&Number.isFinite(value))return value;
  const match=String(priority?.current_label||"").match(/(?:^|\s)EX\s*(\d+)/i);
  return match?Number(match[1]):null;
}

function isBottleneck(priority,analysis){
  const first=Array.isArray(analysis?.priorities)?analysis.priorities[0]:null;
  const bottleneck=analysis?.bottleneck||first;
  if(!bottleneck)return false;
  if(priority===bottleneck||priority===first)return true;
  if(String(priority?.kind||"")!==String(bottleneck?.kind||""))return false;
  const target=normalized(priority?.hero||priority?.target);
  const bottleneckTarget=normalized(bottleneck?.hero||bottleneck?.target);
  return Boolean(priority?.rank===1||target&&bottleneckTarget&&target===bottleneckTarget);
}

function detectGuide(priority,state){
  const kind=String(priority?.kind||"").toLowerCase();
  const family=String(priority?.resource_family||"").toLowerCase();
  const hint=priorityText(priority);
  if(kind==="scan"||family==="data")return null;
  if(kind==="exclusive"||family==="exclusive_weapon_shards"){
    const level=exclusiveLevel(priority);
    return level!==null&&level>0?{guide:GUIDES.exclusive,noteKey:"acq_exclusive_upgrade_only"}:
      {guide:null,noteKey:"acq_weapon_locked",unknown:true};
  }
  if(kind==="gear"||family==="gear_materials")return {guide:GUIDES.gear};
  if(kind==="drone"||family==="drone_components"){
    if(family==="drone_chips"||family==="drone_skill_chips"||/\b(chip|chips|skill|puce|puces)\b/.test(hint))return {guide:GUIDES.drone_chips};
    if(family==="drone_parts"||/\b(part|parts|piece|pieces|pi[eè]ce|pi[eè]ces)\b/.test(hint))return {guide:GUIDES.drone_parts};
    return {guide:GUIDES.drone_components};
  }
  if(kind==="level"||family==="hero_xp")return {guide:GUIDES.hero_xp};
  if(kind==="stars"||family==="hero_shards"){
    return confirmedHeroRarity(priority,state)==="UR"?{guide:GUIDES.hero_shards}:
      {guide:null,unknown:true,noteKey:"acq_hero_rarity_unconfirmed"};
  }
  const armamentSpecific=kind==="armament"||family.startsWith("armament_")||/\b(armament|armement|noyau d'armement)\b/.test(hint);
  if(armamentSpecific){
    if(/\b(core|cores|noyau|noyaux)\b/.test(hint)||family==="armament_core"||family==="armament_cores")return {guide:GUIDES.armament_core};
    if(/\b(research|recherche|material|materials|mat[eé]riaux)\b/.test(hint)||family==="armament_materials"||family==="armament_research")return {guide:GUIDES.armament_research};
    return {guide:GUIDES.armament};
  }
  return {guide:null,unknown:true,noteKey:"acq_availability_unknown"};
}

export function resourceAcquisitionForPriority(priority,analysis={},state={}){
  const detected=detectGuide(priority,state);
  if(!detected)return null;
  const focus=String(priority?.hero||priority?.target||priority?.title||"").trim();
  if(!detected.guide){
    return {
      id:`unknown-${String(priority?.kind||"resource")}`,
      resourceKey:"acq_resource_unknown",
      focus,
      known:false,
      noteKey:detected.noteKey||"acq_availability_unknown",
      options:[],
      bottleneck:isBottleneck(priority,analysis),
    };
  }
  const bottleneck=isBottleneck(priority,analysis);
  const internal=detected.guide.options.filter(option=>option.type==="internal");
  const paidOptions=bottleneck?detected.guide.options.filter(option=>option.type==="paid"):[];
  const options=[...internal.slice(0,3)];
  for(const option of paidOptions){if(options.length>=3)break;options.push(option)}
  return {
    id:detected.guide.id,
    resourceKey:detected.guide.resourceKey,
      resourceFamily:detected.guide.family,
    focus,
    known:true,
    noteKey:detected.noteKey||null,
    bottleneck,
    options:options.slice(0,3).map((option,index)=>({...option,bestInternal:option.type==="internal"&&index===0})),
  };
}

export function acquisitionCurrencyKey(currency){
  return ({
    campaign_points:"acq_currency_campaign",
    honor_medals:"acq_currency_honor",
    diamonds:"acq_currency_diamonds",
    alliance_coins:"acq_currency_alliance",
    season_tokens:"acq_currency_season",
    gold_brick:"acq_currency_gold_bricks",
    gold_brick:"acq_currency_gold_bricks",
  })[String(currency||"")]||null;
}

export function formatAcquisitionCost(option,translate=(key)=>key,locale="en-GB"){
  const currencyKey=acquisitionCurrencyKey(option?.currency),amount=option?.amount;
  const hasAmount=amount!==null&&amount!==undefined&&Number.isFinite(Number(amount));
  const gameCost=currencyKey&&hasAmount?translate("acq_cost_format",{
    amount:new Intl.NumberFormat(locale||"en-GB").format(Number(amount)),
    currency:translate(currencyKey),
    suffix:option?.unitKey==="fragment"?translate("acq_cost_per_fragment"):"",
  }):null;
  const hasEuro=option?.priceEur!==null&&option?.priceEur!==undefined&&Number.isFinite(Number(option.priceEur));
  const euroCost=hasEuro?new Intl.NumberFormat(locale||"en-GB",{style:"currency",currency:"EUR"}).format(Number(option.priceEur)):null;
  return [gameCost,euroCost].filter(Boolean).join(" · ")||translate("acq_price_unknown");
}

export const ACQUISITION_I18N_KEYS=Object.freeze([
  "acq_view","acq_hide","acq_heading","acq_best_internal","acq_game_currency",
  "acq_official_paid","acq_paid_in_last_war","acq_observed","acq_price_unknown","acq_availability_unknown",
  "acq_availability_note","acq_why","acq_why_text","acq_inventory_first",
  "acq_purchase_stays_official","acq_open_ai_shop","acq_shop_filtered",
  "acq_shop_show_all","acq_exclusive_upgrade_only","acq_weapon_locked",
  "acq_hero_rarity_unconfirmed",
    "acq_currency_campaign","acq_currency_honor","acq_currency_diamonds",
  "acq_currency_alliance","acq_currency_season","acq_currency_gold_bricks","acq_cost_format","acq_cost_per_fragment",
]);