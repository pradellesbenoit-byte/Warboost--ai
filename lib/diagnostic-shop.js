import {resourceAcquisitionForPriority,formatAcquisitionCost} from "./resource-acquisition.js";
import {canonicalShopStore} from "./shop-catalog.js";
import {resolveDiagnosticState} from "./player-global-diagnostic.js";
import {canonicalHeroName} from "./heroes.js";

const rows=x=>Array.isArray(x)?x:[];
const norm=x=>String(x??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").toLowerCase().trim().replace(/\s+/g," ");
const money=new Set(["eur","usd","gbp","cad","aud","chf","jpy","cny","krw","brl","inr","try","pln"]);
const clean=x=>String(x??"").trim();
const heroKey=x=>norm(canonicalHeroName(x)||x).trim();
const validPrice=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x))&&Number(x)>=0;
const currencyLabels={
  campaign_points:"acq_currency_campaign",honor_medals:"acq_currency_honor",alliance_coins:"acq_currency_alliance",
  diamonds:"acq_currency_diamonds",gold_brick:"acq_currency_gold_bricks",season_tokens:"acq_currency_season",
};

// The approved diagnostic selects the scope; this module never reorders priorities.
function scopedPriorities(analysis){
  const originals=rows(analysis?.priorities);
  if(!analysis?.global_diagnostic)return originals.slice(0,3).map(p=>({...p}));
  return rows(analysis.global_diagnostic.priorities).slice(0,3).map(p=>{
    const matched=originals.find(o=>{
      const domain=["drone","technology"].includes(o.kind)?o.kind:
        `hero:${heroKey(o.hero||o.target||o.title)}:${o.kind}`;
      return domain===p.domain;
    });
    if(matched)return {...matched};
    if(p.domain==="drone"||p.domain==="drone_parts")return {...p,kind:"drone"};
    const hero=String(p.domain||"").match(/^hero:(.+):(exclusive|gear|stars|level)$/);
    if(hero)return {...p,hero:hero[1],kind:hero[2]};
    return null;
  }).filter(Boolean);
}

function belongs(offer,view,priority){
  const name=norm(offer.item_name||offer.item),contents=offer.content_verified?norm(offer.contents):"";
  if(priority.kind!=="exclusive"&&priority.resource_name&&
    (name===norm(priority.resource_name)||contents.includes(norm(priority.resource_name))))return true;
  const text=`${name} ${contents}`,family=view.resourceFamily||view.id;
  if(priority.kind==="exclusive"){
    const hero=priority.hero||priority.target;
    const named=Boolean(hero)&&name.replace(/[.\s]/g,"").includes(heroKey(hero).replace(/[.\s]/g,""));
    if(!/exclusive|exclusif/.test(text))return false;
    // Unknown/locked weapons require hero-specific unlock evidence, never universals.
    if(!view.known)return !/univers/.test(text)&&named;
    return /fragment|shard/.test(text)&&(/univers/.test(text)||named);
  }
  const patterns={
    drone_parts:/pi[eè]ce.*drone|drone.*parts?/,
    drone_components:/composant.*drone|drone.*component/,
    drone_chips:/puce|skill.*chip|chip.*material/,
    gear_materials:/ceramique|ceramic|pierre.*amelioration|enhancement.*stone/,
    hero_shards:/fragment.*heros.*ur|ur.*hero.*shard/,
    hero_xp:/exp.*heros|hero.*exp/,
    armament_core:/noyau.*armement|armament.*core/,
    armament_research:/materiau.*armement|armament.*material/,
  };
  return patterns[family]?.test(text)||false;
}

