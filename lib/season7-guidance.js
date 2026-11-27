const REVIEWED_ON="2026-11-27";
const SOURCES=Object.freeze([
  {id:"official-alliance-skills",kind:"official",reviewed_on:"2026-11-27",title:"Season 7 Alliance Skills and War Declarations",url:"https://wiki.lastwar.com/en/show/635"},
  {id:"official-combat-plans",kind:"official",reviewed_on:"2026-11-27",title:"Season VII: Combat plans",url:"https://wiki.lastwar.com/en/show/640"},
  {id:"official-season-map",kind:"official",reviewed_on:"2026-11-27",title:"Season 7 Interactive Map",url:"https://wiki.lastwar.com/en/show/637"},
  {id:"cpt-season-update",kind:"community_updated",reviewed_on:"2026-11-26",title:"CPT Hedge update log",url:"https://cpt-hedge.com/fr/updates"},
  {id:"cpt-season-map",kind:"community_updated",reviewed_on:"2026-11-26",title:"Season 7 map guide",url:"https://cpt-hedge.com/guides/season-7-map-guide"},
  {id:"cpt-curse-lab",kind:"community_reference",reviewed_on:"2026-11-26",title:"Curse Research Lab S7 reference",url:"https://cpt-hedge.com/buildings/curse-research-lab-s7"},
  {id:"cpt-blessing-fountain",kind:"community_reference",reviewed_on:"2026-11-26",title:"Blessing Fountain S7 reference",url:"https://cpt-hedge.com/buildings/blessing-fountain-s7"},
  {id:"cpt-combat-lab",kind:"community_reference",reviewed_on:"2026-11-26",title:"Combat Lab reference",url:"https://cpt-hedge.com/buildings/combat-lab"},
  {id:"whiskey-s7-data",kind:"community_updated",reviewed_on:"2026-11-21",title:"Season 7 game-data update",url:"https://www.lastwarwhiskeykiss.com/post/season-7-game-data-update-temple-rules-combat-plan-unlocks-and-profession-skills"},
  {id:"whiskey-s7-live",kind:"community_live_details",reviewed_on:"2026-11-25",title:"Season 7 combat plans and live details",url:"https://www.lastwarwhiskeykiss.com/post/season-7-update-combat-plans-and-new-live-details"}
]);
const DOMAIN_SOURCES=Object.freeze({
  curse_resistance:["cpt-curse-lab","cpt-blessing-fountain","cpt-season-map"],
  combat_plans:["official-combat-plans","cpt-combat-lab","whiskey-s7-live"],
  alliance:["official-alliance-skills","official-season-map","cpt-season-map","whiskey-s7-data"],
  resources:["cpt-season-map","cpt-season-update"],
  profession:["whiskey-s7-data"],
  seasonal_shop:[]
});
const COPY={
  fr:{
    refresh:"Confirme ou actualise la saison active dans le jeu avant tout conseil S7 chiffré.",
    summary:"S7 active confirmée dans l’état enregistré. Les niveaux, coûts, disponibilités et gains doivent être vérifiés sur l’écran actuel du jeu; aucun rendement n’est prédit.",
    domains:{
      curse_resistance:"S7 utilise le Curse Research Lab et la Blessing Fountain; ne transpose pas les règles S6. Compare uniquement le niveau et la résistance actuellement visibles, puis vérifie le prochain seuil et son coût dans le jeu.",
      combat_plans:"Choisis un plan seulement s’il est visible et disponible dans le Combat Lab actuel, selon l’objectif confirmé PvP, PvE ou VS. Ne déduis aucun déblocage, effet supérieur ou stockage Power Cells d’un niveau non vérifié.",
      alliance:"Pour R4/R5, vérifie la carte, le bonus de ville/temple et le calendrier affichés sur le serveur. Les détails communautaires restent estimatifs; cette recommandation ne change aucun droit.",
      resources:"Distingue Mithril des strongholds, Gold Dust des villes et Sacred Water. Coûts, stocks et production individuels restent inconnus sans données actuelles du jeu; aucun ROI n’est calculé.",
      profession:"Utilise seulement la profession enregistrée et les compétences dont l’accès est visible. Si le métier ou le prochain prérequis manque, vérifie-le en jeu avant de dépenser.",
      seasonal_shop:"Classe une offre S7 seulement avec une capture récente de l’offre, de la monnaie, du solde et du besoin du compte. Pas d’achat suggéré sur une remise ou un prix de référence seul."
    }
  },
  en:{
    refresh:"Confirm or refresh the active season in game before any numeric S7 advice.",
    summary:"S7 is active in the saved state. Levels, costs, availability, and gains must be checked on the current in-game screen; no return is predicted.",
    domains:{
      curse_resistance:"S7 uses the Curse Research Lab and Blessing Fountain; do not transfer S6 rules. Compare only the currently visible level and resistance, then verify the next threshold and cost in game.",
      combat_plans:"Choose a plan only if it is visible and available in the current Combat Lab, for a confirmed PvP, PvE, or VS objective. Do not infer unlocks, higher-star effects, or Power Cells storage from an unverified level.",
      alliance:"For R4/R5, verify the map, city/temple bonus, and schedule shown on that server. Community details remain estimates; this advice changes no permissions.",
      resources:"Keep Stronghold Mithril, city Gold Dust, and Sacred Water distinct. Individual costs, stocks, and production are unknown without current game data; no ROI is calculated.",
      profession:"Use only the recorded profession and skills visibly unlocked. If the profession or next prerequisite is missing, verify it in game before spending.",
      seasonal_shop:"Rank an S7 offer only with a recent view of the offer, currency, balance, and account need. A discount or reference price alone never suggests a purchase."
    }
  }
};
const asTime=value=>{const result=Date.parse(value||"");return Number.isFinite(result)?result:null};
const localized=(locale)=>String(locale||"en").toLowerCase().startsWith("fr")?COPY.fr:COPY.en;
const guidanceLocale=locale=>{
  const code=String(locale||"en").toLowerCase();
  return code.startsWith("fr")?"fr":code.startsWith("en")?"en":"generic";
};

