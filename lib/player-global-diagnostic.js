import {mergeFreshRecord} from "./field-freshness.js";
import {canonicalHeroName} from "./heroes.js";
import {freshnessInfo} from "./data-freshness.js";
import {parseHeroPower} from "./hero-power.js";
import {mergeKnownResources} from "./player-known-facts.js";

const positive=value=>Number.isFinite(Number(value))&&Number(value)>0;
const heroKey=value=>String(canonicalHeroName(value)||value||"").trim().toLowerCase();
const fields=["level","stars","power","power_m","exclusive","awakening","gear"];
const clone=value=>JSON.parse(JSON.stringify(value||{}));
const rows=value=>Array.isArray(value)?value:[];
export function resolveDiagnosticState(input={}){
  const state=clone(input&&typeof input==="object"&&!Array.isArray(input)?input:{}),heroes=new Map();
  const records=[...rows(state.squads).flatMap(s=>rows(s?.heroes)),...rows(state.hero_profiles),...rows(state.hero_progression)];
  for(const row of records){
    const name=row?.name||row?.hero_name,key=heroKey(name);if(!key)continue;
    const values=Object.fromEntries(fields.filter(k=>row[k]!==null&&row[k]!==undefined&&row[k]!==""&&
      (!["power","power_m"].includes(k)||positive(k==="power"?parseHeroPower(row[k]):row[k]))).map(k=>[k,row[k]]));
    const metadata=Object.fromEntries(["source","updated_at","field_source","field_updated_at"].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
    const merged=mergeFreshRecord(heroes.get(key)||{}, {...metadata,...values},fields.filter(k=>k in values),{
      baseSource:"hero_profile",incomingSource:"hero_profile"
    });
    heroes.set(key,{...merged,name});
  }
  state.squads=rows(state.squads).map(s=>s?{...s,heroes:rows(s.heroes).map(row=>row?.name?{...row,...heroes.get(heroKey(row.name)),name:row.name}:row)}:s);
  const weapons=new Map();
  for(const row of rows(state.exclusive_weapons)){
    const key=heroKey(row.hero_name);if(!key)continue;
    weapons.set(key,{...mergeFreshRecord(weapons.get(key)||{},row,Object.keys(row).filter(k=>!["updated_at","source","field_source","field_updated_at"].includes(k)),{baseSource:"exclusive_weapon",incomingSource:"exclusive_weapon"}),hero_name:row.hero_name});
  }
  state.exclusive_weapons=[...weapons.values()];
  state.resources=state.resources||{};
  for(const shop of [...rows(state.shop?.snapshots),state.shop||{}]){
    if(typeof shop.currency_balance!=="number"||shop.currency_balance<0||!/^[a-z][a-z0-9_]{0,39}$/i.test(shop.currency||""))continue;
    state.resources=mergeKnownResources(state.resources,{[shop.currency]:shop.currency_balance,
      source:shop.source||"shop",updated_at:shop.updated_at,field_updated_at:{[shop.currency]:shop.field_updated_at?.currency_balance||shop.updated_at},
      field_source:{[shop.currency]:shop.field_source?.currency_balance||shop.source||"shop"}});
  }
  return state;
}

export function buildGlobalDiagnostic(input,analysis={},locale="fr"){
  const state=resolveDiagnosticState(input),fr=String(locale).startsWith("fr"),text=(a,b)=>fr?a:b;
  const candidates=[],missing=[],seen=new Set();
  function add(domain,title,why,action,score,impact=text("Gain chiffré non connu.","Exact gain unknown.")){
    if(seen.has(domain)||!title||!action)return;seen.add(domain);candidates.push({domain,title,why,action,impact,score});
  }
  for(const [i,p] of (analysis.priorities||[]).entries()){
    const row=(state.squads||[]).flatMap(s=>s?.heroes||[]).find(h=>heroKey(h?.name)===heroKey(p.hero||p.target));
    const field={stars:"stars",level:"level",exclusive:"exclusive",gear:"gear"}[p.kind],
      at=row?.field_updated_at?.[field]||p.source_updated_at,
      stale=freshnessInfo(at,p.kind==="drone"?"drone":"hero",locale).blocks_paid;
    let impact=text("Amélioration ciblée de l’escouade ; gain exact non connu.","Targeted squad improvement; exact gain unknown.");
    if(p.next_target)impact=text(`Objectif : ${p.next_target}. Gain exact non connu.`,`Target: ${p.next_target}. Exact gain unknown.`);
    const current=parseHeroPower(row?.power),history=rows(state.progression_snapshots).filter(s=>Date.parse(s?.at)<Date.parse(row?.field_updated_at?.power||row?.updated_at||"")).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const previous=history.flatMap(s=>s.hero_powers||[]).find(h=>heroKey(h.hero_name)===heroKey(p.hero||p.target)),old=parseHeroPower(previous?.power);
    if(current!==null&&old!==null&&current>old)impact+=text(` Progression déjà observée : +${Math.round(current-old)} puissance, pas un gain prévu.`,`Already observed progress: +${Math.round(current-old)} power, not a predicted gain.`);
    add(["drone","technology"].includes(p.kind)?p.kind:`hero:${heroKey(p.hero||p.target||p.title)}:${p.kind}`,
      `${p.title||""}${p.target?` · ${p.target}`:""}`,p.reason||p.why||analysis.summary,
      stale?text(`Actualise les données de ${p.target||p.title} avant : ${p.action||p.title}`,`Refresh ${p.target||p.title} data before: ${p.action||p.title}`):p.action||p.next_action||p.title,100-i,impact);
  }
  const hq=state.player?.hq_level;
  if(positive(hq))add("hq",text(`Préparer le prochain palier après QG ${hq}`,`Prepare the next milestone after HQ ${hq}`),
    text("Le QG conditionne la progression. Les prérequis et stocks non renseignés ne sont pas supposés remplis.","HQ gates progression. Unknown prerequisites and stocks are not assumed complete."),
    text("Vérifie les prérequis du prochain QG dans le jeu avant de dépenser.","Check the next HQ prerequisites in game before spending."),35);
  else missing.push(text("QG à confirmer.","Confirm HQ."));
  const drone=state.drone||{},boost=drone.boostCombat?.level;
  if(positive(drone.level)||positive(boost))add("drone",text("Concentrer les améliorations du drone","Focus drone upgrades"),
    text(`Drone ${drone.level??"non renseigné"} ; boost ${boost??"non renseigné"}. Ces deux niveaux restent indépendants.`,
      `Drone ${drone.level??"unknown"}; boost ${boost??"unknown"}. These levels are independent.`),
    text("Compare le prochain palier visible au besoin de ton escouade principale ; ne disperse pas les composants.","Compare the visible next milestone against your main squad need; avoid spreading components."),55);
  else missing.push(text("Niveau et boost du drone à confirmer.","Confirm drone level and boost."));
  for(const [key,branch] of Object.entries(state.technology?.branches||{})){
    if(!branch?.name||branch.review_state==="pending"||branch.needs_confirmation||branch.state==="locked"||branch.state==="max")continue;
    if(branch.percent===null||branch.percent===undefined||!Number.isFinite(Number(branch.percent)))continue;
    add(`technology:${key}`,text(`Avancer ${branch.name||key}`,`Advance ${branch.name||key}`),
      text(`Progression connue : ${branch.percent} %. Aucun bonus de puissance n’est extrapolé.`,`Known progress: ${branch.percent}%. No power bonus is extrapolated.`),
      text("Vérifie le prochain niveau et son coût, puis réserve les ressources utiles.","Check the next level and its cost, then reserve the useful resources."),60);
  }
  if(!Object.keys(state.technology?.branches||{}).length)missing.push(text("Technologies nommées non renseignées.","Named technologies unknown."));
  if(!state.exclusive_weapons?.length)missing.push(text("Armes exclusives non renseignées.","Exclusive weapons unknown."));
  const parts=[...rows(drone.components),...rows(drone.skill_chips)];
  if(!parts.length)missing.push(text("Composants et puces du drone non renseignés.","Drone components and chips unknown."));
  else add("drone_parts",text("Préserver les composants et puces utiles","Preserve useful components and chips"),
    parts.map(x=>`${x.name||""}${x.level!=null?` · ${x.level}`:""}`).join(", "),
    text("Conserve les éléments nécessaires au prochain palier visible ; compatibilité et coûts à vérifier.","Keep parts needed for the next visible milestone; verify compatibility and costs."),45);
  const balances=Object.entries(state.resources||{}).filter(([key,v])=>!["source","updated_at","field_source","field_updated_at"].includes(key)&&typeof v==="number"&&v>=0);
  if(!balances.length)missing.push(text("Stocks de ressources non renseignés : budget non calculable.","Resource stocks unknown: budget cannot be calculated."));
  const offers=rows(state.shop?.offers),recommendations=rows(analysis.shop?.recommendations||analysis.shop?.offers||analysis.shop?.ranked_offers);
  const purchases=offers.filter(o=>o.item_name&&typeof o.price==="number"&&o.price>=0&&o.currency&&o.sold!==true&&
      !["usd","eur","gbp","real_money","cash"].includes(String(o.currency).toLowerCase())&&
      !freshnessInfo(o.updated_at||state.shop?.updated_at,"shop",locale).blocks_paid)
    .filter(o=>recommendations.some(r=>(r.item_name||r.item||r.name)===o.item_name&&
      (r.verdict_key==="buy_now"||r.recommended===true||r.should_buy===true||r.decision==="buy")))
    .filter(o=>typeof state.resources?.[o.currency]==="number"&&state.resources[o.currency]>=Number(o.price)&&
      !freshnessInfo(state.resources.field_updated_at?.[o.currency]||state.resources.updated_at,"shop",locale).blocks_paid)
    .slice(0,2).map(o=>({name:o.item_name,reason:text("Offre visible utile et prix couvert par le stock connu ; vérifie le contenu avant achat.","Useful visible offer covered by known balance; check contents before purchase.")}));
  if(!offers.length)missing.push(text("Boutique non scannée : aucun achat proposé.","Shop not scanned: no purchase proposed."));
  const priorities=candidates.sort((a,b)=>b.score-a.score).slice(0,3);
  if(!priorities.length)priorities.push({domain:"confirm",title:text("Confirmer l’escouade principale","Confirm the main squad"),why:text("Données insuffisantes pour classer des améliorations.","Not enough data to rank upgrades."),action:text("Scanne puis vérifie ton escouade et ton QG.","Scan and review your squad and HQ."),impact:text("Évite une recommandation inventée.","Avoids fabricated recommendations.")});
  const today=priorities.map(x=>x.action);
  const seven_days=Array.from({length:7},(_,i)=>({day:i+1,action:i<3?today[i%today.length]:
    text(["Comparer coûts et stocks avant toute dépense.","Exécuter seulement l’amélioration validée et abordable.","Confirmer les données qui ont changé.","Recalculer les priorités et préparer la semaine suivante."][i-3],
      ["Compare costs and stocks before spending.","Perform only a verified, affordable upgrade.","Confirm data that changed.","Recalculate priorities and prepare next week."][i-3])}));
  return {priorities,today,seven_days,purchases,missing,resources:{
    keep:[text("Garde les ressources rares tant que le coût du palier prioritaire est inconnu.","Keep rare resources while the priority milestone cost is unknown."),
      ...balances.map(([k,v])=>text(`Stock connu ${k} : ${v}.`,`Known ${k} stock: ${v}.`))],
    spend:[text("Dépense uniquement sur une priorité vérifiée, après contrôle du coût dans le jeu.","Spend only on a verified priority after checking its in-game cost.")]
  },inputs:{player_id:state.player_id,hq,drone,technology:state.technology,heroes:[...new Map((state.squads||[]).flatMap(s=>s?.heroes||[]).filter(h=>h?.name).map(h=>[heroKey(h.name),h])).values()],
    exclusive_weapons:state.exclusive_weapons,resources:state.resources,shop:state.shop,history:state.progression_snapshots||[]}};
}