export function buildDiagnosticShop(analysis={},input={},locale="fr",now=Date.now()){
  const state=resolveDiagnosticState(input),fr=String(locale).startsWith("fr"),text=(a,b)=>fr?a:b;
  const verify=text("à vérifier dans la boutique Last War","check in the Last War store");
  const translate=(key,args={})=>{
    const currencies={
      acq_currency_campaign:text("médailles de campagne","campaign medals"),
      acq_currency_honor:text("médailles d’honneur","honor medals"),
      acq_currency_alliance:text("points d’alliance","alliance points"),
      acq_currency_diamonds:text("diamants","diamonds"),
      acq_currency_gold_bricks:text("briques d’or","gold bricks"),
      acq_currency_season:text("jetons de saison","season tokens"),
    };
    if(key==="acq_cost_format")return `${args.amount} ${args.currency}${args.suffix||""}`;
    if(key==="acq_cost_per_fragment")return text(" / fragment"," / shard");
    return currencies[key]||verify;
  };
  const snapshots=[...rows(state.shop?.snapshots),state.shop||{}];
  const cards=[],seen=new Set();
  for(const priority of scopedPriorities(analysis)){
    if(priority.kind==="exclusive"&&priority.current==null){
      const weapon=rows(state.exclusive_weapons).find(w=>heroKey(w.hero_name)===heroKey(priority.hero)&&w.review_state!=="pending"&&!w.needs_confirmation);
      if(weapon?.level!=null)priority.current=weapon.level;
    }
    const view=resourceAcquisitionForPriority(priority,{priorities:[priority],bottleneck:priority},state);
    const explicitResource=priority.resource_name||priority.resource_id||priority.resource_type||
      priority.resource_family&&!["data","none"].includes(priority.resource_family);
    if(!view||(!view.known&&priority.kind!=="exclusive"&&!explicitResource))continue;
    const identity=`${view.id}:${heroKey(priority.hero||priority.target)}`;
    if(seen.has(identity))continue;seen.add(identity);
    let note=null;
    if(priority.kind==="exclusive")note=view.known?
      text("Fragments universels : amélioration d’une arme déjà débloquée, pas son déverrouillage initial.",
        "Universal shards upgrade an already unlocked weapon; they do not initially unlock it."):
      text("Déverrouillage : vérifier les fragments propres au héros et les conditions dans Last War. Les fragments universels ne déverrouillent pas initialement l’arme.",
        "Unlock: check hero-specific shards and conditions in Last War. Universal shards do not initially unlock the weapon.");
    const options=view.options.filter(o=>o.referenceSource).map(o=>({
      item:o.item,store:o.type==="paid"?`${text("Boutique officielle Last War","Official Last War store")} · ${o.store}`:o.store,
      type:o.type,priceObserved:validPrice(o.priceEur)||validPrice(o.amount),
      cost:formatAcquisitionCost(o,translate,locale),
      observedAt:o.referenceDate,source:o.referenceSource,fresh:false,
      timestamp:Date.parse(o.referenceDate)||0,
    }));
    // Confirmed player state only; pending review data is never a shop source.
    for(const snapshot of snapshots){
      if(snapshot.review_state==="pending"||snapshot.needs_confirmation)continue;
      for(const offer of rows(snapshot.offers)){
        if(offer.sold||offer.review_state==="pending"||offer.needs_confirmation||!belongs(offer,view,priority))continue;
        const currency=clean(offer.currency||snapshot.currency),key=currency.toLowerCase();
        const real=money.has(key)||key==="real_money"||key==="cash"||/[€$£]/.test(currency);
        const currencyReliable=offer.currency_confidence==null||Number(offer.currency_confidence)>=0.9;
        const priceReliable=validPrice(offer.price)&&(offer.price_confidence==null||Number(offer.price_confidence)>=0.9);
        const free=offer.offer_kind==="reward"||offer.offer_kind==="free"||priceReliable&&Number(offer.price)===0;
        const type=free?"free":!currencyReliable?"unknown":real?"paid":currency?"internal":"unknown";
        let cost=verify;
        const reliable=priceReliable&&currencyReliable;
        if(free)cost=text("Gratuit / récompense","Free / reward");
        else if(reliable&&currency){
          const currencyLabel=currencyLabels[key]?translate(currencyLabels[key]):currency;
          cost=money.has(key)?new Intl.NumberFormat(locale,{style:"currency",currency:key.toUpperCase()}).format(Number(offer.price)):
            `${new Intl.NumberFormat(locale).format(Number(offer.price))} ${currencyLabel}`;
        }
        const date=offer.updated_at||snapshot.field_updated_at?.offers||snapshot.updated_at||null;
        const timestamp=Date.parse(date)||0;
        // Envelope dates can advance after partial scans; never turn them into live stock evidence.
        const fresh=Boolean(offer.updated_at&&timestamp<=now&&now-timestamp<=12*3600000);
        options.push({item:offer.item_name,store:real?
          `${text("Boutique officielle Last War","Official Last War store")} · ${canonicalShopStore(snapshot.store_type)||verify}`:
          canonicalShopStore(snapshot.store_type)||verify,type,cost,observedAt:date,
          source:offer.source||snapshot.source||text("Données boutique du joueur","Player shop data"),fresh,timestamp,
          priceObserved:reliable&&Boolean(currency)});
      }
    }
    const unique=new Map();
    for(const option of options){
      const key=`${norm(option.item)}:${norm(option.store)}:${option.type}`;
      if(!unique.has(key)||option.timestamp>=unique.get(key).timestamp)unique.set(key,option);
    }
    const ordered=[...unique.values()].sort((a,b)=>({free:0,internal:1,unknown:2,paid:3}[a.type]-{free:0,internal:1,unknown:2,paid:3}[b.type])||b.timestamp-a.timestamp);
    const nonPaid=ordered.filter(o=>o.type!=="paid"),paid=ordered.find(o=>o.type==="paid");
    const selected=[...nonPaid.slice(0,paid?2:3),...(paid?[paid]:[])];
    if(!selected.length)selected.push({item:priority.resource_name||priority.title||priority.hero||text("Ressource prioritaire","Priority resource"),
      store:verify,type:"unknown",cost:verify,observedAt:null,source:null,fresh:false});
    cards.push({title:priority.title||view.focus||text("Ressource prioritaire","Priority resource"),note,options:selected});
  }
  return cards.slice(0,3);
}