export function buildSeason7Guidance(state={},locale="en",now=Date.now(),{canonicalRoleVerified=false}={}){
  const season=state?.season||{},number=season.number!==null&&season.number!==undefined&&season.number!==""?Number(season.number):null,lifecycle=String(season.lifecycle||season.status||"").trim().toLowerCase();
  const lifecycleSource=String(season.lifecycle_source||season.status_source||"").trim().toLowerCase();
  const updatedAt=asTime(season.updated_at),age=updatedAt===null?null:Math.max(0,now-updatedAt);
  const explicitActive=lifecycle==="active"&&lifecycleSource==="manual";
  const recent=age!==null&&updatedAt<=now+5*60*1000&&age<=72*60*60*1000;
  const active=number===7&&explicitActive&&recent;
  const knownOtherSeason=Number.isInteger(number)&&number>0&&number!==7;
  const endedS7=number===7&&["ended","interseason","finished","complete","completed","closed","over"].includes(lifecycle);
  const copy=localized(locale);
  const shop=state?.shop||{},shopAt=asTime(shop.updated_at);
  const shopFresh=shopAt!==null&&shopAt<=now+5*60*1000&&now-shopAt<=12*60*60*1000&&
    String(shop.currency||"").trim()&&shop.currency_balance!==null&&shop.currency_balance!==undefined&&
    shop.currency_balance!==""&&Number.isFinite(Number(shop.currency_balance))&&Array.isArray(shop.offers)&&shop.offers.length>0;
  const profession=String(season.profession||"").trim();
  const resistance=season.resistance!==null&&season.resistance!==undefined&&season.resistance!==""&&
    Number.isFinite(Number(season.resistance))&&Number(season.resistance)>=0?Number(season.resistance):null;
  const role=canonicalRoleVerified?String(state?.player?.role||"").toUpperCase():"";
  const objective=String(state?.player_context?.objective||"").toLowerCase();
  const resources=state?.resources||{};
  const resourceStamp=asTime(resources?.updated_at);
  const resourceEvidence=Boolean(resourceStamp!==null&&resourceStamp<=now+5*60*1000&&now-resourceStamp<=72*60*60*1000&&
    resources&&typeof resources==="object"&&
    ["confirmed_scan","manual_profile","account_review"].includes(String(resources.source||""))&&
    Object.entries(resources).some(([key,value])=>/mithril|sacred.?water|gold.?dust/i.test(key)&&
      value!==null&&value!==""&&Number.isFinite(Number(value))&&Number(value)>=0));
  const domains=[
    {id:"curse_resistance",status:resistance===null?"unknown":"account_value_recorded",evidence:resistance===null?"unknown":"saved_account_field_not_independently_verified",observed:resistance===null?null:{resistance},source_ids:DOMAIN_SOURCES.curse_resistance},
    {id:"combat_plans",status:"verify_in_game",objective:["pvp","pve","vs"].includes(objective)?objective:"unknown",source_ids:DOMAIN_SOURCES.combat_plans},
    {id:"alliance",status:["R4","R5"].includes(role)?"leader_context_confirmed":"server_rules_need_review",role:["R4","R5"].includes(role)?role:null,source_ids:DOMAIN_SOURCES.alliance},
    {id:"resources",status:resourceEvidence?"account_resources_recorded":"cost_and_stock_unknown",source_ids:DOMAIN_SOURCES.resources},
    {id:"profession",status:profession?"profession_recorded_not_skill_verified":"profession_unknown",profession:profession||null,source_ids:DOMAIN_SOURCES.profession},
    {id:"seasonal_shop",status:shopFresh?"fresh_observed_shop":"offer_currency_or_balance_unknown",purchase_recommended:false,source_ids:DOMAIN_SOURCES.seasonal_shop}
  ].map(domain=>{
    const sourceKinds=domain.source_ids.map(id=>SOURCES.find(source=>source.id===id)?.kind);
    const officialReference=sourceKinds.includes("official");
    return {...domain,title:domain.id.replace(/_/g," "),reference_status:officialReference?"confirmed_official_reference":sourceKinds.length?"community_estimate":"unknown_reference",
      player_state:domain.status, guidance:copy.domains[domain.id]};
  });
  const status=active?"active_confirmed":knownOtherSeason||endedS7?"not_s7":number===7?"refresh_required":"season_unconfirmed";
  const sources=SOURCES.map(source=>({...source,source_status:source.kind==="official"?"official_reference":"community_reference_not_game_state"}));
  return {
    status,active,refresh_required:!active&&!knownOtherSeason&&!endedS7,season_number:Number.isInteger(number)?number:null,
    copy_locale:guidanceLocale(locale),
    lifecycle:explicitActive?"active_confirmed":lifecycle||"unknown",lifecycle_source:lifecycleSource||null,
    updated_at:season.updated_at||null,age_hours:age===null?null:Math.round(age/3600000),
    summary:active?copy.summary:!knownOtherSeason&&!endedS7?copy.refresh:null,
    domains:active?domains:[],sources:active?sources:[],
    evidence_policy:"official references describe systems; community tables are estimates; saved account fields are not independent in-game verification",
    numeric_upgrade_advice:false,purchase_recommended:false,guaranteed_power_gain:false,
    reviewed_on:REVIEWED_ON
  };
}
