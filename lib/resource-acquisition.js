import {SHOP_REFERENCE_CATALOG,SHOP_REFERENCE_DATE,SHOP_REFERENCE_SOURCE,canonicalShopStore} from "./shop-catalog.js?v=shop-observations-v2-5-32-hf8-6-34-r1";

function normalized(value){
  return String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"'").replace(/\s+/g," ");
}

function findReference(item,store){
  const wantedItem=normalized(item),wantedStore=canonicalShopStore(store);
  return SHOP_REFERENCE_CATALOG.find(row=>normalized(row.item)===wantedItem&&row.store===wantedStore)||null;
}

function inGame(item,store,{unitKey=null}={}){
  const reference=findReference(item,store);
  return {
    type:"internal",
    item:reference?.item||item,
    store:reference?.store||canonicalShopStore(store)||store,
    amount:reference?.price??null,
    currency:reference?.currency||null,
    unitKey,
    observed: Boolean(reference),
    referenceDate:reference?(reference.observed_at||SHOP_REFERENCE_DATE):null,
    referenceSource:reference?(reference.source||SHOP_REFERENCE_SOURCE):null,
    limit:reference?.limit||null,
    restock:reference?.restock||null,
    observationStatus:reference?.observation_status||null,
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
    observed:exactObservation,
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
      inGame("Fragment d'Arme Exclusive Universel","campaign",{unitKey:"fragment"}),
      inGame("Fragment d'Arme Exclusive Universel","honor",{unitKey:"fragment"}),
      paid("Pass Arme Exclusive de héros · exemple 70 fragments","Pass Arme Exclusive de héros · exemple 70 fragments",{priceEur:17,amount:2000,currency:"gold_brick",source:"observed-demo-reference"}),
    ],
  },
  gear:{
    id:"gear_materials",
    family:"gear_materials",
    resourceKey:"acq_resource_gear",
    options:[
      inGame("Pierre d'Amélioration · 1.0K","campaign"),
      inGame("Pierre d'Amélioration","vip"),
    ],
  },
  dielectric_ceramic:{
    id:"dielectric_ceramic",
    family:"gear_materials",
    resourceKey:"acq_resource_gear",
    options:[
      inGame("Céramique Diélectrique","campaign"),
      inGame("Céramique Diélectrique","alliance"),
      inGame("Céramique Diélectrique","honor"),
      inGame("Céramique Diélectrique","vip"),
    ],
  },
  drone_components:{
    id:"drone_components",
    family:"drone_components",
    resourceKey:"acq_resource_drone_components",
    options:[
      inGame("Coffre de Composant de Drone Niv.3","campaign"),
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
      inGame("Pièce de Drone","campaign"),
      inGame("Pièce de Drone","alliance"),
      inGame("Pièce de Drone","honor"),
      inGame("Pièce de Drone","vip"),
      paid("S1 Pass Hebdomadaire de Pièces de Drone","Centre commercial · Pass Hebdomadaire"),
    ],
  },
  drone_chips:{
    id:"drone_chips",
    family:"drone_chips",
    resourceKey:"acq_resource_drone_chips",
    options:[
      inGame("Coffre de Puce de Compétence (SSR)","campaign"),
      inGame("Coffre de Puce de Compétence (R)","campaign"),
      inGame("Matériel de Puce Basique · 400","campaign"),
      inGame("Coffre de Puce de Compétence (SR)","alliance"),
      inGame("Coffre de Puce de Compétence (SR)","vip"),
      inGame("Coffre de Puce de Compétence (UR)","honor"),
      paid("Compétence de Drone","Centre commercial · Offres Hebdomadaires"),
    ],
  },
  hero_shards:{
    id:"ur_hero_fragments",
    family:"hero_shards",
    resourceKey:"acq_resource_ur_fragments",
    options:[
      inGame("Fragment de Héros UR Universel","campaign"),
      inGame("Fragment de Héros UR Universel","alliance"),
      inGame("Fragment de Héros UR Universel","honor"),
      inGame("Fragment de Héros UR Universel","vip"),
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
      inGame("Noyau d'Armement","alliance"),
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
      inGame("Matériaux d'Armement · 2.0K","alliance"),
      inGame("Matériaux d'Armement · 5.0K","vip"),
      paid("Recherche Spéciale d'Armement","Centre commercial · Offres Hebdomadaires"),
    ],
  },
  armament:{
    id:"armament",
    family:"armament",
    resourceKey:"acq_resource_armament",
    options:[
      inGame("Noyau d'Armement","alliance"),
      inGame("Noyau d'Armement","vip"),
      inGame("Noyau d'Armement","honor"),
      inGame("Matériaux d'Armement · 2.0K","alliance"),
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
  if(/\b(ceramique|ceramic)\b/.test(hint))return {guide:GUIDES.dielectric_ceramic};
  if(kind==="gear"||family==="gear_materials")return {guide:GUIDES.gear};
  if(family==="drone_chips"||family==="drone_skill_chips"||/\b(chip|chips|skill|puce|puces)\b/.test(hint))return {guide:GUIDES.drone_chips};
  if(kind==="drone"||family==="drone_components"){
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

function normalizedCurrencyKey(value){
  const raw=String(value||"").trim();
  if(["campaign_points","honor_medals","alliance_coins","diamonds","gold_brick","season_tokens"].includes(raw))return raw;
  const key=normalized(raw).replace(/[^a-z0-9]/g,"");
  if(key.includes("campaign")||key.includes("campagne"))return "campaign_points";
  if(key.includes("alliance"))return "alliance_coins";
  if(key.includes("honor")||key.includes("honneur"))return "honor_medals";
  if(key.includes("diamond")||key.includes("diamant"))return "diamonds";
  if(key.includes("season")||key.includes("saison"))return "season_tokens";
  if(key.includes("goldbrick")||key.includes("briquedor")||key.includes("briquesdor"))return "gold_brick";
  return null;
}

function freshWallet(state){
  const shop=state?.shop||{};
  const currency=normalizedCurrencyKey(shop.currency||shop.currency_key||shop.currency_name||shop.currency_type);
  const rawBalance=shop.currency_balance??shop.balance;
  const balance=Number(rawBalance);
  const capturedAt=Date.parse(shop.updated_at||shop.observed_at||shop.last_scanned_at||"");
  const now=Date.now();
  if(!currency||rawBalance===null||rawBalance===undefined||String(rawBalance).trim()===""||!Number.isFinite(balance)||balance<0||!Number.isFinite(capturedAt)||capturedAt>now+5*60*1000||now-capturedAt>24*60*60*1000)return null;
  return {currency,balance};
}

function priorityGrade(priority){
  const text=priorityText(priority);
  return text.match(/\b(ur|ssr|sr|r)\b/)?.[1]||null;
}

function prioritizeInternalOptions(options,priority,state){
  const wallet=freshWallet(state);
  if(!wallet)return {options,best:null};
  const affordable=options.filter(option=>
    normalizedCurrencyKey(option.currency)===wallet.currency&&
    option.amount!==null&&option.amount!==undefined&&
    Number.isFinite(Number(option.amount))&&Number(option.amount)<=wallet.balance
  );
  if(!affordable.length)return {options,best:null};
  const grade=priorityGrade(priority);
  const indexed=options.map((option,index)=>({option,index}));
  indexed.sort((a,b)=>{
    const aAffordable=affordable.includes(a.option),bAffordable=affordable.includes(b.option);
    if(aAffordable!==bAffordable)return aAffordable?-1:1;
    if(aAffordable&&grade){
      const aGrade=normalized(a.option.item).match(/\b(ur|ssr|sr|r)\b/)?.[1]===grade;
      const bGrade=normalized(b.option.item).match(/\b(ur|ssr|sr|r)\b/)?.[1]===grade;
      if(aGrade!==bGrade)return aGrade?-1:1;
    }
    if(aAffordable){
      const costDifference=Number(a.option.amount)-Number(b.option.amount);
      if(costDifference)return costDifference;
    }
    return a.index-b.index;
  });
  const ordered=indexed.map(entry=>entry.option);
  const targetGrade=grade?affordable.filter(option=>normalized(option.item).match(/\b(ur|ssr|sr|r)\b/)?.[1]===grade):[];
  const candidatePool=targetGrade.length?targetGrade:affordable;
  const sameItem=candidatePool.every(option=>normalized(option.item)===normalized(candidatePool[0]?.item));
  const best=candidatePool.length===1||sameItem?candidatePool.reduce((lowest,option)=>
    !lowest||Number(option.amount)<Number(lowest.amount)?option:lowest,null):null;
  return {options:ordered,best};
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
  const ranked=prioritizeInternalOptions(internal,priority,state);
  const paidOptions=bottleneck?detected.guide.options.filter(option=>option.type==="paid"):[];
  const options=[...ranked.options,...paidOptions];
  return {
    id:detected.guide.id,
    resourceKey:detected.guide.resourceKey,
      resourceFamily:detected.guide.family,
    focus,
    known:true,
    noteKey:detected.noteKey||null,
    bottleneck,
    options:options.map(option=>({...option,bestInternal:option===ranked.best})),
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
  "acq_hero_rarity_unconfirmed","acq_restock_weekly","acq_restock_monthly","acq_limit_observed",
    "acq_currency_campaign","acq_currency_honor","acq_currency_diamonds",
  "acq_currency_alliance","acq_currency_season","acq_currency_gold_bricks","acq_cost_format","acq_cost_per_fragment",
]);