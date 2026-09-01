import {requireBetaUser} from "../lib/beta-access.js";
import { metaAdjustment, metaContext, metaShopAdjustment } from '../lib/meta-intel.js';
import {canonicalHeroName,heroType} from '../lib/heroes.js';
import {classifyAllianceMember,summarizeAllianceActivity,normalizeAllianceRole} from '../lib/alliance-activity.js';
import {freshnessInfo,refreshBeforePaidText} from '../lib/data-freshness.js';
import {canonicalShopStore,findShopReference,referenceCategoryForItem,referenceItemsForStrategy,shopReferenceStats,SHOP_REFERENCE_DATE} from '../lib/shop-catalog.js';
import {formationBonusPct,mainSquadType,awakeningReadiness,awakeningDecisionScore,heroReshapeDecisionValue,season6TechPriorities,awakeningSwapAssessment,S6_AWAKENING_HEROES} from '../lib/season6-awakening.js';
import {seasonLifecycle,seasonIsActive,activeSeasonProgress} from '../lib/season-lifecycle.js';
import {buildAdaptiveContext,applyAdaptiveScoring,technologyOpportunity} from '../lib/adaptive-context.js';
import {selectPrimarySquad} from '../lib/squad-identity.js';
const ENGINE_VERSION="2.5.20";
function num(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function latestIso(...values){const valid=values.filter(Boolean).map(v=>({v,t:Date.parse(v)})).filter(x=>Number.isFinite(x.t)).sort((a,b)=>b.t-a.t);return valid[0]?.v||null}
function metric(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const m=String(v).replace(",",".").match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function gearMetric(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const text=String(v).replaceAll(",",".");
  // Prefer an explicit gear-level token ("Lv.40", "niv.40", etc.).
  // The previous engine could accidentally read the equipment count (e.g. the "4" in "4 équipements niv.40") as the gear level.
  const level=text.match(/(?:lv|niv|level|niveau|stufe|レベル|等级)\s*[.:#-]?\s*(\d+(?:\.\d+)?)/i);
  if(level)return Number(level[1]);
  const matches=text.match(/-?\d+(?:\.\d+)?/g)||[];
  const vals=matches.map(Number).filter(Number.isFinite).filter(x=>x>=10);
  return vals.length?Math.max(...vals):null;
}
function fmt(v,locale){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString(locale,{maximumFractionDigits:2})} M`:"—"}
function cleanName(v){return String(v||"").trim()}
function heroConfigured(h){
  const name=cleanName(h?.name);
  return Boolean((name&&!/^(hero|héros)\s*\d+$/i.test(name))||num(h?.level)!==null||num(h?.stars)!==null||num(h?.power)!==null||cleanName(h?.exclusive)||cleanName(h?.gear));
}
function squadConfigured(s){return Boolean(num(s?.power)!==null||s?.updated_at||(s?.heroes||[]).some(heroConfigured))}
const HERO_MEMORY_FIELDS=["level","stars","power","exclusive","gear","awakening"];
function heroKey(v){return canonicalHeroName(v).toLowerCase()}
function mergeHeroKnown(base={},extra={}){
  const out={...base};
  for(const f of HERO_MEMORY_FIELDS){const v=extra?.[f];if(v!==null&&v!==undefined&&v!=="")out[f]=v;}
  if(extra?.name)out.name=canonicalHeroName(extra.name);
  return out;
}
function newestByHero(list,name,nameFn){
  const key=heroKey(name);if(!key)return null;
  return (Array.isArray(list)?list:[]).filter(x=>heroKey(nameFn(x))===key).sort((a,b)=>(Date.parse(b?.updated_at||"")||0)-(Date.parse(a?.updated_at||"")||0))[0]||null;
}
function heroProfileByName(state,name){return newestByHero(state?.hero_profiles,name,x=>x?.hero_name||x?.name)}
function heroProgressionByName(state,name){return newestByHero(state?.hero_progression,name,x=>x?.hero_name||x?.name)}
function heroWeaponByName(state,name){return newestByHero(state?.exclusive_weapons,name,x=>x?.hero_name)}
function hydrateHeroFromMemory(state,raw={}){
  const name=canonicalHeroName(raw?.name||raw?.hero_name);if(!name)return {...raw};
  const profile=heroProfileByName(state,name),progress=heroProgressionByName(state,name),weapon=heroWeaponByName(state,name);
  let out=mergeHeroKnown({name},profile||{});
  out=mergeHeroKnown(out,{...raw,name});
  if(progress)out=mergeHeroKnown(out,{stars:progress.stars,exclusive:progress.exclusive,awakening:progress.awakening});
  if(weapon&&num(weapon.level)!==null)out=mergeHeroKnown(out,{exclusive:String(num(weapon.level))});
  out.name=name;return out;
}
function heroMemoryUpdatedAt(state,name,fallback=null){
  return latestIso(heroWeaponByName(state,name)?.updated_at,heroProgressionByName(state,name)?.updated_at,heroProfileByName(state,name)?.updated_at,fallback);
}
function localePack(locale){
  const x=String(locale||"en").toLowerCase();
  if(x.startsWith("fr"))return "fr";if(x.startsWith("es"))return "es";if(x.startsWith("de"))return "de";if(x.startsWith("ja"))return "ja";if(x.startsWith("zh"))return "zh";if(x.startsWith("ar"))return "ar";return "en";
}
const T={
  fr:{
    main:(n,p)=>`Concentre tes ressources sur ${n} (${p}).`,
    mainDetail:(n,p,g)=>`Concentre tes ressources sur ${n} (${p}). ${g}`,
    noSquad:"Scanne au moins une escouade pour activer le diagnostic PRO.",
    needHeroes:n=>`Rescanne ${n} sur un écran où les 5 héros sont visibles : WarBoost a besoin de leurs niveaux, étoiles, armes exclusives et équipements pour classer les achats avec précision.`,
    level:(h,g,t)=>`${h} a ${g} niveaux de retard sur le héros le plus avancé de l'escouade (cible observée : Nv.${t}).`,
    stars:(h,g)=>`${h} a ${g} étoile${g>1?"s":""} à rattraper pour atteindre 5★.`,
    exclusive:(h,g,t)=>`${h} a une arme exclusive en retrait de ${g} niveau${g>1?"x":""} par rapport au meilleur niveau observé (${t}).`,
    gear:(h,g,t)=>`${h} a un équipement en retrait de ${g} niveau${g>1?"x":""} par rapport au meilleur niveau visible (${t}).`,
    drone:(l,p)=>`Drone : ${l?`Nv.${l}`:"niveau non lu"}${p?` · ${p}`:""}. Continue les composants uniquement après les écarts prioritaires de l'escouade principale.`,
    scanMissing:list=>`Il manque encore ${list}. Scanne-les pour que WarBoost compare toutes tes escouades disponibles.`,
    actionLevel:h=>`Monte d'abord le niveau de ${h}, puis re-scanne l'escouade pour mesurer le gain.`,
    actionStars:h=>`Priorise les fragments de ${h} / fragments universels UR jusqu'au prochain palier d'étoiles.`,
    actionExclusive:h=>`Mets les fragments d'arme exclusive sur ${h} avant de les disperser sur une autre escouade.`,
    actionGear:h=>`Renforce d'abord l'équipement le plus faible de ${h}, puis équilibre les 5 héros.`,
    actionDrone:"Garde une réserve de composants et données de Drone ; investis-les après les 1–2 plus gros écarts héros.",
    actionScan:"Aucun achat maintenant : complète d'abord le scan pour éviter une mauvaise dépense.",
    freeHero:"Boutiques Alliance / Honneur / événements : fragments universels UR ou fragments du héros, si disponibles.",
    paidHero:"Si tu dépenses : choisis seulement un pack contenant les fragments correspondant à cette priorité.",
    freeLevel:"Récompenses, événements et boutiques gratuites : EXP Héros / ressources de montée de niveau.",
    paidLevel:"Évite un pack générique : prends uniquement de l'EXP Héros si ce retard bloque réellement ton escouade 1.",
    freeExclusive:"Événements et boutiques : fragments d'arme exclusive, si disponibles.",
    paidExclusive:"Pack arme exclusive seulement s’il accélère directement le héros prioritaire et si son rapport coût/gain est favorable ; ne répartis pas les fragments sur plusieurs héros.",
    freeGear:"Boutiques Honneur / événements : minerai d'amélioration et plans d'équipement, selon disponibilité.",
    paidGear:"Pack équipement/plans seulement si l'équipement est le principal goulot détecté.",
    freeDrone:"Événements et boutiques : composants de Drone / données de combat, selon disponibilité.",
    paidDrone:"Pack Drone uniquement après les priorités héros/équipement classées au-dessus.",
    freeNone:"Ne dépense rien avant d'avoir un scan complet.",paidNone:"Aucun achat payant recommandé avec des données incomplètes.",
    focusHold:(n)=>`Ne disperse pas tes ressources sur ${n} tant que les écarts prioritaires de l'escouade principale ne sont pas corrigés.`,
    squadStatusMain:"Priorité principale",squadStatusReady:"Secondaire",squadStatusLow:"À conserver",squadStatusMissing:"À scanner",
    confidence:n=>`Confiance ${n}%`,
    titles:{scan:"Compléter les données",level:"Niveau héros",stars:"Étoiles héros",exclusive:"Arme exclusive",gear:"Équipement",drone:"Drone",focus:"Concentration des ressources"}
  },
  en:{
    main:(n,p)=>`Focus your resources on ${n} (${p}).`,mainDetail:(n,p,g)=>`Focus your resources on ${n} (${p}). ${g}`,noSquad:"Scan at least one squad to activate the PRO diagnostic.",
    needHeroes:n=>`Rescan ${n} on a screen where all 5 heroes are visible. WarBoost needs levels, stars, exclusive weapons and gear to rank purchases accurately.`,
    level:(h,g,t)=>`${h} is ${g} level${g>1?"s":""} behind the most advanced hero in the squad (observed target: Lv.${t}).`,stars:(h,g)=>`${h} is ${g} star${g>1?"s":""} short of 5★.`,exclusive:(h,g,t)=>`${h}'s exclusive weapon is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,gear:(h,g,t)=>`${h}'s gear is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,drone:(l,p)=>`Drone: ${l?`Lv.${l}`:"level not read"}${p?` · ${p}`:""}. Keep Drone materials after the main-squad gaps above.`,scanMissing:list=>`${list} still need scanning so WarBoost can compare every squad available on your account.`,
    actionLevel:h=>`Raise ${h}'s level first, then rescan to measure the gain.`,actionStars:h=>`Prioritize ${h} shards / universal UR shards until the next star step.`,actionExclusive:h=>`Put exclusive-weapon shards into ${h} before spreading them to another squad.`,actionGear:h=>`Upgrade ${h}'s weakest gear first, then rebalance the 5 heroes.`,actionDrone:"Keep Drone components and battle data in reserve; spend them after the top 1–2 hero gaps.",actionScan:"Do not buy yet: complete the scan first to avoid a bad purchase.",
    freeHero:"Alliance / Honor / event shops: universal UR shards or target-hero shards when available.",paidHero:"If you spend: choose only a pack containing shards for this priority.",freeLevel:"Rewards, events and free shops: Hero EXP / level-up resources.",paidLevel:"Avoid generic packs; buy Hero EXP only if this level gap is truly blocking Squad 1.",freeExclusive:"Events and shops: exclusive-weapon shards when available.",paidExclusive:"Buy an exclusive-weapon pack only if it directly accelerates the priority hero and its cost-to-gain value is favorable; do not split shards across several heroes.",freeGear:"Honor / event shops: upgrade ore and gear blueprints when available.",paidGear:"Gear/blueprint pack only if gear is the main detected bottleneck.",freeDrone:"Events and shops: Drone components / battle data when available.",paidDrone:"Drone pack only after the hero/gear priorities ranked above.",freeNone:"Spend nothing until the scan is complete.",paidNone:"No paid purchase recommended with incomplete data.",focusHold:n=>`Do not spread resources to ${n} until the main-squad priority gaps are fixed.`,
    squadStatusMain:"Main priority",squadStatusReady:"Secondary",squadStatusLow:"Hold",squadStatusMissing:"Scan needed",confidence:n=>`Confidence ${n}%`,titles:{scan:"Complete the data",level:"Hero level",stars:"Hero stars",exclusive:"Exclusive weapon",gear:"Gear",drone:"Drone",focus:"Resource focus"}
  },
  es:{
    main:(n,p)=>`Concentra tus recursos en ${n} (${p}).`,mainDetail:(n,p,g)=>`Concentra tus recursos en ${n} (${p}). ${g}`,noSquad:"Escanea al menos un escuadrón para activar el diagnóstico PRO.",needHeroes:n=>`Vuelve a escanear ${n} mostrando los 5 héroes. WarBoost necesita niveles, estrellas, armas exclusivas y equipo para ordenar bien las compras.`,level:(h,g,t)=>`${h} está ${g} nivel(es) por detrás del héroe más avanzado (objetivo observado: Nv.${t}).`,stars:(h,g)=>`${h} necesita ${g} estrella(s) para llegar a 5★.`,exclusive:(h,g,t)=>`El arma exclusiva de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,gear:(h,g,t)=>`El equipo de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,drone:(l,p)=>`Dron: ${l?`Nv.${l}`:"nivel no leído"}${p?` · ${p}`:""}. Invierte después de los principales huecos del escuadrón 1.`,scanMissing:l=>`Falta escanear ${l} para comparar todos los escuadrones disponibles en tu cuenta.`,actionLevel:h=>`Sube primero el nivel de ${h} y vuelve a escanear.`,actionStars:h=>`Prioriza fragmentos de ${h} / fragmentos UR universales.`,actionExclusive:h=>`Pon los fragmentos de arma exclusiva en ${h} antes de repartirlos.`,actionGear:h=>`Mejora primero el equipo más débil de ${h}.`,actionDrone:"Reserva componentes y datos del Dron hasta cerrar los 1–2 mayores huecos de héroes.",actionScan:"No compres todavía: completa el escaneo primero.",freeHero:"Tiendas de Alianza / Honor / eventos: fragmentos UR universales o del héroe, si están disponibles.",paidHero:"Si gastas: solo un pack con los fragmentos de esta prioridad.",freeLevel:"Recompensas, eventos y tiendas gratuitas: EXP de héroe.",paidLevel:"Evita packs genéricos; compra EXP solo si este nivel bloquea el escuadrón 1.",freeExclusive:"Eventos y tiendas: fragmentos de arma exclusiva.",paidExclusive:"Compra un pack de arma exclusiva solo si acelera directamente al héroe prioritario y su relación coste/beneficio es favorable; no repartas fragmentos entre varios héroes.",freeGear:"Honor / eventos: mineral de mejora y planos de equipo.",paidGear:"Pack de equipo/planos solo si el equipo es el cuello de botella.",freeDrone:"Eventos y tiendas: componentes de Dron / datos de combate.",paidDrone:"Pack de Dron solo después de las prioridades anteriores.",freeNone:"No gastes hasta completar el escaneo.",paidNone:"No se recomienda compra de pago con datos incompletos.",focusHold:n=>`No repartas recursos en ${n} hasta corregir las prioridades del escuadrón principal.`,squadStatusMain:"Prioridad principal",squadStatusReady:"Secundario",squadStatusLow:"Conservar",squadStatusMissing:"Escanear",confidence:n=>`Confianza ${n}%`,titles:{scan:"Completar datos",level:"Nivel de héroe",stars:"Estrellas",exclusive:"Arma exclusiva",gear:"Equipo",drone:"Dron",focus:"Concentración"}
  },
  de:{
    main:(n,p)=>`Konzentriere deine Ressourcen auf ${n} (${p}).`,mainDetail:(n,p,g)=>`Konzentriere deine Ressourcen auf ${n} (${p}). ${g}`,noSquad:"Scanne mindestens einen Trupp für die PRO-Diagnose.",needHeroes:n=>`Scanne ${n} erneut, wobei alle 5 Helden sichtbar sind. WarBoost braucht Level, Sterne, Exklusivwaffen und Ausrüstung für eine genaue Kaufreihenfolge.`,level:(h,g,t)=>`${h} liegt ${g} Level hinter dem am weitesten entwickelten Helden (beobachtetes Ziel: Lv.${t}).`,stars:(h,g)=>`${h} fehlen ${g} Stern(e) bis 5★.`,exclusive:(h,g,t)=>`${h}s Exklusivwaffe liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,gear:(h,g,t)=>`${h}s Ausrüstung liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,drone:(l,p)=>`Drohne: ${l?`Lv.${l}`:"Level nicht erkannt"}${p?` · ${p}`:""}. Erst nach den Hauptlücken des Haupttrupps investieren.`,scanMissing:l=>`${l} müssen noch gescannt werden, damit alle auf deinem Konto verfügbaren Trupps verglichen werden.`,actionLevel:h=>`Erhöhe zuerst ${h}s Level und scanne danach erneut.`,actionStars:h=>`Priorisiere Fragmente für ${h} / universelle UR-Fragmente.`,actionExclusive:h=>`Exklusivwaffen-Fragmente zuerst in ${h} investieren.`,actionGear:h=>`Verbessere zuerst ${h}s schwächste Ausrüstung.`,actionDrone:"Drohnen-Komponenten und Kampfdaten zurückhalten, bis die größten Heldenlücken geschlossen sind.",actionScan:"Noch nichts kaufen: zuerst den Scan vervollständigen.",freeHero:"Allianz-/Ehre-/Event-Shop: universelle UR- oder Heldenfragmente, falls verfügbar.",paidHero:"Wenn du ausgibst: nur ein Paket mit Fragmenten für diese Priorität.",freeLevel:"Belohnungen, Events und Gratis-Shops: Helden-EXP.",paidLevel:"Keine generischen Pakete; EXP nur kaufen, wenn dieses Levelproblem Trupp 1 blockiert.",freeExclusive:"Events/Shops: Exklusivwaffen-Fragmente.",paidExclusive:"Ein Exklusivwaffen-Paket nur kaufen, wenn es den Prioritätshelden direkt beschleunigt und das Kosten-Nutzen-Verhältnis günstig ist; Fragmente nicht auf mehrere Helden verteilen.",freeGear:"Ehre/Events: Upgrade-Erz und Ausrüstungspläne.",paidGear:"Ausrüstungs-/Blueprint-Paket nur bei erkanntem Ausrüstungsengpass.",freeDrone:"Events/Shops: Drohnen-Komponenten / Kampfdaten.",paidDrone:"Drohnen-Paket erst nach den höher eingestuften Prioritäten.",freeNone:"Bis zum vollständigen Scan nichts ausgeben.",paidNone:"Bei unvollständigen Daten kein Kauf empfohlen.",focusHold:n=>`Ressourcen nicht auf ${n} verteilen, bevor die Hauptlücken des Haupttrupps behoben sind.`,squadStatusMain:"Hauptpriorität",squadStatusReady:"Sekundär",squadStatusLow:"Halten",squadStatusMissing:"Scannen",confidence:n=>`Vertrauen ${n}%`,titles:{scan:"Daten vervollständigen",level:"Heldenlevel",stars:"Sterne",exclusive:"Exklusivwaffe",gear:"Ausrüstung",drone:"Drohne",focus:"Ressourcenfokus"}
  },
  ja:{
    main:(n,p)=>`${n}（${p}）に資源を集中。`,mainDetail:(n,p,g)=>`${n}（${p}）に資源を集中。${g}`,noSquad:"PRO診断を有効にするには少なくとも1部隊をスキャンしてください。",needHeroes:n=>`${n}を5人の英雄が見える画面で再スキャンしてください。レベル、星、専用武器、装備が揃うと購入優先度を正確に判定できます。`,level:(h,g,t)=>`${h}は部隊内の最高レベルより${g}レベル低いです（確認できた目標：Lv.${t}）。`,stars:(h,g)=>`${h}は5★まであと${g}段階です。`,exclusive:(h,g,t)=>`${h}の専用武器は確認できた最高値${t}より${g}レベル低いです。`,gear:(h,g,t)=>`${h}の装備は確認できた最高値${t}より${g}レベル低いです。`,drone:(l,p)=>`ドローン：${l?`Lv.${l}`:"レベル未読"}${p?` · ${p}`:""}。主力部隊の上位ギャップを直した後に投資。`,scanMissing:l=>`${l}が未スキャンです。利用可能な全部隊を比較するため追加してください。`,actionLevel:h=>`${h}のレベルを先に上げ、再スキャンして効果を確認。`,actionStars:h=>`${h}の欠片／UR万能欠片を次の星段階まで優先。`,actionExclusive:h=>`専用武器欠片は他部隊に分散せず${h}を優先。`,actionGear:h=>`${h}の最も弱い装備から強化。`,actionDrone:"ドローン部品と戦闘データは、英雄の上位1～2ギャップを埋めるまで温存。",actionScan:"今は購入しないで、先にスキャンを完成させてください。",freeHero:"同盟／名誉／イベントショップ：UR万能欠片または対象英雄の欠片。",paidHero:"課金する場合、この優先対象の欠片が入るパックだけを選択。",freeLevel:"報酬・イベント・無料ショップ：英雄EXP。",paidLevel:"汎用パックは避け、このレベル差が主力部隊を止める場合のみEXPを購入。",freeExclusive:"イベント／ショップ：専用武器欠片。",paidExclusive:"専用武器パックは、優先英雄を直接加速し費用対効果が良い場合だけ購入し、欠片を複数英雄に分散しない。",freeGear:"名誉／イベント：強化鉱石と装備設計図。",paidGear:"装備が主ボトルネックの場合のみ装備／設計図パック。",freeDrone:"イベント／ショップ：ドローン部品／戦闘データ。",paidDrone:"上位の英雄・装備優先度の後だけドローンパック。",freeNone:"スキャン完了まで資源を使わない。",paidNone:"データ不足時は有料購入を推奨しません。",focusHold:n=>`主力部隊の優先ギャップが解消するまで${n}へ資源を分散しない。`,squadStatusMain:"主力優先",squadStatusReady:"第2優先",squadStatusLow:"温存",squadStatusMissing:"要スキャン",confidence:n=>`信頼度 ${n}%`,titles:{scan:"データ完成",level:"英雄レベル",stars:"英雄の星",exclusive:"専用武器",gear:"装備",drone:"ドローン",focus:"資源集中"}
  },
  zh:{
    main:(n,p)=>`优先把资源集中到 ${n}（${p}）。`,mainDetail:(n,p,g)=>`优先把资源集中到 ${n}（${p}）。${g}`,noSquad:"至少扫描一支队伍以启用 PRO 诊断。",needHeroes:n=>`请在5名英雄都可见的画面重新扫描 ${n}。WarBoost 需要等级、星级、专武和装备来准确排序购买。`,level:(h,g,t)=>`${h} 比队内最高英雄低 ${g} 级（已观察目标：Lv.${t}）。`,stars:(h,g)=>`${h} 距离5★还差 ${g} 星。`,exclusive:(h,g,t)=>`${h} 的专武比可见最高等级 ${t} 低 ${g} 级。`,gear:(h,g,t)=>`${h} 的装备比可见最高等级 ${t} 低 ${g} 级。`,drone:(l,p)=>`无人机：${l?`Lv.${l}`:"等级未读取"}${p?` · ${p}`:""}。先处理主队上方优先缺口，再投入无人机。`,scanMissing:l=>`${l} 尚未扫描，补齐后才能比较你账号中所有可用队伍。`,actionLevel:h=>`先提升 ${h} 的等级，然后重新扫描确认提升。`,actionStars:h=>`优先 ${h} 碎片／UR万能碎片直到下一星级。`,actionExclusive:h=>`专武碎片优先投入 ${h}，不要分散到其他队伍。`,actionGear:h=>`先强化 ${h} 最弱的装备。`,actionDrone:"保留无人机组件和战斗数据，先解决英雄前1–2个主要缺口。",actionScan:"暂时不要购买：先补全扫描，避免错误消费。",freeHero:"联盟／荣誉／活动商店：UR万能碎片或目标英雄碎片（如有）。",paidHero:"如付费，只选包含当前优先碎片的礼包。",freeLevel:"奖励、活动和免费商店：英雄EXP。",paidLevel:"避免通用礼包；仅当等级差真正卡住1队时购买EXP。",freeExclusive:"活动／商店：专武碎片。",paidExclusive:"仅当专武礼包能直接加速主力优先英雄且投入产出比合适时购买；不要把碎片分散给多个英雄。",freeGear:"荣誉／活动：强化矿石和装备蓝图。",paidGear:"仅当装备是主要瓶颈时购买装备／蓝图礼包。",freeDrone:"活动／商店：无人机组件／战斗数据。",paidDrone:"在更高优先级的英雄/装备之后再考虑无人机礼包。",freeNone:"扫描完成前不要花资源。",paidNone:"数据不完整时不建议付费购买。",focusHold:n=>`主队优先缺口解决前，不要把资源分散到 ${n}。`,squadStatusMain:"主优先",squadStatusReady:"次优先",squadStatusLow:"保留",squadStatusMissing:"需扫描",confidence:n=>`置信度 ${n}%`,titles:{scan:"补全数据",level:"英雄等级",stars:"英雄星级",exclusive:"专武",gear:"装备",drone:"无人机",focus:"资源集中"}
  },
  ar:{
    main:(n,p)=>`ركّز مواردك على ${n} (${p}).`,mainDetail:(n,p,g)=>`ركّز مواردك على ${n} (${p}). ${g}`,noSquad:"امسح فريقاً واحداً على الأقل لتفعيل تشخيص PRO.",needHeroes:n=>`أعد مسح ${n} على شاشة تظهر الأبطال الخمسة. يحتاج WarBoost إلى المستويات والنجوم والسلاح الحصري والمعدات لترتيب المشتريات بدقة.`,level:(h,g,t)=>`${h} أقل بـ ${g} مستوى من أعلى بطل في الفريق (الهدف المرصود: Lv.${t}).`,stars:(h,g)=>`${h} يحتاج ${g} نجمة للوصول إلى 5★.`,exclusive:(h,g,t)=>`السلاح الحصري لـ ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,gear:(h,g,t)=>`معدات ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,drone:(l,p)=>`الدرون: ${l?`Lv.${l}`:"المستوى غير مقروء"}${p?` · ${p}`:""}. استثمر بعد فجوات الفريق الرئيسي الأعلى.`,scanMissing:l=>`ما زال ${l} بحاجة للمسح لمقارنة كل الفرق المتاحة في حسابك.`,actionLevel:h=>`ارفع مستوى ${h} أولاً ثم أعد المسح لقياس المكسب.`,actionStars:h=>`أعطِ الأولوية لشظايا ${h} / شظايا UR العامة.`,actionExclusive:h=>`ضع شظايا السلاح الحصري في ${h} قبل توزيعها على فريق آخر.`,actionGear:h=>`طوّر أضعف معدات ${h} أولاً.`,actionDrone:"احتفظ بمكونات الدرون وبيانات القتال حتى تعالج أكبر فجوتين للأبطال.",actionScan:"لا تشترِ الآن: أكمل المسح أولاً لتجنب إنفاق خاطئ.",freeHero:"متاجر التحالف / الشرف / الأحداث: شظايا UR عامة أو شظايا البطل عند توفرها.",paidHero:"إذا دفعت، اختر فقط حزمة تحتوي شظايا هذه الأولوية.",freeLevel:"المكافآت والأحداث والمتاجر المجانية: خبرة الأبطال.",paidLevel:"تجنب الحزم العامة؛ اشترِ خبرة فقط إذا كان فرق المستوى يعيق الفريق 1.",freeExclusive:"الأحداث والمتاجر: شظايا السلاح الحصري.",paidExclusive:"اشترِ حزمة السلاح الحصري فقط إذا كانت تسرّع البطل ذي الأولوية مباشرة وكان مردود التكلفة جيداً؛ لا توزّع الشظايا على عدة أبطال.",freeGear:"الشرف / الأحداث: خامات التطوير ومخططات المعدات.",paidGear:"حزمة المعدات/المخططات فقط إذا كانت المعدات هي العائق الرئيسي.",freeDrone:"الأحداث والمتاجر: مكونات الدرون / بيانات القتال.",paidDrone:"حزمة الدرون فقط بعد الأولويات الأعلى.",freeNone:"لا تنفق قبل اكتمال المسح.",paidNone:"لا يُنصح بشراء مدفوع مع بيانات ناقصة.",focusHold:n=>`لا توزع الموارد على ${n} قبل إصلاح فجوات الفريق الرئيسي ذات الأولوية.`,squadStatusMain:"الأولوية الرئيسية",squadStatusReady:"ثانوي",squadStatusLow:"احتفاظ",squadStatusMissing:"يحتاج مسح",confidence:n=>`الثقة ${n}%`,titles:{scan:"إكمال البيانات",level:"مستوى البطل",stars:"نجوم البطل",exclusive:"السلاح الحصري",gear:"المعدات",drone:"الدرون",focus:"تركيز الموارد"}
  }
};
function heroName(h,i,lang){const n=canonicalHeroName(h?.name);if(n&&!/^(hero|héros)\s*\d+$/i.test(n))return n;return lang==="fr"?`Héros ${i+1}`:lang==="es"?`Héroe ${i+1}`:lang==="de"?`Held ${i+1}`:lang==="ja"?`英雄${i+1}`:lang==="zh"?`英雄${i+1}`:lang==="ar"?`البطل ${i+1}`:`Hero ${i+1}`}
function squadName(s,i,lang){return lang==="fr"?`Escouade ${i+1}`:lang==="es"?`Escuadrón ${i+1}`:lang==="de"?`Trupp ${i+1}`:lang==="ja"?`部隊 ${i+1}`:lang==="zh"?`队伍 ${i+1}`:lang==="ar"?`الفريق ${i+1}`:`Squad ${i+1}`}
function heroDetailCoverage(sq){
  const hs=(sq?.heroes||[]).filter(heroConfigured);if(!hs.length)return 0;
  let fields=0,total=hs.length*5;
  hs.forEach(h=>{if(num(h?.level)!==null)fields++;if(num(h?.stars)!==null)fields++;if(num(h?.power)!==null)fields++;if(cleanName(h?.exclusive))fields++;if(cleanName(h?.gear))fields++});
  return Math.round(fields/total*100);
}
function optionalSquadStatus(lang){return ({fr:"Optionnelle · à débloquer dans Last War",en:"Optional · unlockable in Last War",es:"Opcional · desbloqueable en Last War",de:"Optional · in Last War freischaltbar",ja:"任意 · Last Warで解放可能",zh:"可选 · 可在 Last War 中解锁",ar:"اختياري · يمكن فتحه في Last War"})[lang]||"Optional · unlockable in Last War"}

function squadTypeFromHeroes(heroes){const c={aircraft:0,tank:0,missile:0};for(const x of heroes){const t=heroType(x?.h?.name||x?.name);if(t)c[t]++}return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[1]>=3?Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]:null}
const AIR_EX_TO20={DVA:100,Lucius:97,Skyler:95,Morrison:93,Carlie:80};
const AIR_EX_TO30={DVA:100,Lucius:96,Morrison:91,Skyler:89,Carlie:76};
function exPriorityWeight(name,type,target){if(type==="aircraft")return (target<=20?AIR_EX_TO20:AIR_EX_TO30)[name]||75;if(type==="tank")return ({Kimberly:100,Murphy:95,Marshall:88}[name]||78);if(type==="missile")return ({Tesla:100,Fiona:94,McGregor:88,Adam:84,Swift:80}[name]||78);return 80}
const KNOWN_EX_BREAKPOINTS=[10,20,30];
function nextKnownExBreakpoint(v){const n=num(v);if(n===null||n<0)return null;return KNOWN_EX_BREAKPOINTS.find(x=>n<x)??null}
function exTargetLabel(x){const c=num(x?.exclusive),t=num(x?.next_breakpoint);if(!cleanName(x?.name)||c===null||t===null)return cleanName(x?.name)||"";return `${cleanName(x.name)} EX${c} → EX${t}`}
function exPriorityScore(name,type,current,target){
  // V2.3.2: compare the marginal value of the NEXT breakpoint, not the raw EX gap.
  // In S6-style progression, EX20 is deliberately favored over rushing one hero to EX30,
  // while EX10 remains useful but no longer automatically beats a well-positioned EX10→20 move.
  const base=exPriorityWeight(name,type,target);
  const stageBonus=target===20?18:target===10?4:target===30?-12:0;
  const gap=Math.max(0,target-current);
  const closeness=Math.max(0,10-gap)*.7;
  const investedBonus=current>=10&&target===20?5:0;
  return base+stageBonus+closeness+investedBonus;
}
const EX_TEXT={
fr:(h,c,t)=>`${h} est à EX${c}. Le prochain palier efficace est EX${t} ; WarBoost privilégie les paliers 10/20/30 plutôt qu'un simple égalisage de niveaux.`,
en:(h,c,t)=>`${h} is at EX${c}. The next efficient breakpoint is EX${t}; WarBoost prioritizes 10/20/30 breakpoints rather than simple level matching.`,
es:(h,c,t)=>`${h} está en EX${c}. El siguiente punto eficiente es EX${t}; WarBoost prioriza los hitos 10/20/30 en lugar de igualar niveles.`,
de:(h,c,t)=>`${h} ist auf EX${c}. Der nächste effiziente Meilenstein ist EX${t}; WarBoost priorisiert 10/20/30 statt reines Angleichen.`,
ja:(h,c,t)=>`${h} は EX${c}。次の効率的な節目は EX${t}。WarBoost は単純な均等化より 10/20/30 の節目を優先します。`,
zh:(h,c,t)=>`${h} 当前 EX${c}。下一个高效节点是 EX${t}；WarBoost 优先 10/20/30 节点，而不是简单拉平等级。`,
ar:(h,c,t)=>`${h} عند EX${c}. نقطة الكفاءة التالية هي EX${t}؛ يعطي WarBoost الأولوية لمراحل 10/20/30 بدلاً من مساواة المستويات فقط.`};
function exReason(locale,h,c,t){return (EX_TEXT[localePack(locale)]||EX_TEXT.en)(h,c,t)}
const AWAKENING_TEXT={
  fr:{title:"Éveil / Reshape",ready:(h)=>`${h} remplit les prérequis visibles d'Éveil S6. Compare son gain marginal aux EX, équipements, technologie et Drone avant de dépenser.`,unknown:(h)=>`${h} est éligible à l'Éveil S6 mais les fragments d'Éveil nominatifs ne sont pas confirmés. Scanne l'écran Éveil avant toute dépense.`,shards:(h,n)=>`${h} a ${n} fragment${n>1?"s":""} d'Éveil nominatif${n>1?"s":""} visible${n>1?"s":""} ; le seuil d'ouverture observé est 50.`,action:(h)=>`Priorise l'Éveil de ${h} uniquement si son gain marginal dépasse les autres goulots du compte.`,free:"Événements/Saison : fragments d'Éveil du héros, si disponibles.",paid:"Pack Éveil uniquement pour le héros prioritaire et seulement si le gain calculé justifie le coût.",gateEx:(h)=>`${h} doit atteindre EX20 avant l'Éveil : ce palier EX devient un goulot de déblocage.`,gateStars:(h)=>`${h} doit atteindre 5★ avant l'Éveil : les étoiles deviennent un goulot de déblocage.`,mono:n=>`Bonus de formation mono-type détecté : +${n}% PV/ATQ/DEF.`,hybrid:"Composition hybride : WarBoost applique une pénalité prudente tant qu'une synergie mesurée ne justifie pas le mélange."},
  en:{title:"Awakening / Reshape",ready:(h)=>`${h} meets the visible S6 Awakening gates. Compare its marginal gain with EX, gear, technology and Drone before spending.`,unknown:(h)=>`${h} is S6-Awakening eligible but named Awakening shards are not confirmed. Scan the Awakening screen before spending.`,shards:(h,n)=>`${h} has ${n} visible named Awakening shard${n===1?"":"s"}; the observed unlock threshold is 50.`,action:(h)=>`Prioritize ${h}'s Awakening only when its marginal gain beats the account's other bottlenecks.`,free:"Season/events: hero-specific Awakening shards when available.",paid:"Buy an Awakening pack only for the priority hero and only when calculated gain justifies cost.",gateEx:(h)=>`${h} must reach EX20 before Awakening; this EX breakpoint becomes an unlock bottleneck.`,gateStars:(h)=>`${h} must reach 5★ before Awakening; stars become an unlock bottleneck.`,mono:n=>`Mono-type formation bonus detected: +${n}% HP/ATK/DEF.`,hybrid:"Hybrid composition: WarBoost applies a cautious penalty unless measured synergy justifies the mix."},
  es:{title:"Despertar / Reshape",ready:h=>`${h} cumple los requisitos visibles del Despertar S6. Compara su ganancia marginal con EX, equipo, tecnología y Dron antes de gastar.`,unknown:h=>`${h} puede Despertar en S6, pero no se confirmaron sus fragmentos de Despertar. Escanea esa pantalla antes de gastar.`,shards:(h,n)=>`${h} tiene ${n} fragmento(s) de Despertar nominativo(s) visibles; el umbral observado es 50.`,action:h=>`Prioriza el Despertar de ${h} solo si su ganancia marginal supera los otros cuellos de botella.`,free:"Temporada/eventos: fragmentos de Despertar del héroe, si aparecen.",paid:"Pack de Despertar solo para el héroe prioritario si el beneficio calculado justifica el coste.",gateEx:h=>`${h} debe llegar a EX20 antes del Despertar.`,gateStars:h=>`${h} debe llegar a 5★ antes del Despertar.`,mono:n=>`Bono de formación monotipo detectado: +${n}% PV/ATQ/DEF.`,hybrid:"Composición híbrida: WarBoost aplica una penalización prudente salvo sinergia medida."},
  de:{title:"Erweckung / Reshape",ready:h=>`${h} erfüllt die sichtbaren S6-Erweckungsbedingungen. Vergleiche den Grenznutzen mit EX, Ausrüstung, Technik und Drohne.`,unknown:h=>`${h} ist S6-erweckungsfähig, aber namensgebundene Erweckungssplitter sind nicht bestätigt.`,shards:(h,n)=>`${h} hat ${n} sichtbare namensgebundene Erweckungssplitter; beobachtete Freischaltschwelle: 50.`,action:h=>`Erweckung von ${h} nur priorisieren, wenn der Grenznutzen andere Engpässe schlägt.`,free:"Saison/Events: heldenspezifische Erweckungssplitter, falls verfügbar.",paid:"Erweckungspaket nur für den Prioritätshelden bei ausreichendem berechnetem Nutzen.",gateEx:h=>`${h} benötigt EX20 vor der Erweckung.`,gateStars:h=>`${h} benötigt 5★ vor der Erweckung.`,mono:n=>`Mono-Typ-Formationsbonus erkannt: +${n}% HP/ATK/DEF.`,hybrid:"Hybridformation: vorsichtige Abwertung ohne gemessene Synergie."},
  ja:{title:"覚醒 / Reshape",ready:h=>`${h} はS6覚醒の表示条件を満たしています。EX・装備・技術・ドローンとの限界利益を比較します。`,unknown:h=>`${h} はS6覚醒対象ですが専用覚醒欠片が未確認です。覚醒画面をスキャンしてください。`,shards:(h,n)=>`${h} の専用覚醒欠片は表示上${n}個。確認済み解放目安は50。`,action:h=>`${h} の覚醒は他のボトルネックより限界利益が高い場合のみ優先。`,free:"シーズン/イベント：対象英雄の覚醒欠片（表示時）。",paid:"覚醒パックは優先英雄かつ計算上の利益が費用を上回る場合のみ。",gateEx:h=>`${h} は覚醒前にEX20が必要です。`,gateStars:h=>`${h} は覚醒前に5★が必要です。`,mono:n=>`単一兵種編成ボーナス検出：HP/ATK/DEF +${n}%。`,hybrid:"混成編成：測定済みシナジーがない限り慎重な減点を適用。"},
  zh:{title:"觉醒 / Reshape",ready:h=>`${h} 满足可见的S6觉醒门槛。花费前比较觉醒与EX、装备、科技和无人机的边际收益。`,unknown:h=>`${h} 可进行S6觉醒，但专属觉醒碎片未确认。请先扫描觉醒页面。`,shards:(h,n)=>`${h} 可见专属觉醒碎片 ${n}；已观察到的解锁门槛为50。`,action:h=>`仅当${h}觉醒的边际收益高于其他瓶颈时优先。`,free:"赛季/活动：英雄专属觉醒碎片（若出现）。",paid:"仅为优先英雄购买觉醒礼包，且计算收益必须值得成本。",gateEx:h=>`${h} 觉醒前必须达到EX20。`,gateStars:h=>`${h} 觉醒前必须达到5★。`,mono:n=>`检测到同兵种编队加成：生命/攻击/防御 +${n}%。`,hybrid:"混合编队：若无实测协同，WarBoost默认谨慎降权。"},
  ar:{title:"الإيقاظ / Reshape",ready:h=>`${h} يحقق شروط إيقاظ S6 الظاهرة. قارن العائد الهامشي مع EX والمعدات والتقنية والدرون قبل الإنفاق.`,unknown:h=>`${h} مؤهل لإيقاظ S6 لكن شظايا الإيقاظ الخاصة غير مؤكدة. امسح شاشة الإيقاظ أولاً.`,shards:(h,n)=>`${h} لديه ${n} من شظايا الإيقاظ الخاصة الظاهرة؛ عتبة الفتح المرصودة 50.`,action:h=>`أعطِ إيقاظ ${h} الأولوية فقط إذا تجاوز عائده الهامشي بقية الاختناقات.`,free:"الموسم/الأحداث: شظايا إيقاظ البطل عند توفرها.",paid:"حزمة إيقاظ للبطل ذي الأولوية فقط إذا برر العائد المحسوب التكلفة.",gateEx:h=>`${h} يحتاج EX20 قبل الإيقاظ.`,gateStars:h=>`${h} يحتاج 5★ قبل الإيقاظ.`,mono:n=>`تم رصد مكافأة تشكيل أحادي النوع: +${n}% HP/ATK/DEF.`,hybrid:"التشكيل الهجين: تخفيض حذر ما لم تثبت فائدة مقاسة."}
};
Object.assign(AWAKENING_TEXT,{
  it:{title:"Risveglio / Reshape",ready:h=>`${h} soddisfa i requisiti visibili del Risveglio S6. Confronta il guadagno marginale con EX, equipaggiamento, tecnologia e Drone.`,unknown:h=>`${h} è idoneo al Risveglio S6, ma i frammenti nominativi non sono confermati. Scansiona la schermata Risveglio.`,shards:(h,n)=>`${h}: ${n} frammenti nominativi di Risveglio visibili; soglia osservata 50.`,action:h=>`Dai priorità al Risveglio di ${h} solo se il guadagno marginale supera gli altri colli di bottiglia.`,free:"Stagione/eventi: frammenti Risveglio specifici dell'eroe, se disponibili.",paid:"Pacchetto Risveglio solo per l'eroe prioritario se il guadagno calcolato giustifica il costo.",gateEx:h=>`${h} deve raggiungere EX20 prima del Risveglio.`,gateStars:h=>`${h} deve raggiungere 5★ prima del Risveglio.`,mono:n=>`Bonus formazione mono-tipo rilevato: +${n}% HP/ATK/DEF.`,hybrid:"Formazione ibrida: penalità prudente senza sinergia misurata."},
  pt:{title:"Despertar / Reshape",ready:h=>`${h} cumpre os requisitos visíveis do Despertar S6. Compara o ganho marginal com EX, equipamento, tecnologia e Drone.`,unknown:h=>`${h} é elegível para o Despertar S6, mas os fragmentos específicos não estão confirmados. Digitaliza o ecrã de Despertar.`,shards:(h,n)=>`${h}: ${n} fragmentos específicos de Despertar visíveis; limite observado 50.`,action:h=>`Prioriza o Despertar de ${h} apenas se o ganho marginal superar os outros gargalos.`,free:"Temporada/eventos: fragmentos de Despertar do herói, se disponíveis.",paid:"Pacote de Despertar apenas para o herói prioritário se o ganho calculado justificar o custo.",gateEx:h=>`${h} precisa de EX20 antes do Despertar.`,gateStars:h=>`${h} precisa de 5★ antes do Despertar.`,mono:n=>`Bónus de formação mono-tipo detetado: +${n}% HP/ATK/DEF.`,hybrid:"Formação híbrida: penalização prudente sem sinergia medida."},
  nl:{title:"Awakening / Reshape",ready:h=>`${h} voldoet aan de zichtbare S6-Awakeningvoorwaarden. Vergelijk marginale winst met EX, uitrusting, technologie en Drone.`,unknown:h=>`${h} is geschikt voor S6 Awakening, maar heldspecifieke Awakening-scherven zijn niet bevestigd. Scan het Awakening-scherm.`,shards:(h,n)=>`${h}: ${n} zichtbare heldspecifieke Awakening-scherven; waargenomen drempel 50.`,action:h=>`Geef ${h} Awakening alleen voorrang als de marginale winst andere knelpunten overtreft.`,free:"Seizoen/events: heldspecifieke Awakening-scherven indien beschikbaar.",paid:"Awakening-pakket alleen voor de prioriteitsheld als de berekende winst de kosten rechtvaardigt.",gateEx:h=>`${h} moet EX20 bereiken vóór Awakening.`,gateStars:h=>`${h} moet 5★ bereiken vóór Awakening.`,mono:n=>`Mono-type formatiesbonus gedetecteerd: +${n}% HP/ATK/DEF.`,hybrid:"Hybride formatie: voorzichtige straf zonder gemeten synergie."},
  ru:{title:"Пробуждение / Reshape",ready:h=>`${h} выполняет видимые условия Пробуждения S6. Сравнивайте предельную выгоду с EX, экипировкой, технологиями и Дроном.`,unknown:h=>`${h} подходит для Пробуждения S6, но именные осколки не подтверждены. Просканируйте экран Пробуждения.`,shards:(h,n)=>`${h}: видно ${n} именных осколков Пробуждения; наблюдаемый порог 50.`,action:h=>`Приоритет Пробуждению ${h} только если предельная выгода выше других узких мест.`,free:"Сезон/события: именные осколки Пробуждения героя, если доступны.",paid:"Пакет Пробуждения только для приоритетного героя, если расчётная выгода оправдывает цену.",gateEx:h=>`${h} должен достичь EX20 до Пробуждения.`,gateStars:h=>`${h} должен достичь 5★ до Пробуждения.`,mono:n=>`Обнаружен бонус однотипного строя: +${n}% HP/ATK/DEF.`,hybrid:"Смешанный строй: осторожное снижение без измеренной синергии."},
  pl:{title:"Przebudzenie / Reshape",ready:h=>`${h} spełnia widoczne warunki Przebudzenia S6. Porównaj zysk krańcowy z EX, wyposażeniem, technologią i Dronem.`,unknown:h=>`${h} kwalifikuje się do Przebudzenia S6, ale dedykowane odłamki nie są potwierdzone. Zeskanuj ekran Przebudzenia.`,shards:(h,n)=>`${h}: widoczne dedykowane odłamki Przebudzenia ${n}; zaobserwowany próg 50.`,action:h=>`Priorytet Przebudzenia ${h} tylko wtedy, gdy zysk krańcowy przewyższa inne wąskie gardła.`,free:"Sezon/wydarzenia: dedykowane odłamki Przebudzenia bohatera, jeśli dostępne.",paid:"Pakiet Przebudzenia tylko dla priorytetowego bohatera, gdy obliczony zysk uzasadnia koszt.",gateEx:h=>`${h} musi osiągnąć EX20 przed Przebudzeniem.`,gateStars:h=>`${h} musi osiągnąć 5★ przed Przebudzeniem.`,mono:n=>`Wykryto bonus formacji jednego typu: +${n}% HP/ATK/DEF.`,hybrid:"Formacja hybrydowa: ostrożna kara bez zmierzonej synergii."},
  tr:{title:"Uyanış / Reshape",ready:h=>`${h} görünür S6 Uyanış koşullarını karşılıyor. Marjinal kazancı EX, ekipman, teknoloji ve Drone ile karşılaştır.`,unknown:h=>`${h} S6 Uyanışına uygun ancak kahramana özel Uyanış parçaları doğrulanmadı. Uyanış ekranını tara.`,shards:(h,n)=>`${h}: ${n} görünür kahramana özel Uyanış parçası; gözlenen eşik 50.`,action:h=>`${h} Uyanışına yalnızca marjinal kazanç diğer darboğazları geçerse öncelik ver.`,free:"Sezon/etkinlik: varsa kahramana özel Uyanış parçaları.",paid:"Uyanış paketi yalnızca öncelikli kahraman için ve hesaplanan kazanç maliyeti haklı çıkarıyorsa.",gateEx:h=>`${h}, Uyanıştan önce EX20'ye ulaşmalı.`,gateStars:h=>`${h}, Uyanıştan önce 5★ olmalı.`,mono:n=>`Tek tip formasyon bonusu algılandı: +${n}% HP/ATK/DEF.`,hybrid:"Hibrit formasyon: ölçülmüş sinerji yoksa temkinli ceza."},
  ko:{title:"각성 / Reshape",ready:h=>`${h}가 표시된 S6 각성 조건을 충족합니다. EX·장비·기술·드론과 한계 이득을 비교합니다.`,unknown:h=>`${h}는 S6 각성 대상이지만 전용 각성 조각이 확인되지 않았습니다. 각성 화면을 스캔하세요.`,shards:(h,n)=>`${h}: 전용 각성 조각 ${n}개 표시, 관찰된 해금 기준 50개.`,action:h=>`${h} 각성의 한계 이득이 다른 병목보다 클 때만 우선합니다.`,free:"시즌/이벤트: 표시되는 경우 영웅 전용 각성 조각.",paid:"계산 이득이 비용을 정당화할 때 우선 영웅용 각성 팩만 구매.",gateEx:h=>`${h}는 각성 전 EX20이 필요합니다.`,gateStars:h=>`${h}는 각성 전 5★가 필요합니다.`,mono:n=>`단일 병종 편성 보너스 감지: HP/ATK/DEF +${n}%.`,hybrid:"혼합 편성: 측정된 시너지가 없으면 보수적으로 감점."},
  vi:{title:"Thức tỉnh / Reshape",ready:h=>`${h} đáp ứng các điều kiện Thức tỉnh S6 nhìn thấy. So sánh lợi ích biên với EX, trang bị, công nghệ và Drone.`,unknown:h=>`${h} đủ điều kiện Thức tỉnh S6 nhưng mảnh Thức tỉnh riêng chưa được xác nhận. Hãy quét màn hình Thức tỉnh.`,shards:(h,n)=>`${h}: thấy ${n} mảnh Thức tỉnh riêng; ngưỡng quan sát 50.`,action:h=>`Chỉ ưu tiên Thức tỉnh ${h} khi lợi ích biên vượt các nút thắt khác.`,free:"Mùa/sự kiện: mảnh Thức tỉnh riêng của anh hùng nếu có.",paid:"Chỉ mua gói Thức tỉnh cho anh hùng ưu tiên khi lợi ích tính toán xứng đáng chi phí.",gateEx:h=>`${h} phải đạt EX20 trước Thức tỉnh.`,gateStars:h=>`${h} phải đạt 5★ trước Thức tỉnh.`,mono:n=>`Phát hiện thưởng đội hình cùng loại: +${n}% HP/ATK/DEF.`,hybrid:"Đội hình lai: giảm điểm thận trọng nếu chưa có hiệp lực đo được."},
  th:{title:"ปลุกพลัง / Reshape",ready:h=>`${h} ผ่านเงื่อนไขปลุกพลัง S6 ที่มองเห็น เปรียบเทียบผลตอบแทนส่วนเพิ่มกับ EX อุปกรณ์ เทคโนโลยี และโดรน`,unknown:h=>`${h} มีสิทธิ์ปลุกพลัง S6 แต่ยังไม่ยืนยันชิ้นส่วนเฉพาะฮีโร่ กรุณาสแกนหน้าปลุกพลัง`,shards:(h,n)=>`${h}: เห็นชิ้นส่วนปลุกพลังเฉพาะ ${n} ชิ้น; เกณฑ์ที่สังเกตได้ 50`,action:h=>`ให้ความสำคัญกับการปลุกพลัง ${h} เมื่อผลตอบแทนส่วนเพิ่มสูงกว่าคอขวดอื่นเท่านั้น`,free:"ซีซัน/อีเวนต์: ชิ้นส่วนปลุกพลังเฉพาะฮีโร่เมื่อมี",paid:"ซื้อแพ็กปลุกพลังเฉพาะฮีโร่เป้าหมายเมื่อผลตอบแทนที่คำนวณคุ้มค่า",gateEx:h=>`${h} ต้องถึง EX20 ก่อนปลุกพลัง`,gateStars:h=>`${h} ต้องถึง 5★ ก่อนปลุกพลัง`,mono:n=>`ตรวจพบโบนัสทีมประเภทเดียว: +${n}% HP/ATK/DEF`,hybrid:"ทีมผสม: ลดคะแนนอย่างระมัดระวังหากไม่มีซินเนอร์จีที่วัดได้"},
  id:{title:"Awakening / Reshape",ready:h=>`${h} memenuhi syarat Awakening S6 yang terlihat. Bandingkan keuntungan marginal dengan EX, perlengkapan, teknologi, dan Drone.`,unknown:h=>`${h} memenuhi syarat Awakening S6 tetapi shard khusus belum dikonfirmasi. Pindai layar Awakening.`,shards:(h,n)=>`${h}: ${n} shard Awakening khusus terlihat; ambang yang diamati 50.`,action:h=>`Prioritaskan Awakening ${h} hanya jika keuntungan marginal mengalahkan hambatan lain.`,free:"Musim/event: shard Awakening khusus hero jika tersedia.",paid:"Paket Awakening hanya untuk hero prioritas bila keuntungan terhitung membenarkan biaya.",gateEx:h=>`${h} harus mencapai EX20 sebelum Awakening.`,gateStars:h=>`${h} harus mencapai 5★ sebelum Awakening.`,mono:n=>`Bonus formasi satu tipe terdeteksi: +${n}% HP/ATK/DEF.`,hybrid:"Formasi campuran: penalti hati-hati tanpa sinergi terukur."},
  uk:{title:"Пробудження / Reshape",ready:h=>`${h} виконує видимі умови Пробудження S6. Порівняй граничну вигоду з EX, спорядженням, технологіями та Дроном.`,unknown:h=>`${h} підходить для Пробудження S6, але іменні уламки не підтверджені. Проскануй екран Пробудження.`,shards:(h,n)=>`${h}: видно ${n} іменних уламків Пробудження; спостережуваний поріг 50.`,action:h=>`Пріоритет Пробудженню ${h} лише якщо гранична вигода перевищує інші вузькі місця.`,free:"Сезон/події: іменні уламки Пробудження героя, якщо доступні.",paid:"Пакет Пробудження лише для пріоритетного героя, якщо розрахована вигода виправдовує вартість.",gateEx:h=>`${h} має досягти EX20 до Пробудження.`,gateStars:h=>`${h} має досягти 5★ до Пробудження.`,mono:n=>`Виявлено бонус однотипної формації: +${n}% HP/ATK/DEF.`,hybrid:"Гібридна формація: обережне зниження без виміряної синергії."},
  ro:{title:"Trezire / Reshape",ready:h=>`${h} îndeplinește condițiile vizibile de Trezire S6. Compară câștigul marginal cu EX, echipament, tehnologie și Dronă.`,unknown:h=>`${h} este eligibil pentru Trezirea S6, dar fragmentele specifice nu sunt confirmate. Scanează ecranul Trezire.`,shards:(h,n)=>`${h}: ${n} fragmente specifice de Trezire vizibile; prag observat 50.`,action:h=>`Prioritizează Trezirea lui ${h} doar dacă avantajul marginal depășește celelalte blocaje.`,free:"Sezon/evenimente: fragmente Trezire specifice eroului, dacă sunt disponibile.",paid:"Pachet Trezire doar pentru eroul prioritar dacă avantajul calculat justifică prețul.",gateEx:h=>`${h} trebuie să ajungă la EX20 înainte de Trezire.`,gateStars:h=>`${h} trebuie să ajungă la 5★ înainte de Trezire.`,mono:n=>`Bonus formație mono-tip detectat: +${n}% HP/ATK/DEF.`,hybrid:"Formație hibridă: penalizare prudentă fără sinergie măsurată."},
  el:{title:"Αφύπνιση / Reshape",ready:h=>`${h} πληροί τις ορατές προϋποθέσεις Αφύπνισης S6. Σύγκρινε το οριακό κέρδος με EX, εξοπλισμό, τεχνολογία και Drone.`,unknown:h=>`${h} είναι επιλέξιμος για Αφύπνιση S6, αλλά τα ειδικά θραύσματα δεν επιβεβαιώθηκαν. Σάρωσε την οθόνη Αφύπνισης.`,shards:(h,n)=>`${h}: ${n} ορατά ειδικά θραύσματα Αφύπνισης· παρατηρημένο όριο 50.`,action:h=>`Δώσε προτεραιότητα στην Αφύπνιση του ${h} μόνο αν το οριακό κέρδος ξεπερνά τα άλλα σημεία συμφόρησης.`,free:"Σεζόν/γεγονότα: ειδικά θραύσματα Αφύπνισης ήρωα, αν υπάρχουν.",paid:"Πακέτο Αφύπνισης μόνο για τον ήρωα προτεραιότητας όταν το υπολογισμένο κέρδος δικαιολογεί το κόστος.",gateEx:h=>`${h} χρειάζεται EX20 πριν την Αφύπνιση.`,gateStars:h=>`${h} χρειάζεται 5★ πριν την Αφύπνιση.`,mono:n=>`Εντοπίστηκε μπόνους μονοτύπου: +${n}% HP/ATK/DEF.`,hybrid:"Υβριδική σύνθεση: προσεκτική ποινή χωρίς μετρημένη συνέργεια."},
  cs:{title:"Probuzení / Reshape",ready:h=>`${h} splňuje viditelné podmínky Probuzení S6. Porovnej mezní přínos s EX, výbavou, technologií a Dronem.`,unknown:h=>`${h} je způsobilý pro Probuzení S6, ale specifické střepy nejsou potvrzeny. Naskenuj obrazovku Probuzení.`,shards:(h,n)=>`${h}: viditelných specifických střepů Probuzení ${n}; pozorovaný práh 50.`,action:h=>`Upřednostni Probuzení ${h} jen pokud mezní přínos překoná ostatní úzká místa.`,free:"Sezóna/události: specifické střepy Probuzení hrdiny, pokud jsou dostupné.",paid:"Balíček Probuzení pouze pro prioritního hrdinu, pokud vypočtený přínos ospravedlní cenu.",gateEx:h=>`${h} musí dosáhnout EX20 před Probuzením.`,gateStars:h=>`${h} musí dosáhnout 5★ před Probuzením.`,mono:n=>`Zjištěn bonus formace jednoho typu: +${n}% HP/ATK/DEF.`,hybrid:"Hybridní sestava: opatrná penalizace bez změřené synergie."},
  sv:{title:"Awakening / Reshape",ready:h=>`${h} uppfyller de synliga S6 Awakening-kraven. Jämför marginalnyttan med EX, utrustning, teknik och Drönare.`,unknown:h=>`${h} är berättigad till S6 Awakening men hjältespecifika skärvor är inte bekräftade. Skanna Awakening-skärmen.`,shards:(h,n)=>`${h}: ${n} synliga hjältespecifika Awakening-skärvor; observerad tröskel 50.`,action:h=>`Prioritera ${h}s Awakening bara om marginalnyttan slår övriga flaskhalsar.`,free:"Säsong/event: hjältespecifika Awakening-skärvor om tillgängliga.",paid:"Awakening-paket endast för prioritetshjälten om beräknad nytta motiverar kostnaden.",gateEx:h=>`${h} måste nå EX20 före Awakening.`,gateStars:h=>`${h} måste nå 5★ före Awakening.`,mono:n=>`Bonus för formation av en typ upptäckt: +${n}% HP/ATK/DEF.`,hybrid:"Hybridformation: försiktig nedvärdering utan uppmätt synergi."}
});
function awakeningText(locale){return AWAKENING_TEXT[shopLocaleKey(locale)]||AWAKENING_TEXT.en}
function dataConfidence(squads,drone){
  let score=0,max=0;
  squads.forEach((s,i)=>{if(i===3&&!squadConfigured(s))return;max+=20;if(s?.needs_rescan===true){score+=Math.min(5,heroDetailCoverage(s)/100*5);return}if(squadConfigured(s))score+=5;if(num(s?.power)!==null)score+=5;const c=heroDetailCoverage(s);score+=c/100*10});
  max+=20;if(num(drone?.level)!==null)score+=10;if(num(drone?.power_m)!==null)score+=10;
  return max?Math.max(0,Math.min(100,Math.round(score/max*100))):0;
}
function priority(kind,title,reason,action,buyFree,buyPaid,severity,target){return {kind,title,reason,action,buy_free:buyFree,buy_paid:buyPaid,severity:Math.round(severity),target}}
function impactLabel(score,lang){const x=Math.round(score);const pack={fr:["Modéré","Élevé","Très élevé"],en:["Moderate","High","Very high"],es:["Moderado","Alto","Muy alto"],de:["Mittel","Hoch","Sehr hoch"],ja:["中","高","非常に高い"],zh:["中","高","很高"],ar:["متوسط","مرتفع","مرتفع جداً"]}[lang]||["Moderate","High","Very high"];return x>=88?pack[2]:x>=74?pack[1]:pack[0]}
function roiLabel(score,lang){const x=Math.round(score);const pack={fr:["Moyenne","Bonne","Excellente"],en:["Average","Good","Excellent"],es:["Media","Buena","Excelente"],de:["Mittel","Gut","Sehr gut"],ja:["普通","良い","非常に良い"],zh:["一般","良好","优秀"],ar:["متوسطة","جيدة","ممتازة"]}[lang]||["Average","Good","Excellent"];return x>=86?pack[2]:x>=72?pack[1]:pack[0]}
function resourceFamily(kind){return ({scan:"data",level:"hero_xp",stars:"hero_shards",exclusive:"exclusive_weapon_shards",awakening:"awakening_shards",gear:"gear_materials",drone:"drone_components",technology:"technology_materials"})[kind]||"other"}
function costBand(cost){return cost<=.7?"low":cost<=1.05?"medium":cost<=1.4?"high":"very_high"}
function timingAdjustment(kind,state,meta={}){
  const day=Number(state?.vs?.day);let x=0;
  const heroLane=["level","stars","exclusive","awakening"].includes(kind);
  if(day===4&&heroLane)x+=9;
  else if(day>=1&&day<=6&&heroLane)x-=2;
  if(day===1&&kind==="drone")x+=9;
  else if(day>=1&&day<=6&&kind==="drone")x-=2;
  if(day===3&&kind==="technology")x+=9;
  else if(day>=1&&day<=6&&kind==="technology")x-=2;
  const seasonActive=seasonIsActive(state?.season||{}),sd=seasonActive?num(state?.season?.day):null,st=seasonActive?num(state?.season?.total_days):null;
  const late=sd!==null&&st!==null&&st>0&&sd/st>=.8;
  if(late&&kind==="exclusive"&&Number(meta?.breakpoint)===30)x-=3;
  if(late&&["level","stars","gear"].includes(kind))x+=1;
  return x
}
const VS_TIMING_TEXT={
  fr:{scan:"À faire maintenant : les données débloquent un diagnostic fiable.",heroNow:"Bon timing : le jour VS 4 valorise les améliorations héros.",heroBefore:d=>`Si ton objectif est le VS, conserve cette ressource pour le jour 4 de ce cycle (actuellement jour ${d}).`,heroAfter:d=>`Le jour VS 4 est déjà passé dans ce cycle (actuellement jour ${d}). Si le VS est prioritaire, garde cette ressource pour le prochain jour 4, sauf si la Saison ou le goulot du compte offre un meilleur ROI maintenant.`,droneNow:"Bon timing : le jour VS 1 valorise le Drone.",droneAfter:d=>`Le jour VS 1 est déjà passé dans ce cycle (actuellement jour ${d}). Si le VS est prioritaire, garde les composants Drone pour le prochain jour 1, sauf si la Saison ou le goulot du compte offre un meilleur ROI maintenant.`,late:"Fin de saison : valide le retour immédiat avant un investissement EX30 coûteux.",neutral:"Timing neutre : décide surtout selon le ROI et le goulot du compte."},
  en:{scan:"Do now: better data unlocks a reliable diagnosis.",heroNow:"Good timing: VS Day 4 rewards hero upgrades.",heroBefore:d=>`If VS is the priority, hold this resource for Day 4 of this cycle (currently Day ${d}).`,heroAfter:d=>`VS Day 4 has already passed in this cycle (currently Day ${d}). If VS is the priority, keep this resource for the next Day 4 unless Season timing or the account bottleneck offers materially better ROI now.`,droneNow:"Good timing: VS Day 1 rewards Drone progress.",droneAfter:d=>`VS Day 1 has already passed in this cycle (currently Day ${d}). If VS is the priority, keep Drone components for the next Day 1 unless Season timing or the account bottleneck offers materially better ROI now.`,late:"Late season: confirm near-term payback before a costly EX30 investment.",neutral:"Neutral timing: decide mainly from ROI and the account bottleneck."},
  es:{scan:"Hazlo ahora: mejores datos permiten un diagnóstico fiable.",heroNow:"Buen momento: el Día 4 de VS premia las mejoras de héroes.",heroBefore:d=>`Si el VS es la prioridad, guarda este recurso para el Día 4 de este ciclo (ahora Día ${d}).`,heroAfter:d=>`El Día 4 de VS ya pasó en este ciclo (ahora Día ${d}). Si el VS es la prioridad, guarda este recurso para el próximo Día 4, salvo que la Temporada o el cuello de botella de la cuenta ofrezcan un ROI claramente mejor ahora.`,droneNow:"Buen momento: el Día 1 de VS premia el progreso del Dron.",droneAfter:d=>`El Día 1 de VS ya pasó en este ciclo (ahora Día ${d}). Si el VS es la prioridad, guarda los componentes de Dron para el próximo Día 1, salvo que la Temporada o el cuello de botella ofrezcan un ROI claramente mejor ahora.`,late:"Final de temporada: valida el retorno a corto plazo antes de una inversión EX30 costosa.",neutral:"Timing neutro: decide sobre todo según ROI y cuello de botella."},
  de:{scan:"Jetzt ausführen: bessere Daten ermöglichen eine verlässliche Diagnose.",heroNow:"Gutes Timing: VS-Tag 4 belohnt Helden-Upgrades.",heroBefore:d=>`Wenn VS Priorität hat, halte diese Ressource bis Tag 4 dieses Zyklus zurück (aktuell Tag ${d}).`,heroAfter:d=>`VS-Tag 4 ist in diesem Zyklus bereits vorbei (aktuell Tag ${d}). Wenn VS Priorität hat, halte die Ressource bis zum nächsten Tag 4 zurück, außer Saison-Timing oder Kontengpass bieten jetzt deutlich besseren ROI.`,droneNow:"Gutes Timing: VS-Tag 1 belohnt Drohnen-Fortschritt.",droneAfter:d=>`VS-Tag 1 ist in diesem Zyklus bereits vorbei (aktuell Tag ${d}). Wenn VS Priorität hat, halte Drohnen-Komponenten bis zum nächsten Tag 1 zurück, außer Saison-Timing oder Kontengpass bieten jetzt deutlich besseren ROI.`,late:"Späte Saison: kurzfristigen Nutzen vor einer teuren EX30-Investition prüfen.",neutral:"Neutrales Timing: vor allem nach ROI und Kontengpass entscheiden."},
  ja:{scan:"今すぐ実行：データ精度を上げると診断の信頼性が上がります。",heroNow:"好タイミング：VS 4日目は英雄強化の価値が高い日です。",heroBefore:d=>`VSを優先するなら、このサイクルの4日目まで資源を温存してください（現在${d}日目）。`,heroAfter:d=>`このサイクルのVS 4日目はすでに終了しています（現在${d}日目）。VS優先なら次回の4日目まで温存し、シーズンやアカウントのボトルネックで今すぐ明確に高いROIが得られる場合だけ例外にします。`,droneNow:"好タイミング：VS 1日目はドローン強化の価値が高い日です。",droneAfter:d=>`このサイクルのVS 1日目はすでに終了しています（現在${d}日目）。VS優先なら次回の1日目までドローン部品を温存し、今すぐ明確に高いROIがある場合だけ例外にします。`,late:"シーズン終盤：高コストなEX30投資前に短期回収を確認してください。",neutral:"タイミングは中立：ROIとアカウントのボトルネックを優先して判断。"},
  zh:{scan:"现在执行：更完整的数据能提高诊断可靠性。",heroNow:"时机良好：VS第4天更适合英雄强化。",heroBefore:d=>`如果VS优先，请把该资源留到本周期第4天（当前第${d}天）。`,heroAfter:d=>`本周期VS第4天已经过去（当前第${d}天）。如果VS优先，请留到下一个第4天；只有当赛季时机或账号瓶颈现在能带来明显更高ROI时才例外。`,droneNow:"时机良好：VS第1天更适合无人机成长。",droneAfter:d=>`本周期VS第1天已经过去（当前第${d}天）。如果VS优先，请把无人机组件留到下一个第1天；只有当前能带来明显更高ROI时才例外。`,late:"赛季后期：投入高成本EX30前先确认短期回报。",neutral:"时机中性：主要根据ROI和账号瓶颈决定。"},
  ar:{scan:"نفّذ الآن: البيانات الأفضل تفتح تشخيصاً أكثر موثوقية.",heroNow:"توقيت جيد: اليوم 4 من VS يعطي قيمة أعلى لترقيات الأبطال.",heroBefore:d=>`إذا كان VS هو الأولوية، احتفظ بهذا المورد لليوم 4 من الدورة الحالية (اليوم الحالي ${d}).`,heroAfter:d=>`اليوم 4 من VS مضى بالفعل في هذه الدورة (اليوم الحالي ${d}). إذا كان VS هو الأولوية، احتفظ بالمورد لليوم 4 القادم إلا إذا أعطى توقيت الموسم أو اختناق الحساب عائداً أفضل بوضوح الآن.`,droneNow:"توقيت جيد: اليوم 1 من VS يعطي قيمة أعلى لتطوير الدرون.",droneAfter:d=>`اليوم 1 من VS مضى بالفعل في هذه الدورة (اليوم الحالي ${d}). إذا كان VS هو الأولوية، احتفظ بمكونات الدرون لليوم 1 القادم إلا إذا كان العائد الآن أفضل بوضوح.`,late:"نهاية الموسم: تحقق من العائد القريب قبل استثمار EX30 مكلف.",neutral:"توقيت محايد: قرر أساساً حسب العائد واختناق الحساب."}
};
const TECH_TIMING_TEXT={
  fr:{now:"Bon timing : le jour VS 3 valorise les améliorations de technologie.",before:d=>`Si le VS est prioritaire, conserve les ressources technologiques pour le jour 3 de ce cycle (actuellement jour ${d}).`,after:d=>`Le jour VS 3 est passé dans ce cycle (actuellement jour ${d}). Si le VS est prioritaire, garde-les pour le prochain jour 3 sauf si le goulot actuel offre un meilleur rendement maintenant.`},
  en:{now:"Good timing: VS Day 3 rewards technology upgrades.",before:d=>`If VS is the priority, hold technology resources for Day 3 of this cycle (currently Day ${d}).`,after:d=>`VS Day 3 has passed in this cycle (currently Day ${d}). If VS is the priority, hold them for the next Day 3 unless the current bottleneck has materially better value now.`},
  es:{now:"Buen momento: el Día 3 de VS premia las mejoras de tecnología.",before:d=>`Si VS es la prioridad, guarda los recursos tecnológicos para el Día 3 de este ciclo (ahora Día ${d}).`,after:d=>`El Día 3 de VS ya pasó (ahora Día ${d}). Si VS es la prioridad, guárdalos para el próximo Día 3 salvo que el cuello de botella actual aporte claramente más valor ahora.`},
  de:{now:"Gutes Timing: VS-Tag 3 belohnt Technologie-Upgrades.",before:d=>`Wenn VS Priorität hat, halte Technologieressourcen bis Tag 3 dieses Zyklus zurück (aktuell Tag ${d}).`,after:d=>`VS-Tag 3 ist bereits vorbei (aktuell Tag ${d}). Halte die Ressourcen bis zum nächsten Tag 3 zurück, außer der aktuelle Engpass bringt jetzt deutlich mehr Nutzen.`},
  ja:{now:"好タイミング：VS 3日目は技術強化の価値が高い日です。",before:d=>`VS優先なら技術資源をこのサイクルの3日目まで温存してください（現在${d}日目）。`,after:d=>`このサイクルのVS 3日目は終了しています（現在${d}日目）。現在のボトルネックが明確に高い価値を持つ場合を除き、次の3日目まで温存します。`},
  zh:{now:"时机良好：VS第3天更适合科技升级。",before:d=>`如果VS优先，请把科技资源留到本周期第3天（当前第${d}天）。`,after:d=>`本周期VS第3天已经过去（当前第${d}天）。除非当前瓶颈现在具有明显更高价值，否则留到下一个第3天。`},
  ar:{now:"توقيت جيد: اليوم 3 من VS يعطي قيمة أعلى لترقيات التقنية.",before:d=>`إذا كان VS هو الأولوية، احتفظ بموارد التقنية لليوم 3 من الدورة الحالية (اليوم ${d}).`,after:d=>`اليوم 3 من VS مضى في هذه الدورة (اليوم ${d}). احتفظ بها لليوم 3 القادم إلا إذا كان الاختناق الحالي يعطي قيمة أعلى بوضوح الآن.`}
};
function timingWindow(kind,state,lang,meta={}){
  const day=Number(state?.vs?.day),heroLane=["level","stars","exclusive","awakening"].includes(kind),tx=VS_TIMING_TEXT[lang]||VS_TIMING_TEXT.en,tt=TECH_TIMING_TEXT[lang]||TECH_TIMING_TEXT.en;
  if(kind==="scan")return {status:"now",best_day:null,label:tx.scan};
  if(heroLane){
    if(day===4)return {status:"spend_now",best_day:4,label:tx.heroNow};
    if(day>=1&&day<4)return {status:"hold_if_vs_priority",best_day:4,label:tx.heroBefore(day)};
    if(day>4&&day<=6)return {status:"hold_if_vs_priority",best_day:4,next_cycle:true,label:tx.heroAfter(day)};
  }
  if(kind==="drone"){
    if(day===1)return {status:"spend_now",best_day:1,label:tx.droneNow};
    if(day>1&&day<=6)return {status:"hold_if_vs_priority",best_day:1,next_cycle:true,label:tx.droneAfter(day)};
  }
  if(kind==="technology"){
    if(day===3)return {status:"spend_now",best_day:3,label:tt.now};
    if(day>=1&&day<3)return {status:"hold_if_vs_priority",best_day:3,label:tt.before(day)};
    if(day>3&&day<=6)return {status:"hold_if_vs_priority",best_day:3,next_cycle:true,label:tt.after(day)};
  }
  const sd=num(state?.season?.day),st=num(state?.season?.total_days),late=sd!==null&&st!==null&&st>0&&sd/st>=.8;
  if(late&&Number(meta?.breakpoint)===30)return {status:"check_payback",best_day:null,label:tx.late};
  return {status:"neutral",best_day:null,label:tx.neutral};
}
function heroImportance(h,heroes,type){const p=num(h?.power),known=heroes.map(x=>num(x.h?.power)).filter(x=>x!==null);let w=1;if(p!==null&&known.length){const mx=Math.max(...known),mn=Math.min(...known);w+=mx===mn?.06:((p-mn)/(mx-mn))*.12}const n=canonicalHeroName(h?.name);if(type&&heroType(n)===type)w+=.05;return w}
function allHeroDecisionValues(state,mainSquadIndex=0){
  const rows=[],seen=new Set(),squads=Array.isArray(state?.squads)?state.squads:[],mainHeroes=squads[mainSquadIndex]?.heroes||[],mainType=mainSquadType(mainHeroes),mainBonus=formationBonusPct(mainHeroes),weapons=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[],progress=Array.isArray(state?.hero_progression)?state.hero_progression:[];
  const progressFor=n=>progress.find(x=>canonicalHeroName(x?.hero_name||x?.name).toLowerCase()===canonicalHeroName(n).toLowerCase());
  const add=(raw,squad)=>{const name=canonicalHeroName(raw?.name||raw?.hero_name);if(!name||seen.has(name.toLowerCase()))return;seen.add(name.toLowerCase());const hp=progressFor(name),hydrated=hydrateHeroFromMemory(state,{...raw,name}),h={...hydrated,...(hp||{}),name,awakening:{...(hydrated?.awakening||{}),...(hp?.awakening||{})}},stars=num(h.stars),ex=metric(h.exclusive),gear=gearMetric(h.gear),type=heroType(name),isMain=squad===mainSquadIndex+1,fit=mainType&&type===mainType;let value=45+(isMain?28:0)+(fit?8:mainType&&type?-7:0);const power=num(h.power);if(power!==null)value+=Math.min(8,Math.max(0,power/10));let next='hold';if(stars!==null&&stars<5)next='stars';else if(seasonIsActive(state?.season||{})&&Number(state?.season?.number)===6&&S6_AWAKENING_HEROES[name]&&stars>=5&&ex!==null&&ex>=20)next='awakening';else if(ex!==null&&nextKnownExBreakpoint(ex)!==null)next='exclusive';else if(gear!==null&&gear<40)next='gear';const aw=seasonIsActive(state?.season||{})&&Number(state?.season?.number)===6?heroReshapeDecisionValue({hero:h,weapons,season:state?.season||{},mainType,formationBonus:mainBonus,importance:isMain?1.08:.88}):null;if(aw)value=Math.max(value,Math.round(aw.decision_value_index*(isMain?1:.82)));rows.push({hero:name,squad,type,main_squad:isMain,formation_fit:fit,strategic_value_index:Math.max(1,Math.min(100,Math.round(value))),next_upgrade_family:next,stars,exclusive:ex,gear,awakening:aw,exact_power_projected:false});};
  squads.forEach((sq,i)=>{if(sq?.needs_rescan===true)return;(sq?.heroes||[]).filter(heroConfigured).forEach(h=>add(h,i+1))});progress.forEach(h=>add(h,null));rows.sort((a,b)=>b.strategic_value_index-a.strategic_value_index||String(a.hero).localeCompare(String(b.hero)));return {scope:'all-configured-heroes-across-scanned-squads',main_type:mainType,formation_bonus_pct:mainBonus,heroes:rows,exact_power_projection:false};
}
function candidate(kind,title,reason,action,buyFree,buyPaid,target,impact,cost,state,lang,meta={}){
  const presentation={hero:canonicalHeroName(meta?.hero||target),current_label:meta?.current_label||null,next_target:meta?.next_target||null,progress_label:(meta?.current_label&&meta?.next_target)?`${meta.current_label} → ${meta.next_target}`:null};
  const timing=timingAdjustment(kind,state,meta),window=timingWindow(kind,state,lang,meta),intel=metaAdjustment({kind,target,...meta},state,lang);
  const freshnessDomain=kind==="drone"?"drone":kind==="scan"?null:"player";
  const freshness=freshnessDomain?freshnessInfo(meta?.source_updated_at,freshnessDomain,lang):null;
  const safePaid=freshness?.blocks_paid?refreshBeforePaidText(lang):buyPaid;
  const roi=Math.max(1,Math.min(100,Math.round((impact/(Math.max(.35,cost)))*.78+timing+intel.bonus*.35)));
  const score=Math.max(1,Math.min(100,Math.round(impact*.66+roi*.34+timing+intel.bonus)));
  return {kind,title,reason:[reason,...intel.reasons].filter(Boolean).join(' '),action,buy_free:buyFree,buy_paid:safePaid,target,severity:score,impact_score:Math.round(impact),impact_label:impactLabel(impact,lang),roi_score:roi,roi_label:roiLabel(roi,lang),resource_efficiency_score:roi,resource_efficiency_label:roiLabel(roi,lang),resource_family:resourceFamily(kind),relative_cost:{index:Math.round(cost*100)/100,band:costBand(cost),basis:"relative_index_no_official_quantity"},timing_adjustment:timing,timing_window:window,data_freshness:freshness,meta_adjustment:intel.bonus,evidence_ids:intel.evidence,presentation,...meta}
}


const MISSING_EXCLUSIVE_TEXT={
  fr:(s,n)=>({title:"Vérifier les armes exclusives",target:`EX · ${s}`,reason:`WarBoost ne connaît pas encore l'EX fiable de ${n.join(", ")}. Tant que ces valeurs ne sont pas confirmées, il serait risqué de classer le Drone devant ces héros.`,action:"Scanne ou confirme les armes exclusives de l'escouade principale avant d'engager des fragments, composants rares ou un achat payant."}),
  en:(s,n)=>({title:"Verify exclusive weapons",target:`EX · ${s}`,reason:`WarBoost does not yet have a reliable EX value for ${n.join(", ")}. Until those values are confirmed, ranking Drone ahead of these heroes would be unsafe.`,action:"Scan or confirm the main squad's exclusive weapons before committing shards, scarce components or a paid purchase."}),
  es:(s,n)=>({title:"Verificar armas exclusivas",target:`EX · ${s}`,reason:`WarBoost aún no tiene un valor EX fiable para ${n.join(", ")}. Hasta confirmarlo, no es seguro colocar el Dron por delante de estos héroes.`,action:"Escanea o confirma las armas exclusivas del escuadrón principal antes de gastar fragmentos, componentes raros o dinero."}),
  de:(s,n)=>({title:"Exklusive Waffen prüfen",target:`EX · ${s}`,reason:`Für ${n.join(", ")} fehlt WarBoost noch ein verlässlicher EX-Wert. Ohne diese Werte wäre es unsicher, die Drohne vor diesen Helden einzuordnen.`,action:"Scanne oder bestätige zuerst die exklusiven Waffen des Haupttrupps, bevor seltene Ressourcen oder Geld eingesetzt werden."}),
  ja:(s,n)=>({title:"専用武器を確認",target:`EX · ${s}`,reason:`${n.join("、")} の信頼できるEX値がまだありません。確認前にドローンをこれらの英雄より上位にするのは安全ではありません。`,action:"希少資源や課金を使う前に、主力部隊の専用武器をスキャンまたは確認してください。"}),
  zh:(s,n)=>({title:"核对专属武器",target:`EX · ${s}`,reason:`WarBoost 尚未获得 ${n.join("、")} 的可靠EX数值。在确认前，把无人机排在这些英雄之前并不安全。`,action:"在投入专武碎片、稀有组件或付费资源前，先扫描或确认主力小队的专属武器。"}),
  ar:(s,n)=>({title:"تحقق من الأسلحة الحصرية",target:`EX · ${s}`,reason:`لا يملك WarBoost بعد قيمة EX موثوقة لـ ${n.join("، ")}. قبل تأكيدها، ليس من الآمن وضع الدرون قبل هؤلاء الأبطال.`,action:"امسح أو أكد الأسلحة الحصرية للفريق الرئيسي قبل إنفاق الشظايا أو المكونات النادرة أو المال."})
};
function missingExclusiveDataText(lang,squad,names){return (MISSING_EXCLUSIVE_TEXT[lang]||MISSING_EXCLUSIVE_TEXT.en)(squad,names)}

const EX_COMPARISON_TEXT={
  fr:{leader:(c,cs,n,ns,d)=>`Classé n°1 parmi les armes exclusives analysées : ${c} (${cs}/100) devance ${n} (${ns}/100) de ${d} point${d>1?"s":""}. Le classement combine rendement marginal, coût relatif jusqu’au prochain palier, rôle dans l’escouade, contexte/méta datée et timing.`,follower:(r,c,cs,l,ls,d)=>`Classé n°${r} parmi les armes exclusives : ${c} (${cs}/100) reste derrière ${l} (${ls}/100) de ${d} point${d>1?"s":""} après comparaison du rendement marginal, du coût relatif, du rôle, du contexte/méta datée et du timing.`,solo:(c,cs)=>`${c} est la seule arme exclusive avec un prochain palier fiable actuellement classable (${cs}/100).`},
  en:{leader:(c,cs,n,ns,d)=>`Ranked #1 among analyzed exclusive weapons: ${c} (${cs}/100) leads ${n} (${ns}/100) by ${d} point${d===1?"":"s"}. Ranking combines marginal return, relative cost to the next breakpoint, squad role, dated context/meta and timing.`,follower:(r,c,cs,l,ls,d)=>`Ranked #${r} among exclusive weapons: ${c} (${cs}/100) trails ${l} (${ls}/100) by ${d} point${d===1?"":"s"} after comparing marginal return, relative cost, role, dated context/meta and timing.`,solo:(c,cs)=>`${c} is the only exclusive weapon with a reliable next breakpoint that can currently be ranked (${cs}/100).`},
  es:{leader:(c,cs,n,ns,d)=>`N.º 1 entre las armas exclusivas analizadas: ${c} (${cs}/100) supera a ${n} (${ns}/100) por ${d} punto${d===1?"":"s"}. La clasificación combina rendimiento marginal, coste relativo al próximo hito, rol, contexto/meta fechado y timing.`,follower:(r,c,cs,l,ls,d)=>`N.º ${r} entre las armas exclusivas: ${c} (${cs}/100) queda detrás de ${l} (${ls}/100) por ${d} punto${d===1?"":"s"}, tras comparar rendimiento marginal, coste relativo, rol, contexto/meta fechado y timing.`,solo:(c,cs)=>`${c} es la única arma exclusiva con un próximo hito fiable que puede clasificarse ahora (${cs}/100).`},
  de:{leader:(c,cs,n,ns,d)=>`Platz 1 der analysierten Exklusivwaffen: ${c} (${cs}/100) liegt ${d} Punkt${d===1?"":"e"} vor ${n} (${ns}/100). Gewertet werden Grenznutzen, relative Kosten bis zum nächsten Meilenstein, Trupprolle, datierter Kontext/Meta und Timing.`,follower:(r,c,cs,l,ls,d)=>`Platz ${r} der Exklusivwaffen: ${c} (${cs}/100) liegt nach Vergleich von Grenznutzen, relativen Kosten, Rolle, datiertem Kontext/Meta und Timing ${d} Punkt${d===1?"":"e"} hinter ${l} (${ls}/100).`,solo:(c,cs)=>`${c} ist derzeit die einzige Exklusivwaffe mit einem zuverlässig bewertbaren nächsten Meilenstein (${cs}/100).`},
  ja:{leader:(c,cs,n,ns,d)=>`専用武器の分析順位1位：${c}（${cs}/100）は ${n}（${ns}/100）を${d}点上回ります。限界効率、次の節目までの相対コスト、部隊内役割、日付付きメタ/状況、タイミングを合算した順位です。`,follower:(r,c,cs,l,ls,d)=>`専用武器の分析順位${r}位：${c}（${cs}/100）は、限界効率・相対コスト・役割・日付付きメタ/状況・タイミングの比較後、${l}（${ls}/100）より${d}点下です。`,solo:(c,cs)=>`${c} は現在、信頼できる次の節目を順位付けできる唯一の専用武器です（${cs}/100）。`},
  zh:{leader:(c,cs,n,ns,d)=>`专属武器分析排名第1：${c}（${cs}/100）领先 ${n}（${ns}/100）${d}分。排名综合边际收益、到下一节点的相对成本、队伍角色、带日期的情境/Meta与时机。`,follower:(r,c,cs,l,ls,d)=>`专属武器排名第${r}：${c}（${cs}/100）在综合边际收益、相对成本、角色、带日期的情境/Meta与时机后，落后 ${l}（${ls}/100）${d}分。`,solo:(c,cs)=>`${c} 是当前唯一具有可靠下一节点、可进行排名的专属武器（${cs}/100）。`},
  ar:{leader:(c,cs,n,ns,d)=>`المرتبة 1 بين الأسلحة الحصرية المحللة: ${c} (${cs}/100) يتقدم على ${n} (${ns}/100) بـ ${d} نقطة. يجمع الترتيب العائد الهامشي والتكلفة النسبية حتى العتبة التالية ودور البطل والسياق/الميتا المؤرخ والتوقيت.`,follower:(r,c,cs,l,ls,d)=>`المرتبة ${r} بين الأسلحة الحصرية: ${c} (${cs}/100) يتأخر عن ${l} (${ls}/100) بـ ${d} نقطة بعد مقارنة العائد الهامشي والتكلفة النسبية والدور والسياق/الميتا المؤرخ والتوقيت.`,solo:(c,cs)=>`${c} هو السلاح الحصري الوحيد الذي يملك حالياً عتبة تالية موثوقة قابلة للترتيب (${cs}/100).`}
};
const EX_STATUS_TEXT={
  fr:{eligible:"Classable",cap:"EX30 atteint · aucun palier 10/20/30 supérieur modélisé",missing:"EX à vérifier",other:"Pas de palier classable"},
  en:{eligible:"Rankable",cap:"EX30 reached · no higher 10/20/30 breakpoint modeled",missing:"EX needs verification",other:"No rankable breakpoint"},
  es:{eligible:"Clasificable",cap:"EX30 alcanzado · no hay otro hito 10/20/30 modelado",missing:"EX por verificar",other:"Sin hito clasificable"},
  de:{eligible:"Bewertbar",cap:"EX30 erreicht · kein höherer 10/20/30-Meilenstein modelliert",missing:"EX prüfen",other:"Kein bewertbarer Meilenstein"},
  ja:{eligible:"順位付け可能",cap:"EX30到達・10/20/30モデル上これ以上の節目なし",missing:"EX要確認",other:"順位付けできる節目なし"},
  zh:{eligible:"可排名",cap:"已达EX30 · 10/20/30模型无更高节点",missing:"EX待核对",other:"无可排名节点"},
  ar:{eligible:"قابل للترتيب",cap:"تم بلوغ EX30 · لا توجد عتبة 10/20/30 أعلى في النموذج",missing:"يجب التحقق من EX",other:"لا توجد عتبة قابلة للترتيب"}
};
function exComparisonPack(lang){return EX_COMPARISON_TEXT[localePack(lang)]||EX_COMPARISON_TEXT.en}
function exStatusPack(lang){return EX_STATUS_TEXT[localePack(lang)]||EX_STATUS_TEXT.en}
function buildExclusiveComparison(mainHeroes,scoredCandidates,lang){
  const ranked=(Array.isArray(scoredCandidates)?scoredCandidates:[]).filter(x=>x.kind==="exclusive").sort((a,b)=>(b.marginal_value_score??b.severity)-(a.marginal_value_score??a.severity)||b.severity-a.severity||b.roi_score-a.roi_score);
  const rankByHero=new Map(ranked.map((x,i)=>[canonicalHeroName(x.hero||x.target).toLowerCase(),{candidate:x,rank:i+1}]));
  const tx=exStatusPack(lang);
  const rows=(Array.isArray(mainHeroes)?mainHeroes:[]).filter(heroConfigured).map((h,i)=>{
    const hero=canonicalHeroName(h?.name)||heroName(h,i,localePack(lang));
    const current=metric(h?.exclusive),hit=rankByHero.get(hero.toLowerCase()),c=hit?.candidate||null,next=c?Number(c.breakpoint||String(c.next_target||"").replace(/\D/g,""))||null:nextKnownExBreakpoint(current);
    const status=current===null?"missing":c?"eligible":current>=30?"model_cap":"not_ranked";
    return {hero,current,current_label:current===null?null:`EX${current}`,next_target:next===null?null:`EX${next}`,progress_needed_levels:c&&next!==null?Math.max(0,next-current):null,exclusive_rank:hit?.rank||null,marginal_value_score:c?.marginal_value_score??null,impact_score:c?.impact_score??null,resource_efficiency_score:c?.resource_efficiency_score??c?.roi_score??null,relative_cost:c?.relative_cost||null,meta_adjustment:c?.meta_adjustment??0,evidence_ids:c?.evidence_ids||[],status,status_label:status==="eligible"?tx.eligible:status==="model_cap"?tx.cap:status==="missing"?tx.missing:tx.other,fragment_cost_known:false,squad_position:i+1};
  });
  rows.sort((a,b)=>(a.exclusive_rank??999)-(b.exclusive_rank??999)||a.squad_position-b.squad_position);
  return {model_breakpoints:[10,20,30],fragment_cost_known:false,exact_fragment_quantities:false,heroes:rows,all_main_heroes_included:rows.length===(Array.isArray(mainHeroes)?mainHeroes.filter(heroConfigured).length:0)};
}
function exclusiveComparisonTail(comparison,lang){
  const rows=comparison?.heroes||[],caps=rows.filter(x=>x.status==="model_cap").map(x=>x.hero),missing=rows.filter(x=>x.status==="missing").map(x=>x.hero),l=localePack(lang);
  const bits=[];
  if(caps.length)bits.push(l==="fr"?`${caps.join(", ")} : EX30 déjà atteint dans le modèle 10/20/30, donc aucune dépense EX supplémentaire n’est classée.`:l==="es"?`${caps.join(", ")}: EX30 ya alcanzado en el modelo 10/20/30; no se clasifica gasto EX adicional.`:l==="de"?`${caps.join(", ")}: EX30 im 10/20/30-Modell bereits erreicht; keine weitere EX-Ausgabe wird bewertet.`:l==="ja"?`${caps.join("、")}：10/20/30モデルでEX30到達済みのため、追加EX投資は順位付けしません。`:l==="zh"?`${caps.join("、")}：10/20/30模型中已达EX30，因此不对额外EX投入排名。`:l==="ar"?`${caps.join("، ")}: تم بلوغ EX30 في نموذج 10/20/30، لذلك لا يتم ترتيب إنفاق EX إضافي.`:`${caps.join(", ")}: EX30 already reached in the 10/20/30 model, so no additional EX spend is ranked.`);
  if(missing.length)bits.push(l==="fr"?`EX de ${missing.join(", ")} à confirmer avant comparaison complète.`:l==="es"?`Confirma el EX de ${missing.join(", ")} antes de una comparación completa.`:l==="de"?`EX von ${missing.join(", ")} vor einem vollständigen Vergleich bestätigen.`:l==="ja"?`完全比較の前に ${missing.join("、")} のEXを確認してください。`:l==="zh"?`完整比较前请确认 ${missing.join("、")} 的EX。`:l==="ar"?`أكد EX لـ ${missing.join("، ")} قبل المقارنة الكاملة.`:`Verify ${missing.join(", ")} EX before a complete comparison.`);
  return bits.join(" ");
}
const EX_TIE_TEXT={
  fr:{leader:(c,n,s)=>`Classé n°1 après départage : ${c} et ${n} ont le même score marginal arrondi (${s}/100) ; la sévérité, le ROI puis l’impact servent de critères de départage.`,follower:(r,c,l,s)=>`Classé n°${r} après départage : ${c} et ${l} ont le même score marginal arrondi (${s}/100) ; la sévérité, le ROI puis l’impact placent ${l} devant.`},
  en:{leader:(c,n,s)=>`Ranked #1 after tie-break: ${c} and ${n} have the same rounded marginal score (${s}/100); severity, ROI, then impact break the tie.`,follower:(r,c,l,s)=>`Ranked #${r} after tie-break: ${c} and ${l} have the same rounded marginal score (${s}/100); severity, ROI, then impact place ${l} ahead.`},
  es:{leader:(c,n,s)=>`N.º 1 tras desempate: ${c} y ${n} tienen el mismo score marginal redondeado (${s}/100); severidad, ROI e impacto desempatan.`,follower:(r,c,l,s)=>`N.º ${r} tras desempate: ${c} y ${l} tienen el mismo score marginal redondeado (${s}/100); severidad, ROI e impacto colocan a ${l} delante.`},
  de:{leader:(c,n,s)=>`Platz 1 nach Tie-Break: ${c} und ${n} haben denselben gerundeten Grenznutzen (${s}/100); Schweregrad, ROI und danach Wirkung entscheiden.`,follower:(r,c,l,s)=>`Platz ${r} nach Tie-Break: ${c} und ${l} haben denselben gerundeten Grenznutzen (${s}/100); Schweregrad, ROI und Wirkung setzen ${l} nach vorn.`},
  ja:{leader:(c,n,s)=>`同点判定後1位：${c} と ${n} の丸めた限界スコアは同じ（${s}/100）で、重要度、ROI、影響度の順で判定します。`,follower:(r,c,l,s)=>`同点判定後${r}位：${c} と ${l} の丸めた限界スコアは同じ（${s}/100）で、重要度、ROI、影響度により ${l} が上位です。`},
  zh:{leader:(c,n,s)=>`并列分判定后第1：${c} 与 ${n} 的四舍五入边际分相同（${s}/100），依次用严重度、ROI、影响分判定。`,follower:(r,c,l,s)=>`并列分判定后第${r}：${c} 与 ${l} 的四舍五入边际分相同（${s}/100），严重度、ROI、影响分使 ${l} 排在前面。`},
  ar:{leader:(c,n,s)=>`المرتبة 1 بعد كسر التعادل: لدى ${c} و${n} نفس الدرجة الهامشية المقربة (${s}/100)، ويُحسم التعادل بالشدة ثم ROI ثم التأثير.`,follower:(r,c,l,s)=>`المرتبة ${r} بعد كسر التعادل: لدى ${c} و${l} نفس الدرجة الهامشية المقربة (${s}/100)، وتضع الشدة ثم ROI ثم التأثير ${l} في المقدمة.`}
};
function rankAwareExclusiveWhy(comparison,chosen,lang){
  if(!chosen||chosen.kind!=="exclusive")return "";
  const rows=comparison?.heroes||[],hero=canonicalHeroName(chosen.hero||chosen.target),row=rows.find(x=>x.hero.toLowerCase()===hero.toLowerCase()),leader=rows.find(x=>x.exclusive_rank===1),next=rows.find(x=>x.exclusive_rank===2),tx=exComparisonPack(lang);
  if(!row||!row.exclusive_rank)return exclusiveComparisonTail(comparison,lang);
  const score=Math.round(Number(row.marginal_value_score)||0);let text="";
  const tie=EX_TIE_TEXT[localePack(lang)]||EX_TIE_TEXT.en;
  if(row.exclusive_rank===1){if(next){const ns=Math.round(Number(next.marginal_value_score)||0),d=Math.max(0,score-ns);text=d===0?tie.leader(row.hero,next.hero,score):tx.leader(row.hero,score,next.hero,ns,d)}else text=tx.solo(row.hero,score)}
  else if(leader){const ls=Math.round(Number(leader.marginal_value_score)||0),d=Math.max(0,ls-score);text=d===0?tie.follower(row.exclusive_rank,row.hero,leader.hero,score):tx.follower(row.exclusive_rank,row.hero,score,leader.hero,ls,d)}
  const tail=exclusiveComparisonTail(comparison,lang);return [text,tail].filter(Boolean).join(" ");
}
function bottleneckFamily(kind){return kind==="level"||kind==="stars"||kind==="exclusive"||kind==="gear"?"hero":kind}
function selectSmartTop3(candidates,lang){
  const sorted=[...candidates].sort((a,b)=>(b.marginal_value_score??b.severity)-(a.marginal_value_score??a.severity)||b.severity-a.severity||b.roi_score-a.roi_score||b.impact_score-a.impact_score);
  // V2.5.19: construct every reliable candidate first, then rank by contextual marginal value.
  // No explanatory card is allowed to call itself "best" independently of the actual ranking.
  const out=[],seen=new Set();
  for(const x of sorted){
    const key=`${x.kind}:${x.target}`;
    if(seen.has(key))continue;
    seen.add(key);out.push(x);
    if(out.length>=3)break;
  }
  out.forEach(x=>{
    x.hero=canonicalHeroName(x.hero||x.presentation?.hero||"")||null;
    if(x.presentation){x.presentation.hero=x.hero;x.presentation.progress_label=x.presentation.progress_label||((x.presentation.current_label&&x.presentation.next_target)?`${x.presentation.current_label} → ${x.presentation.next_target}`:null)}
    x.progress_label=x.presentation?.progress_label||null;
    if(x.kind==="exclusive"){
      x.progress_needed_levels=Math.max(0,(Number(x.breakpoint)||0)-(Number(x.current)||0));
      x.fragment_cost_known=false;
    }
  });
  return out;
}

const TECHNOLOGY_REC_TEXT={
  fr:{title:"Technologie",reason:(l,p)=>`${l} est à ${p}%. WarBoost compare son rendement marginal aux héros, EX, équipement, Éveil et Drone au lieu d'appliquer une priorité fixe.`,action:l=>`Investis dans ${l} seulement si son rendement marginal reste devant les autres goulots détectés.`,free:"Événements et boutiques gratuites : ressources technologiques adaptées à cette branche, si disponibles.",paid:"Évite les packs génériques ; un achat payant n'est conseillé que s'il accélère directement cette branche prioritaire."},
  en:{title:"Technology",reason:(l,p)=>`${l} is at ${p}%. WarBoost compares its marginal return with heroes, EX, gear, Awakening and Drone instead of using a fixed priority.`,action:l=>`Invest in ${l} only while its marginal return remains above the other detected bottlenecks.`,free:"Events and free shops: technology resources for this branch, if available.",paid:"Avoid generic packs; a paid purchase is advised only when it directly accelerates this priority branch."},
  es:{title:"Tecnología",reason:(l,p)=>`${l} está al ${p}%. WarBoost compara su rendimiento marginal con héroes, EX, equipo, Despertar y Dron, sin una prioridad fija.`,action:l=>`Invierte en ${l} solo mientras su rendimiento marginal supere los demás cuellos de botella.`,free:"Eventos y tiendas gratuitas: recursos tecnológicos para esta rama, si están disponibles.",paid:"Evita packs genéricos; paga solo si acelera directamente esta rama prioritaria."},
  de:{title:"Technologie",reason:(l,p)=>`${l} liegt bei ${p}%. WarBoost vergleicht den Grenznutzen mit Helden, EX, Ausrüstung, Awakening und Drohne statt einer festen Priorität.`,action:l=>`Investiere nur in ${l}, solange der Grenznutzen über den anderen erkannten Engpässen liegt.`,free:"Events und Gratis-Shops: passende Technologieressourcen, falls verfügbar.",paid:"Generische Pakete vermeiden; nur zahlen, wenn diese Prioritätsbranche direkt beschleunigt wird."},
  ja:{title:"技術",reason:(l,p)=>`${l} は ${p}%です。固定順位ではなく、英雄・EX・装備・覚醒・ドローンとの限界効率を比較します。`,action:l=>`${l} の限界効率が他のボトルネックを上回る間だけ投資します。`,free:"イベント／無料ショップ：対象技術向け資源（表示される場合）。",paid:"汎用パックは避け、この優先技術を直接加速する場合だけ課金を検討。"},
  zh:{title:"科技",reason:(l,p)=>`${l} 当前为 ${p}%。WarBoost 会与英雄、专武、装备、觉醒和无人机比较边际收益，而不是使用固定优先级。`,action:l=>`仅当 ${l} 的边际收益仍高于其他已发现瓶颈时投入。`,free:"活动／免费商店：该科技分支所需资源（如有）。",paid:"避免通用礼包；只有能直接加速当前优先科技分支时才考虑付费。"},
  ar:{title:"التقنية",reason:(l,p)=>`${l} عند ${p}%. يقارن WarBoost العائد الهامشي مع الأبطال وEX والمعدات والإيقاظ والدرون بدلاً من أولوية ثابتة.`,action:l=>`استثمر في ${l} فقط ما دام عائده الهامشي أعلى من الاختناقات الأخرى المكتشفة.`,free:"الأحداث والمتاجر المجانية: موارد التقنية المناسبة لهذا الفرع عند توفرها.",paid:"تجنب الحزم العامة؛ الشراء المدفوع فقط إذا سرّع هذا الفرع ذي الأولوية مباشرة."}
};
function technologyRecText(lang){return TECHNOLOGY_REC_TEXT[lang]||TECHNOLOGY_REC_TEXT.en}
function avoidNowText(lang,mainName,topKinds){
  const packs={
    fr:[
      `Évite de disperser les ressources sur les escouades secondaires tant que les priorités de ${mainName} offrent un meilleur rendement marginal, sauf objectif VS/Saison contraire.`,
      `Évite les packs de ressources génériques : privilégie uniquement un achat qui résout un goulot détecté.`,
      `Ne dépense pas une ressource rare juste pour gagner de la puissance si le jour VS ou la Saison donne un meilleur timing.`
    ],
    en:[
      `Avoid spreading resources across secondary squads while ${mainName} has higher marginal-value priorities, unless VS/Season context makes another squad more valuable now.`,
      `Avoid generic resource packs: only buy something that directly fixes a detected bottleneck.`,
      `Do not spend a scarce resource just for power if VS or Season timing gives better value.`
    ]
  };
  const base=packs[lang]||packs.en;
  const out=[...base];
  if(topKinds.includes("exclusive")) out.push(lang==="fr"?"Ne disperse pas les fragments d'arme exclusive sur plusieurs héros à la fois.":"Do not split exclusive-weapon shards across several heroes at once.");
  return out.slice(0,3);
}

function buildPlayerAnalysis(state,locale){
  const lang=localePack(locale),p=T[lang],loc=String(locale||"en-GB");
  const squads=Array.from({length:4},(_,i)=>state?.squads?.[i]||{id:i+1,heroes:[]});
  const configured=squads.map((s,i)=>({s,i})).filter(x=>squadConfigured(x.s));
  if(!configured.length)return {summary:p.noSquad,confidence:0,confidence_label:p.confidence(0),priorities:[],squads:squads.map((s,i)=>({id:i+1,name:squadName(s,i,lang),power:null,status:i===3?optionalSquadStatus(lang):p.squadStatusMissing,data_quality:0,gap_to_main:null,optional:i===3})),focus_squad:null};
  const selected=selectPrimarySquad({squads});
  const main=selected||configured[0],mainPower=num(main.s.power),mainName=squadName(main.s,main.i,lang);
  const strongestConfigured=[...configured].filter(x=>num(x.s.power)!==null).sort((a,b)=>num(b.s.power)-num(a.s.power))[0]||main;
  const weaponList=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[];
  const progressionList=Array.isArray(state?.hero_progression)?state.hero_progression:[];
  const progressionByHero=name=>heroProgressionByName(state,name);
  const weaponByHero=name=>heroWeaponByName(state,name);
  const heroUpdatedAt=name=>heroMemoryUpdatedAt(state,name,main.s.updated_at);
  // V2.4.9: Diagnostic PRO consumes the V2.4.7 hero-keyed memory registry.
  // Squad slots provide identity/current visible data; hero_profiles, hero_progression and exclusive_weapons
  // restore only the SAME hero's known fields. Nothing is ever inherited from a previous slot occupant.
  const enhancedHeroes=(main.s.heroes||[]).map(h=>hydrateHeroFromMemory(state,h));
  const heroes=enhancedHeroes.map((h,i)=>({h,i})).filter(x=>heroConfigured(x.h));
  const coverage=heroDetailCoverage({...main.s,heroes:enhancedHeroes});
  const candidates=[];
  if(heroes.length<3||coverage<30){candidates.push(candidate("scan",p.titles.scan,p.needHeroes(mainName),p.actionScan,p.freeNone,p.paidNone,mainName,99,.55,state,lang));}
  else{
    const squadType=squadTypeFromHeroes(heroes),formationBonus=formationBonusPct(enhancedHeroes),measuredHybrid=state?.season?.measured_hybrid_synergy===true,awTx=awakeningText(locale);
    const levels=heroes.map(x=>num(x.h.level)).filter(x=>x!==null), levelTarget=levels.length?Math.max(...levels):null;
    const gears=heroes.map(({h})=>gearMetric(h.gear)).filter(x=>x!==null), gearTarget=gears.length?Math.max(...gears):null;
    for(const {h,i} of heroes){
      const hn=heroName(h,i,lang),baseImportance=heroImportance(h,heroes,squadType),offType=Boolean(squadType&&heroType(hn)&&heroType(hn)!==squadType),importance=baseImportance*((offType&&!measuredHybrid)?0.90:1),awReady=awakeningReadiness(h,weaponList,state?.season||{}),awEligible=seasonIsActive(state?.season||{})&&Number(state?.season?.number)===6&&Boolean(S6_AWAKENING_HEROES[canonicalHeroName(hn)]);
      const lv=num(h.level);if(lv!==null&&levelTarget!==null&&levelTarget-lv>=3){const gap=levelTarget-lv,impact=Math.min(92,(67+gap*2.2)*importance),cost=.72+gap/18;candidates.push(candidate("level",p.titles.level,p.level(hn,gap,levelTarget),p.actionLevel(hn),p.freeLevel,p.paidLevel,hn,impact,cost,state,lang,{hero:hn,current:lv,current_label:`Lv.${lv}`,next_target:`Lv.${levelTarget}`,source_updated_at:main.s.updated_at||null}));}
      const st=num(h.stars);if(st!==null&&st<5){const gap=Math.max(.1,Math.round((5-st)*10)/10),gate=awEligible?8:0,impact=Math.min(99,(82+gap*5+gate)*importance),cost=.9+gap*.42,reason=p.stars(hn,gap)+(awEligible?` ${awTx.gateStars(hn)}`:"");candidates.push(candidate("stars",p.titles.stars,reason,p.actionStars(hn),p.freeHero,p.paidHero,hn,impact,cost,state,lang,{hero:hn,current:st,current_label:`${st}★`,next_target:`${Math.min(5,Math.ceil((st+.1)*2)/2)}★`,awakening_gate:awEligible,source_updated_at:main.s.updated_at||null}));}
      const ex=metric(h.exclusive),exTarget=nextKnownExBreakpoint(ex);if(ex!==null&&exTarget!==null){const raw=exPriorityScore(hn,squadType,ex,exTarget),gap=exTarget-ex,gate=awEligible&&ex<20&&exTarget===20?11:0,impact=Math.min(99,(64+raw*.28+gate)*importance),cost=.75+gap/12,reason=exReason(locale,hn,ex,exTarget)+(gate?` ${awTx.gateEx(hn)}`:"");candidates.push(candidate("exclusive",p.titles.exclusive,reason,p.actionExclusive(hn),p.freeExclusive,p.paidExclusive,hn,impact,cost,state,lang,{hero:hn,current:ex,current_label:`EX${ex}`,next_target:`EX${exTarget}`,breakpoint:exTarget,awakening_gate:gate>0,source_updated_at:heroUpdatedAt(hn)}));}
      if(awEligible&&st!==null&&st>=5&&ex!==null&&ex>=20){const awScore=awakeningDecisionScore({hero:h,weapons:weaponList,season:state?.season||{},mainType:squadType,formationBonus,importance}),shards=awReady?.awakening?.named_shards,reason=(shards===null?awTx.unknown(hn):shards>=50||awReady?.unlock_confirmed?awTx.ready(hn):awTx.shards(hn,shards))+` ${formationBonus>=20?awTx.mono(formationBonus):(!measuredHybrid&&formationBonus<20?awTx.hybrid:"")}`,cost=awReady?.unlock_confirmed?.82:shards===null?1.20:shards>=50?1.0:1.35;candidates.push(candidate("awakening",awTx.title,reason,awTx.action(hn),awTx.free,awTx.paid,hn,Math.max(58,awScore||58),cost,state,lang,{hero:hn,current:awReady?.awakening?.stars,current_label:awReady?.unlock_confirmed?(awReady?.awakening?.stars!==null?`Awakening ${awReady.awakening.stars}★`:awTx.title):"Awakening locked/unknown",next_target:awReady?.unlock_confirmed?"Next Awakening step":"Awakening unlock",named_shards:shards,fragment_cost_known:shards!==null,source_updated_at:latestIso(progressionByHero(hn)?.updated_at,weaponByHero(hn)?.updated_at,main.s.updated_at)}));}
      const gr=gearMetric(h.gear);if(gr!==null&&gearTarget!==null&&gearTarget-gr>=3){const gap=gearTarget-gr,impact=Math.min(94,(65+gap*1.7)*importance),cost=.68+gap/16;candidates.push(candidate("gear",p.titles.gear,p.gear(hn,Math.round(gap*10)/10,gearTarget),p.actionGear(hn),p.freeGear,p.paidGear,hn,impact,cost,state,lang,{hero:hn,current:gr,current_label:`Nv.${gr}`,next_target:`Nv.${gearTarget}`,source_updated_at:main.s.updated_at||null}));}
    }
    const exUnknown=heroes.map(({h,i})=>({h,i,name:heroName(h,i,lang)})).filter(x=>metric(x.h.exclusive)===null).map(x=>x.name);
    const reliableHeroCandidates=candidates.filter(x=>["level","stars","exclusive","awakening","gear"].includes(x.kind)).length;
    if(exUnknown.length&&reliableHeroCandidates<3){
      const gapText=missingExclusiveDataText(lang,mainName,exUnknown);
      candidates.push(candidate("scan",gapText.title,gapText.reason,gapText.action,p.freeNone,p.paidNone,gapText.target,94,.22,state,lang,{missing_field:"exclusive",missing_heroes:exUnknown,source_updated_at:main.s.updated_at||null}));
    }
    const dLevel=num(state?.drone?.level),dPower=num(state?.drone?.power_m);if(dLevel!==null||dPower!==null){const impact=dLevel===null?62:dLevel<100?84:dLevel<150?75:dLevel<200?66:58;candidates.push(candidate("drone",p.titles.drone,p.drone(dLevel,dPower!==null?fmt(dPower,loc):null),p.actionDrone,p.freeDrone,p.paidDrone,"Drone",impact,1.15,state,lang,{source_updated_at:state?.drone?.updated_at||null}));}
  }
  const missing=squads.map((s,i)=>i<3&&(!squadConfigured(s)||s?.needs_rescan===true)?squadName(s,i,lang):null).filter(Boolean);if(missing.length)candidates.push(candidate("scan",p.titles.scan,p.scanMissing(missing.join(", ")),p.actionScan,p.freeNone,p.paidNone,missing.join(", "),70,.3,state,lang));
  const formationBonus=formationBonusPct(enhancedHeroes),mainType=mainSquadType(enhancedHeroes);
  const adaptiveContext=buildAdaptiveContext(state,{mainType,formationBonusPct:formationBonus,locale:loc});
  const techOpp=technologyOpportunity(state,adaptiveContext);if(techOpp){const tt=technologyRecText(lang);candidates.push(candidate("technology",tt.title,tt.reason(techOpp.label,Math.round(techOpp.pct)),tt.action(techOpp.label),tt.free,tt.paid,techOpp.label,techOpp.impact,techOpp.cost,state,lang,{current:techOpp.pct,current_label:`${Math.round(techOpp.pct)}%`,technology_lane:techOpp.lane,source_updated_at:techOpp.source_updated_at}));}
  const scoredCandidates=applyAdaptiveScoring(candidates,adaptiveContext);
  scoredCandidates.sort((a,b)=>(b.marginal_value_score??b.severity)-(a.marginal_value_score??a.severity)||b.severity-a.severity||b.roi_score-a.roi_score||b.impact_score-a.impact_score);
  // V2.4.9: adaptive scoring ranks the complete reliable candidate pool; it does not replace the underlying Diagnostic PRO candidate builders.
  const unique=selectSmartTop3(scoredCandidates,lang);
  const exclusiveComparison=buildExclusiveComparison(enhancedHeroes,scoredCandidates,lang);
  unique.forEach((x,i)=>{x.rank=i+1;if(x.kind==="exclusive")x.comparison_note=rankAwareExclusiveWhy(exclusiveComparison,x,lang)});
  const comparison=squads.map((s,i)=>{const power=num(s.power),configuredHere=squadConfigured(s),needsRescan=s?.needs_rescan===true,optional=i===3&&!configuredHere,isMain=i===main.i,ratio=mainPower&&power!==null?power/mainPower:null,dataQ=Math.round((configuredHere?20:0)+(power!==null?20:0)+heroDetailCoverage(s)*.6),detected=(s?.heroes||[]).filter(heroConfigured).length,complete=detected>=5;let status=optional?optionalSquadStatus(lang):p.squadStatusMissing;if(configuredHere&&!needsRescan)status=isMain?p.squadStatusMain:(ratio!==null&&ratio>=.75?p.squadStatusReady:p.squadStatusLow);if(needsRescan)status=p.squadStatusMissing;return {id:i+1,name:squadName(s,i,lang),power,power_label:power!==null?fmt(power,loc):"—",status,data_quality:Math.max(0,Math.min(needsRescan?45:100,dataQ)),gap_to_main:mainPower&&power!==null?Math.max(0,Math.round((mainPower-power)*100)/100):null,optional,needs_rescan:needsRescan,heroes_detected:detected,composition_complete:complete&&!needsRescan};});
  const mainHeroesDetected=heroes.length,compositionComplete=mainHeroesDetected>=5;
  let conf=dataConfidence(squads,state?.drone||{});if(coverage<60)conf=Math.min(conf,82);if(!compositionComplete)conf=Math.min(conf,72);if(weaponList.length)conf=Math.min(96,conf+3);conf=Math.round(conf*.85+adaptiveContext.confidence*.15);
  const top=unique[0];
  const metaTopicForKind=k=>k==="exclusive"?"exclusive":k==="gear"?"gear":k==="drone"?"drone":null;
  const metaTopics=[...new Set(unique.map(x=>metaTopicForKind(x?.kind)).filter(Boolean))];
  // V2.5.19: source cards follow the domains of the current top recommendations.
  // Example: an EX-only TOP 3 cannot display a Drone article merely to increase source count.
  const metaInfo=metaContext(state,{topics:metaTopics});
  const usedEvidenceIds=[...new Set(unique.flatMap(x=>Array.isArray(x?.evidence_ids)?x.evidence_ids:[]))];
  metaInfo.used_evidence_ids=usedEvidenceIds;
  if(Array.isArray(metaInfo.evidence)&&usedEvidenceIds.length){
    metaInfo.evidence=[...metaInfo.evidence].sort((a,b)=>Number(usedEvidenceIds.includes(b.id))-Number(usedEvidenceIds.includes(a.id)));
  }
  const decisionFreshness=top?.data_freshness||freshnessInfo(main.s.updated_at||null,"player",lang);
  conf=Math.max(0,Math.min(96,conf-(decisionFreshness?.confidence_penalty||0)));
  const incompleteNote=!compositionComplete?(lang==="fr"?` Composition incomplète : ${mainHeroesDetected}/5 héros détectés, les recommandations restent prudentes.`:` Incomplete composition: ${mainHeroesDetected}/5 heroes detected; recommendations remain cautious.`):"";
  const summary=(top?p.mainDetail(mainName,mainPower!==null?fmt(mainPower,loc):"—",top.reason):p.main(mainName,mainPower!==null?fmt(mainPower,loc):"—"))+incompleteNote;
  const bottleneck=top?{kind:top.kind,target:top.target||null,hero:top.hero||null,next_target:top.next_target||null,resource_family:top.resource_family||resourceFamily(top.kind),severity:top.severity,impact_score:top.impact_score,roi_score:top.roi_score,marginal_value_score:top.marginal_value_score,certainty:top.certainty,condition_key:top.condition_key,timing_window:top.timing_window||null,data_freshness:top.data_freshness||null}:null;
  const decisionTrace=scoredCandidates.slice(0,6).map(x=>({kind:x.kind,target:x.target||null,hero:x.hero||null,next_target:x.next_target||null,breakpoint:x.breakpoint||null,severity:x.severity,impact_score:x.impact_score,roi_score:x.roi_score,marginal_value_score:x.marginal_value_score,context_adjustment:x.context_adjustment,certainty:x.certainty,condition_key:x.condition_key,calculated_at:x.calculated_at,relative_cost:x.relative_cost,resource_family:x.resource_family,timing_adjustment:x.timing_adjustment,timing_window:x.timing_window,evidence_ids:x.evidence_ids||[],data_freshness:x.data_freshness||null}));
  const resourcePlan=unique.map((x,i)=>({rank:i+1,resource_family:x.resource_family,target:x.target||null,spend_timing:x.timing_window?.status||"neutral",best_vs_day:x.timing_window?.best_day??null,relative_cost:x.relative_cost,marginal_value_score:x.marginal_value_score,certainty:x.certainty,condition_key:x.condition_key}));
  const activeS6=seasonIsActive(state?.season||{})&&Number(state?.season?.number)===6,reshapeValues=activeS6?enhancedHeroes.map(h=>heroReshapeDecisionValue({hero:h,weapons:weaponList,season:state?.season||{},mainType,formationBonus,importance:heroImportance(h,heroes,mainType)})).filter(Boolean).sort((a,b)=>b.decision_value_index-a.decision_value_index):[],tech=activeS6?season6TechPriorities(state?.technology||{},{offense:/pvp|offen|siege|attack/i.test(String(state?.season?.focus||"")),defense:/defen|garrison|protect/i.test(String(state?.season?.focus||""))}):{known:false,priorities:[]},swap=activeS6?awakeningSwapAssessment({swap:state?.season?.awakening_swap||{},heroes:[...enhancedHeroes,...(state?.hero_progression||[]).map(x=>({name:x.hero_name,stars:x.stars,exclusive:x.exclusive,awakening:x.awakening}))],weapons:weaponList}):null;
  return {summary,confidence:conf,confidence_label:p.confidence(conf),priorities:unique,bottleneck,resource_plan:resourcePlan,decision_trace:decisionTrace,squads:comparison,focus_squad:main.i+1,primary_squad_policy:selected?.selection||"fallback",strongest_squad:{id:strongestConfigured.i+1,power:num(strongestConfigured.s.power),is_focus:strongestConfigured.i===main.i},candidates_evaluated:scoredCandidates.length,adaptive_context:adaptiveContext,generated_at:adaptiveContext.generated_at,composition:{heroes_detected:mainHeroesDetected,expected_heroes:5,complete:compositionComplete,main_type:mainType,formation_bonus_pct:formationBonus,measured_hybrid_synergy:state?.season?.measured_hybrid_synergy===true,label:compositionComplete?(lang==="fr"?"Composition confirmée":"Composition confirmed"):(lang==="fr"?`Composition partielle ${mainHeroesDetected}/5`:`Partial composition ${mainHeroesDetected}/5`)},season6_awakening:{active:activeS6,eligible_heroes:Object.keys(S6_AWAKENING_HEROES),hero_value_model:reshapeValues,exact_power_projection:false,model:"relative-decision-value-only",tech_priorities:tech,awakening_swap:swap},all_hero_value_model:allHeroDecisionValues(state,main.i),exclusive_comparison:exclusiveComparison,avoid_now:avoidNowText(lang,mainName,unique.map(x=>x.kind)),decision_model:"adaptive global bottleneck arbitration: Squad 1 is the player-selected main squad when configured; complete player context + all heroes + Awakening/Reshape relative value + EX breakpoints + formation synergy + gear + technology + Drone + explicit/inferred objective + account/server context + conditional VS/Season timing + dated multi-source evidence + certainty tiers",cost_policy:"No exact shard/material quantity or post-Awakening combat power is invented without a validated visible/official source; relative decision values are used otherwise.",meta_intelligence:metaInfo,data_freshness:decisionFreshness,engine:`warboost-ai-smart-v${ENGINE_VERSION}`};
}

// ===== V1.4 · Last War Shop Advisor =====
const SHOP_TEXT={
  fr:{buy:"À prendre",consider:"Si surplus",skip:"À éviter",scanSummary:(store,n)=>`Boutique scannée : ${store}. WarBoost a classé ${n} offre${n>1?"s":""} visible${n>1?"s":""} selon les besoins réels de ton compte.`,rulesSummary:"Conseils calculés depuis tes escouades. Scanne une boutique Last War pour classer les offres visibles et leurs prix.",honorBp:"Plan d’équipement légendaire",campaignEx:"Fragments universels d’arme exclusive",allianceHero:"Fragments UR / héros prioritaire",allianceDrone:"Pièces et composants de Drone",vipStamina:"Endurance de la boutique VIP",speed:"Accélérateurs recherche/construction",shield:"Bouclier avant combat / VS",paidExclusive:"Pack d’arme exclusive ciblé",paidGear:"Pack plans / équipement ciblé",paidDrone:"Pack Drone ciblé",resources:"Packs de ressources génériques",reasonBlueprint:"Ressource rare et durable pour la progression des équipements : priorité élevée dans la Boutique Honneur.",reasonExclusive:t=>`Ton plus gros écart visible est l’arme exclusive. Concentre les fragments sur ${t||"le héros prioritaire"} au lieu de les disperser.`,reasonHero:t=>`À privilégier seulement si ${t||"un héros de l’escouade principale"} n’est pas encore au palier d’étoiles visé.`,reasonDrone:"Bon achat après les principaux écarts héros / arme exclusive / équipement.",reasonStamina:"Bon rendement hebdomadaire pour événements, campagne et progression ; n’achète pas au détriment d’un goulot rare.",reasonSpeed:"Utile quand un objectif recherche/construction est actif ou pour marquer des points au bon jour VS.",reasonShield:"Achat situationnel : utile avant une journée combat/VS, inutile à stocker en excès.",reasonPaid:t=>`Si tu dépenses, prends uniquement un pack qui résout directement le goulot ${t}. Évite les packs génériques.`,reasonResource:"Les ressources génériques sont généralement remplaçables par le jeu : faible priorité face aux objets rares.",reasonVisible:"Offre visible classée selon ton profil WarBoost et le type d’objet détecté.",target:"Cible"},
  en:{buy:"Buy",consider:"If surplus",skip:"Skip",scanSummary:(store,n)=>`Scanned shop: ${store}. WarBoost ranked ${n} visible offer${n===1?"":"s"} against your real account needs.`,rulesSummary:"Advice is calculated from your squads. Scan a Last War shop to rank the visible offers and prices.",honorBp:"Legendary Gear Blueprint",campaignEx:"Universal Exclusive Weapon Shards",allianceHero:"UR / priority-hero shards",allianceDrone:"Drone Parts & Components",vipStamina:"VIP Store Stamina",speed:"Research / construction speed-ups",shield:"Shield before combat / VS",paidExclusive:"Targeted exclusive-weapon pack",paidGear:"Targeted gear / blueprint pack",paidDrone:"Targeted Drone pack",resources:"Generic resource packs",reasonBlueprint:"Rare, durable gear progression resource: very high priority in the Honor Shop.",reasonExclusive:t=>`Your largest visible gap is exclusive weapons. Focus shards on ${t||"the priority hero"} instead of spreading them.`,reasonHero:t=>`Prioritize only if ${t||"a main-squad hero"} still needs the next star step.`,reasonDrone:"Good after the main hero / exclusive-weapon / gear gaps.",reasonStamina:"Strong weekly value for events, campaign and progression; do not sacrifice a rarer bottleneck for it.",reasonSpeed:"Useful when a research/build objective is active or to score on the right VS day.",reasonShield:"Situational: useful before combat/VS, not worth excessive stockpiling.",reasonPaid:t=>`If you spend, buy only a pack that directly solves the ${t} bottleneck. Avoid generic bundles.`,reasonResource:"Generic resources are usually replaceable through play, so they rank below scarce progression items.",reasonVisible:"Visible offer ranked from your WarBoost profile and the detected item type.",target:"Target"},
  es:{buy:"Comprar",consider:"Si sobra",skip:"Evitar",scanSummary:(store,n)=>`Tienda escaneada: ${store}. WarBoost clasificó ${n} oferta(s) visible(s) según las necesidades reales de tu cuenta.`,rulesSummary:"Los consejos se calculan desde tus escuadrones. Escanea una tienda Last War para clasificar ofertas y precios visibles.",honorBp:"Plano de equipo legendario",campaignEx:"Fragmentos universales de arma exclusiva",allianceHero:"Fragmentos UR / héroe prioritario",allianceDrone:"Piezas y componentes de Dron",vipStamina:"Energía de tienda VIP",speed:"Aceleradores de investigación/construcción",shield:"Escudo antes de combate / VS",paidExclusive:"Pack dirigido de arma exclusiva",paidGear:"Pack dirigido de planos/equipo",paidDrone:"Pack dirigido de Dron",resources:"Packs de recursos genéricos",reasonBlueprint:"Recurso raro y duradero para el equipo: prioridad muy alta en la Tienda de Honor.",reasonExclusive:t=>`El mayor hueco visible está en armas exclusivas. Concentra fragmentos en ${t||"el héroe prioritario"}.`,reasonHero:t=>`Prioriza solo si ${t||"un héroe principal"} necesita el siguiente nivel de estrellas.`,reasonDrone:"Buena compra después de cerrar huecos principales de héroes, armas exclusivas y equipo.",reasonStamina:"Buen valor semanal para eventos y campaña.",reasonSpeed:"Útil con un objetivo activo de investigación/construcción o para el día VS correcto.",reasonShield:"Situacional: útil antes de combate/VS.",reasonPaid:t=>`Si gastas, compra solo un pack que resuelva directamente el cuello de botella ${t}.`,reasonResource:"Los recursos genéricos suelen conseguirse jugando; baja prioridad frente a objetos raros.",reasonVisible:"Oferta visible clasificada según tu perfil y el tipo de objeto detectado.",target:"Objetivo"},
  de:{buy:"Kaufen",consider:"Bei Überschuss",skip:"Auslassen",scanSummary:(store,n)=>`Shop gescannt: ${store}. WarBoost hat ${n} sichtbare Angebote nach deinem echten Kontobedarf bewertet.`,rulesSummary:"Die Empfehlungen werden aus deinen Trupps berechnet. Scanne einen Last-War-Shop, um sichtbare Angebote und Preise zu bewerten.",honorBp:"Legendärer Ausrüstungsbauplan",campaignEx:"Universelle Exklusivwaffen-Fragmente",allianceHero:"UR-/Prioritätsheld-Fragmente",allianceDrone:"Drohnen-Teile & Komponenten",vipStamina:"VIP-Shop Ausdauer",speed:"Forschungs-/Bau-Beschleuniger",shield:"Schild vor Kampf / VS",paidExclusive:"Gezieltes Exklusivwaffen-Paket",paidGear:"Gezieltes Ausrüstungs-/Bauplan-Paket",paidDrone:"Gezieltes Drohnen-Paket",resources:"Allgemeine Ressourcenpakete",reasonBlueprint:"Seltene, dauerhafte Ausrüstungsressource: sehr hohe Priorität im Ehren-Shop.",reasonExclusive:t=>`Die größte sichtbare Lücke liegt bei Exklusivwaffen. Fragmente auf ${t||"den Prioritätshelden"} konzentrieren.`,reasonHero:t=>`Nur priorisieren, wenn ${t||"ein Hauptheld"} noch den nächsten Sternschritt braucht.`,reasonDrone:"Gut nach den wichtigsten Helden-, Exklusivwaffen- und Ausrüstungslücken.",reasonStamina:"Guter Wochenwert für Events und Kampagne.",reasonSpeed:"Nützlich bei aktivem Forschungs-/Bauziel oder am passenden VS-Tag.",reasonShield:"Situativ vor Kampf/VS nützlich.",reasonPaid:t=>`Bei Echtgeld nur Pakete kaufen, die den Engpass ${t} direkt lösen.`,reasonResource:"Allgemeine Ressourcen sind ersetzbar und stehen hinter seltenen Fortschrittsobjekten.",reasonVisible:"Sichtbares Angebot anhand deines WarBoost-Profils bewertet.",target:"Ziel"},
  ja:{buy:"優先購入",consider:"余裕があれば",skip:"見送り",scanSummary:(store,n)=>`ショップ解析：${store}。表示中の${n}件をアカウントの実際の不足に合わせて順位付けしました。`,rulesSummary:"部隊データから購入優先度を計算。ショップをスキャンすると表示中の商品と価格を直接評価できます。",honorBp:"レジェンダリー装備設計図",campaignEx:"万能専用武器欠片",allianceHero:"UR／優先英雄の欠片",allianceDrone:"ドローン部品・コンポーネント",vipStamina:"VIPショップ体力",speed:"研究／建造加速",shield:"戦闘・VS前のシールド",paidExclusive:"専用武器ターゲットパック",paidGear:"装備／設計図ターゲットパック",paidDrone:"ドローンターゲットパック",resources:"汎用資源パック",reasonBlueprint:"装備強化の希少で長期価値が高い資源。名誉ショップで高優先。",reasonExclusive:t=>`最大の不足は専用武器。${t||"優先英雄"}に欠片を集中。`,reasonHero:t=>`${t||"主力英雄"}が次の星段階を必要とする場合のみ優先。`,reasonDrone:"英雄・専用武器・装備の上位不足を埋めた後に有効。",reasonStamina:"イベントやキャンペーンに使える安定した週次価値。",reasonSpeed:"研究・建造目標やVS得点日に有効。",reasonShield:"戦闘・VS前だけ高価値。",reasonPaid:t=>`課金するなら${t}の不足を直接解消するパックだけを選択。`,reasonResource:"汎用資源はゲーム内で代替しやすく、希少素材より優先度が低い。",reasonVisible:"表示中の商品をWarBoostプロフィールに基づき評価。",target:"対象"},
  zh:{buy:"优先购买",consider:"有余量再买",skip:"跳过",scanSummary:(store,n)=>`已扫描商店：${store}。WarBoost 根据账号真实缺口对 ${n} 个可见商品排序。`,rulesSummary:"建议来自你的队伍数据。扫描 Last War 商店后可直接评估可见商品和价格。",honorBp:"传奇装备蓝图",campaignEx:"通用专属武器碎片",allianceHero:"UR / 主力英雄碎片",allianceDrone:"无人机零件与组件",vipStamina:"VIP 商店体力",speed:"科研 / 建造加速",shield:"战斗 / VS 前护盾",paidExclusive:"定向专属武器礼包",paidGear:"定向装备 / 蓝图礼包",paidDrone:"定向无人机礼包",resources:"通用资源礼包",reasonBlueprint:"装备成长的稀缺长期资源，在荣誉商店优先级很高。",reasonExclusive:t=>`当前最大可见缺口是专属武器。碎片集中给 ${t||"主力英雄"}，不要分散。`,reasonHero:t=>`仅当 ${t||"主力英雄"} 尚未达到目标星级时优先。`,reasonDrone:"在英雄、专属武器和装备主要缺口之后购买。",reasonStamina:"活动、战役和日常成长的稳定周价值。",reasonSpeed:"有科研/建造目标或正确 VS 日期时有价值。",reasonShield:"战斗/VS 前的情境购买。",reasonPaid:t=>`如需付费，只购买能直接解决 ${t} 瓶颈的礼包。`,reasonResource:"通用资源较容易通过游戏获得，优先级低于稀缺成长材料。",reasonVisible:"根据 WarBoost 账号资料对当前可见商品进行排序。",target:"目标"},
  ar:{buy:"اشترِ",consider:"عند توفر فائض",skip:"تجنب",scanSummary:(store,n)=>`تم مسح المتجر: ${store}. صنّف WarBoost ${n} عرضاً ظاهراً حسب احتياجات حسابك الفعلية.`,rulesSummary:"تُحسب النصائح من بيانات فرقك. امسح متجر Last War لتقييم العروض والأسعار الظاهرة مباشرة.",honorBp:"مخطط عتاد أسطوري",campaignEx:"شظايا سلاح حصري عامة",allianceHero:"شظايا UR / البطل ذي الأولوية",allianceDrone:"قطع ومكونات الدرون",vipStamina:"طاقة متجر VIP",speed:"تسريعات البحث/البناء",shield:"درع قبل القتال / VS",paidExclusive:"حزمة سلاح حصري مستهدفة",paidGear:"حزمة عتاد/مخططات مستهدفة",paidDrone:"حزمة درون مستهدفة",resources:"حزم موارد عامة",reasonBlueprint:"مورد نادر وطويل الأجل لتطوير العتاد؛ أولوية عالية في متجر الشرف.",reasonExclusive:t=>`أكبر فجوة ظاهرة هي السلاح الحصري. ركّز الشظايا على ${t||"البطل ذي الأولوية"}.`,reasonHero:t=>`أعطِ الأولوية فقط إذا كان ${t||"بطل الفريق الرئيسي"} يحتاج مستوى النجوم التالي.`,reasonDrone:"شراء جيد بعد سد فجوات الأبطال والأسلحة الحصرية والعتاد الأساسية.",reasonStamina:"قيمة أسبوعية جيدة للأحداث والحملة.",reasonSpeed:"مفيد مع هدف بحث/بناء نشط أو يوم VS المناسب.",reasonShield:"مفيد حسب الحاجة قبل القتال/VS.",reasonPaid:t=>`إذا دفعت، اشترِ فقط حزمة تحل مباشرة اختناق ${t}.`,reasonResource:"الموارد العامة يمكن تعويضها باللعب، لذلك أولوية أقل من المواد النادرة.",reasonVisible:"تم ترتيب العرض الظاهر وفق ملف WarBoost ونوع العنصر المكتشف.",target:"الهدف"}
};
function shopText(locale){return SHOP_TEXT[localePack(locale)]||SHOP_TEXT.en}
const SHOP_SAFETY_TEXT={
  fr:{partialLabel:"Catalogue partiel",officialLabel:"Catalogue officiel",lookFor:"À rechercher",mainGear:"Équipement de l’escouade principale",droneTarget:l=>l?`Drone Nv.${l}`:"Drone",unanalysed:"Non analysé",visibleAvailability:"Visible dans ce scan · disponibilité hors capture inconnue",officialAvailability:"Synchronisé officiellement",notVerified:"Disponibilité non vérifiée dans Last War",unknownReason:"Type d’article non reconnu avec assez de confiance : WarBoost ne donne aucune recommandation d’achat.",partialScanSummary:(store,n)=>`Catalogue partiel : ${n} offre${n>1?"s":""} visible${n>1?"s":""} scannée${n>1?"s":""} dans ${store}. WarBoost classe uniquement ce qui est visible sur cette capture ; il ne suppose pas le reste de la boutique.`,partialRulesSummary:"Catalogue partiel : WarBoost n’a pas accès à toute la boutique Last War. Les cartes ci-dessous sont des catégories à rechercher si elles apparaissent dans le jeu, pas des offres actuellement confirmées.",officialSummary:(store,n)=>`Catalogue officiel synchronisé : ${n} offre${n>1?"s":""} disponible${n>1?"s":""} dans ${store} classée${n>1?"s":""} selon ton compte.`,officialEmpty:"Catalogue officiel connecté, mais aucune offre exploitable n’est disponible dans cette réponse."},
  en:{partialLabel:"Partial catalogue",officialLabel:"Official catalogue",lookFor:"Look for",mainGear:"Main squad gear",droneTarget:l=>l?`Drone Lv.${l}`:"Drone",unanalysed:"Not analysed",visibleAvailability:"Visible in this scan · availability outside the screenshot unknown",officialAvailability:"Officially synchronized",notVerified:"Availability not verified in Last War",unknownReason:"Item type was not recognized with enough confidence, so WarBoost gives no purchase recommendation.",partialScanSummary:(store,n)=>`Partial catalogue: ${n} visible offer${n===1?"":"s"} scanned in ${store}. WarBoost ranks only what is visible in this screenshot and does not assume the rest of the shop.`,partialRulesSummary:"Partial catalogue: WarBoost cannot see the full Last War shop. The cards below are categories to look for if they appear in-game, not currently confirmed offers.",officialSummary:(store,n)=>`Official catalogue synchronized: ${n} available offer${n===1?"":"s"} in ${store}, ranked for your account.`,officialEmpty:"Official catalogue is connected, but no usable offer was returned."},
  es:{partialLabel:"Catálogo parcial",officialLabel:"Catálogo oficial",lookFor:"Buscar",mainGear:"Equipo del escuadrón principal",droneTarget:l=>l?`Dron Nv.${l}`:"Dron",unanalysed:"Sin analizar",visibleAvailability:"Visible en este escaneo · disponibilidad fuera de la captura desconocida",officialAvailability:"Sincronizado oficialmente",notVerified:"Disponibilidad no verificada en Last War",unknownReason:"No se reconoció el tipo de artículo con suficiente confianza; WarBoost no recomienda comprarlo.",partialScanSummary:(store,n)=>`Catálogo parcial: ${n} oferta${n===1?"":"s"} visible${n===1?"":"s"} escaneada${n===1?"":"s"} en ${store}. WarBoost clasifica solo lo visible y no supone el resto de la tienda.`,partialRulesSummary:"Catálogo parcial: WarBoost no ve toda la tienda Last War. Las tarjetas son categorías que buscar si aparecen en el juego, no ofertas confirmadas ahora.",officialSummary:(store,n)=>`Catálogo oficial sincronizado: ${n} oferta${n===1?"":"s"} disponible${n===1?"":"s"} en ${store}, ordenada${n===1?"":"s"} para tu cuenta.`,officialEmpty:"El catálogo oficial está conectado, pero no devolvió ninguna oferta utilizable."},
  de:{partialLabel:"Teilweiser Katalog",officialLabel:"Offizieller Katalog",lookFor:"Suchen",mainGear:"Ausrüstung des Haupttrupps",droneTarget:l=>l?`Drohne Lv.${l}`:"Drohne",unanalysed:"Nicht analysiert",visibleAvailability:"In diesem Scan sichtbar · Verfügbarkeit außerhalb des Screenshots unbekannt",officialAvailability:"Offiziell synchronisiert",notVerified:"Verfügbarkeit in Last War nicht bestätigt",unknownReason:"Der Artikeltyp wurde nicht sicher genug erkannt; WarBoost gibt keine Kaufempfehlung.",partialScanSummary:(store,n)=>`Teilweiser Katalog: ${n} sichtbare${n===1?"s":""} Angebot${n===1?"":"e"} in ${store} gescannt. WarBoost bewertet nur das Sichtbare und nimmt den Rest des Shops nicht an.`,partialRulesSummary:"Teilweiser Katalog: WarBoost sieht nicht den vollständigen Last-War-Shop. Die Karten sind Kategorien, nach denen du suchen kannst, keine aktuell bestätigten Angebote.",officialSummary:(store,n)=>`Offizieller Katalog synchronisiert: ${n} verfügbare Angebot${n===1?"":"e"} in ${store} für dein Konto bewertet.`,officialEmpty:"Der offizielle Katalog ist verbunden, hat aber kein nutzbares Angebot geliefert."},
  ja:{partialLabel:"部分カタログ",officialLabel:"公式カタログ",lookFor:"探す",mainGear:"主力部隊の装備",droneTarget:l=>l?`ドローン Lv.${l}`:"ドローン",unanalysed:"未解析",visibleAvailability:"このスキャンで表示 · 画像外の在庫は不明",officialAvailability:"公式同期済み",notVerified:"Last War内の在庫未確認",unknownReason:"商品タイプを十分な信頼度で認識できないため、WarBoostは購入を推奨しません。",partialScanSummary:(store,n)=>`部分カタログ：${store}で表示されている${n}件をスキャン。WarBoostは画像に見える商品だけを評価し、ショップ全体を推測しません。`,partialRulesSummary:"部分カタログ：WarBoostはLast Warショップ全体を参照できません。以下はゲーム内に表示された場合に探すカテゴリで、現在の販売を示すものではありません。",officialSummary:(store,n)=>`公式カタログ同期：${store}の利用可能な${n}件をアカウントに合わせて評価しました。`,officialEmpty:"公式カタログは接続済みですが、利用できる商品が返されませんでした。"},
  zh:{partialLabel:"部分目录",officialLabel:"官方目录",lookFor:"寻找",mainGear:"主队装备",droneTarget:l=>l?`无人机 Lv.${l}`:"无人机",unanalysed:"未分析",visibleAvailability:"本次扫描可见 · 截图外是否可购买未知",officialAvailability:"官方同步",notVerified:"未在 Last War 中验证是否可用",unknownReason:"商品类型识别置信度不足，因此 WarBoost 不提供购买建议。",partialScanSummary:(store,n)=>`部分目录：已扫描 ${store} 中可见的 ${n} 个商品。WarBoost 只对截图中实际可见内容排序，不推测商店其余内容。`,partialRulesSummary:"部分目录：WarBoost 目前无法查看完整 Last War 商店。以下卡片只是游戏中出现时可关注的类别，并不表示当前正在出售。",officialSummary:(store,n)=>`官方目录已同步：${store} 中 ${n} 个可用商品已根据你的账号排序。`,officialEmpty:"官方目录已连接，但本次没有返回可用商品。"},
  ar:{partialLabel:"كتالوج جزئي",officialLabel:"كتالوج رسمي",lookFor:"ابحث عنه",mainGear:"معدات الفريق الرئيسي",droneTarget:l=>l?`الدرون Lv.${l}`:"الدرون",unanalysed:"غير محلل",visibleAvailability:"ظاهر في هذا المسح · التوفر خارج الصورة غير معروف",officialAvailability:"متزامن رسمياً",notVerified:"التوفر غير مؤكد داخل Last War",unknownReason:"لم يتم التعرف على نوع العنصر بثقة كافية، لذلك لا يقدم WarBoost توصية شراء.",partialScanSummary:(store,n)=>`كتالوج جزئي: تم مسح ${n} عرض ظاهر في ${store}. يصنّف WarBoost ما يظهر في الصورة فقط ولا يفترض بقية المتجر.`,partialRulesSummary:"كتالوج جزئي: لا يستطيع WarBoost رؤية متجر Last War بالكامل. البطاقات أدناه فئات للبحث عنها إذا ظهرت داخل اللعبة وليست عروضاً مؤكدة حالياً.",officialSummary:(store,n)=>`تمت مزامنة الكتالوج الرسمي: تم تصنيف ${n} عرض متاح في ${store} حسب حسابك.`,officialEmpty:"الكتالوج الرسمي متصل، لكن لم يتم إرجاع عرض قابل للاستخدام."}
};
function shopSafetyText(locale){return SHOP_SAFETY_TEXT[localePack(locale)]||SHOP_SAFETY_TEXT.en}
const SHOP_STORES={fr:{honor:"Boutique Honneur",campaign:"Boutique Campagne",alliance:"Boutique Alliance",vip:"Boutique VIP",paid:"Boutique payante",allianceCampaign:"Alliance / Campagne",vipAlliance:"VIP / Alliance",allianceDiamond:"Alliance / Diamants",diamondPaid:"Diamants / boutique payante"},en:{honor:"Honor Shop",campaign:"Campaign Store",alliance:"Alliance Store",vip:"VIP Shop",paid:"Paid shop",allianceCampaign:"Alliance / Campaign",vipAlliance:"VIP / Alliance",allianceDiamond:"Alliance / Diamond",diamondPaid:"Diamond / paid shop"},es:{honor:"Tienda de Honor",campaign:"Tienda de Campaña",alliance:"Tienda de Alianza",vip:"Tienda VIP",paid:"Tienda de pago",allianceCampaign:"Alianza / Campaña",vipAlliance:"VIP / Alianza",allianceDiamond:"Alianza / Diamantes",diamondPaid:"Diamantes / tienda de pago"},de:{honor:"Ehren-Shop",campaign:"Kampagnen-Shop",alliance:"Allianz-Shop",vip:"VIP-Shop",paid:"Bezahl-Shop",allianceCampaign:"Allianz / Kampagne",vipAlliance:"VIP / Allianz",allianceDiamond:"Allianz / Diamanten",diamondPaid:"Diamanten / Bezahl-Shop"},ja:{honor:"名誉ショップ",campaign:"キャンペーンショップ",alliance:"同盟ショップ",vip:"VIPショップ",paid:"課金ショップ",allianceCampaign:"同盟 / キャンペーン",vipAlliance:"VIP / 同盟",allianceDiamond:"同盟 / ダイヤ",diamondPaid:"ダイヤ / 課金ショップ"},zh:{honor:"荣誉商店",campaign:"战役商店",alliance:"联盟商店",vip:"VIP 商店",paid:"付费商店",allianceCampaign:"联盟 / 战役",vipAlliance:"VIP / 联盟",allianceDiamond:"联盟 / 钻石",diamondPaid:"钻石 / 付费商店"},ar:{honor:"متجر الشرف",campaign:"متجر الحملة",alliance:"متجر التحالف",vip:"متجر VIP",paid:"المتجر المدفوع",allianceCampaign:"التحالف / الحملة",vipAlliance:"VIP / التحالف",allianceDiamond:"التحالف / الألماس",diamondPaid:"الألماس / المتجر المدفوع"}};
function shopStores(locale){return SHOP_STORES[localePack(locale)]||SHOP_STORES.en}
function heroNeedSnapshot(state){
  const squads=Array.from({length:4},(_,i)=>state?.squads?.[i]||{heroes:[]});
  const selected=selectPrimarySquad({squads});
  const main=selected?{s:selected.s,i:selected.i,p:num(selected.s?.power)}:null;
  const sq=main?.s||{heroes:[]},weapons=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[];
  const weaponLevel=n=>num(weapons.find(w=>canonicalHeroName(w?.hero_name).toLowerCase()===canonicalHeroName(n).toLowerCase())?.level);
  const heroes=(sq.heroes||[]).filter(heroConfigured).map((h,i)=>({name:canonicalHeroName(h?.name)||`Hero ${i+1}`,stars:num(h?.stars),level:num(h?.level),exclusive:weaponLevel(h?.name)??metric(h?.exclusive),gear:gearMetric(h?.gear),gear_text:cleanName(h?.gear)}));
  const starTargets=heroes.filter(h=>h.stars!==null&&h.stars<5).sort((a,b)=>a.stars-b.stars);
  const exKnown=heroes.filter(h=>h.exclusive!==null),typeCounts={aircraft:0,tank:0,missile:0};
  for(const h of heroes){const t=heroType(h.name);if(t)typeCounts[t]++}
  const typeRows=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]),squadType=typeRows[0]?.[1]>=3?typeRows[0][0]:null;
  const exTargets=exKnown.map(h=>({...h,next_breakpoint:nextKnownExBreakpoint(h.exclusive)})).filter(h=>h.next_breakpoint!==null).sort((a,b)=>exPriorityScore(b.name,squadType,b.exclusive,b.next_breakpoint)-exPriorityScore(a.name,squadType,a.exclusive,a.next_breakpoint)||(a.exclusive-b.exclusive));
  const gearKnown=heroes.filter(h=>h.gear!==null),gearMax=gearKnown.length?Math.max(...gearKnown.map(h=>h.gear)):null;
  const gearTargets=gearKnown.filter(h=>h.gear<40||(gearMax!==null&&gearMax-h.gear>=3)).sort((a,b)=>a.gear-b.gear);
  const levelKnown=heroes.filter(h=>h.level!==null),levelMax=levelKnown.length?Math.max(...levelKnown.map(h=>h.level)):null;
  const levelTargets=levelKnown.filter(h=>levelMax!==null&&levelMax-h.level>=3);
  const maxExGap=exTargets.length?Math.max(...exTargets.map(h=>h.next_breakpoint-h.exclusive)):0;
  const exclusiveUrgency=!exKnown.length?.35:!exTargets.length?.22:Math.min(1,.68+Math.min(20,maxExGap)/20*.28);
  const starsUrgency=starTargets.length?Math.min(1,.72+starTargets.length*.07):.12;
  const at40=gearKnown.filter(h=>h.gear>=40).length;
  const gearUrgency=gearTargets.length?Math.min(1,.7+gearTargets.length*.06):(at40>=3?.58:gearKnown.length?.42:.3);
  const droneLevel=num(state?.drone?.level),droneKnown=droneLevel!==null||num(state?.drone?.power_m)!==null;
  const droneUrgency=!droneKnown?.38:droneLevel===null?.55:droneLevel<100?.9:droneLevel<150?.76:droneLevel<200?.64:.52;
  return {main_squad:(main?.i??0)+1,heroes,squadType,starTargets,exTargets,gearTargets,levelTargets,needExclusive:exTargets.length>0,needStars:starTargets.length>0,needGear:gearTargets.length>0,needLevel:levelTargets.length>0,exclusiveUrgency,starsUrgency,gearUrgency,droneUrgency,droneKnown,droneLevel,gearKnownCount:gearKnown.length,exclusiveKnownCount:exKnown.length,exclusiveDataComplete:heroes.length>0&&exKnown.length===heroes.length};
}

// V2.5.19: the shop must consume the SAME exclusive-weapon ranking that Diagnostic PRO displays.
// heroNeedSnapshot remains the fallback when no current Diagnostic PRO comparison is available.
function alignShopNeedsWithDiagnostic(needs,analysis={}){
  const base={...needs},existing=Array.isArray(needs?.exTargets)?needs.exTargets:[],byHero=new Map(existing.map(x=>[canonicalHeroName(x?.name).toLowerCase(),x]));
  const ranked=(Array.isArray(analysis?.exclusive_comparison?.heroes)?analysis.exclusive_comparison.heroes:[])
    .filter(x=>Number.isFinite(Number(x?.exclusive_rank))&&Number(x.exclusive_rank)>0)
    .sort((a,b)=>Number(a.exclusive_rank)-Number(b.exclusive_rank));
  const aligned=[];
  for(const row of ranked){
    const name=canonicalHeroName(row?.hero),key=name.toLowerCase();if(!name)continue;
    const known=byHero.get(key);
    if(known){aligned.push(known);byHero.delete(key);continue}
    const current=num(row?.current),target=num(String(row?.next_target||'').replace(/[^0-9.]/g,''));
    if(current!==null&&target!==null)aligned.push({name,exclusive:current,next_breakpoint:target});
  }
  for(const x of existing)if(byHero.has(canonicalHeroName(x?.name).toLowerCase())){aligned.push(x);byHero.delete(canonicalHeroName(x?.name).toLowerCase())}
  if(aligned.length)base.exTargets=aligned;
  base.diagnostic_ex_source=aligned.length?'diagnostic_pro_exclusive_comparison':'fallback_need_snapshot';
  base.diagnostic_ex_ranked_heroes=aligned.map(x=>canonicalHeroName(x?.name)).filter(Boolean);
  return base;
}
function shopGearTargetLabel(needs,locale){
  const first=Array.isArray(needs?.gearTargets)?needs.gearTargets[0]:null,l=localePack(locale),sq=Number(needs?.main_squad)||1;
  if(first?.name){const lv=num(first?.gear);return l==='fr'?`${first.name}${lv!==null?` · équipement Nv.${lv}`:''}`:l==='es'?`${first.name}${lv!==null?` · equipo Nv.${lv}`:''}`:l==='de'?`${first.name}${lv!==null?` · Ausrüstung Lv.${lv}`:''}`:l==='ja'?`${first.name}${lv!==null?` · 装備Lv.${lv}`:''}`:l==='zh'?`${first.name}${lv!==null?` · 装备Lv.${lv}`:''}`:l==='ar'?`${first.name}${lv!==null?` · معدات Lv.${lv}`:''}`:`${first.name}${lv!==null?` · gear Lv.${lv}`:''}`;}
  return l==='fr'?`Escouade ${sq} · équipement principal à confirmer`:l==='es'?`Escuadrón ${sq} · equipo principal por confirmar`:l==='de'?`Trupp ${sq} · Hauptausrüstung noch zu bestätigen`:l==='ja'?`部隊${sq} · 主力装備は要確認`:l==='zh'?`队伍${sq} · 主力装备待确认`:l==='ar'?`الفريق ${sq} · المعدات الرئيسية تحتاج تأكيد`:`Squad ${sq} · main gear target to confirm`;
}
function shopTargetReason(category,target,locale){
  if(!target||!["blueprint","gear_material"].includes(String(category||"")))return "";
  const l=localePack(locale),unknown=/confirmer|confirm|bestätigen|要確認|待确认|تأكيد|verificar/i.test(String(target));
  if(l==='fr')return unknown?`Cible équipement exacte non confirmée : ${target}. Un nouveau scan peut préciser le héros et l’équipement.`:`Cible équipement actuelle : ${target}.`;
  if(l==='es')return unknown?`Objetivo exacto de equipo sin confirmar: ${target}. Un nuevo escaneo puede precisar héroe y equipo.`:`Objetivo de equipo actual: ${target}.`;
  if(l==='de')return unknown?`Genaues Ausrüstungsziel nicht bestätigt: ${target}. Ein neuer Scan kann Held und Ausrüstung präzisieren.`:`Aktuelles Ausrüstungsziel: ${target}.`;
  if(l==='ja')return unknown?`正確な装備対象は未確認です：${target}。再スキャンで英雄と装備を特定できます。`:`現在の装備対象：${target}。`;
  if(l==='zh')return unknown?`具体装备目标尚未确认：${target}。重新扫描可进一步确定英雄和装备。`:`当前装备目标：${target}。`;
  if(l==='ar')return unknown?`هدف العتاد الدقيق غير مؤكد: ${target}. يمكن لمسح جديد تحديد البطل والعتاد.`:`هدف العتاد الحالي: ${target}.`;
  return unknown?`Exact gear target not confirmed: ${target}. A fresh scan can identify the hero and gear.`:`Current gear target: ${target}.`;
}

function normItem(v){return cleanName(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
const KNOWN_SHOP_CATEGORIES=new Set(["vip_time","blueprint","exclusive","hero","drone","stamina","armament","skill","speed_heal","speed_research","speed_build","speed_train","speed","shield","teleport","campaign_chest","resource","cosmetic","chest","monthly_pass","training","overlord","badge_value","gear_material","armament_material","decoration_component","superalloy","season_skill","profession","hero_recruit","survivor","trade","transfer","combat_data","event_pack","diamond_topup","gold_brick"]);
function itemCategory(name,explicitCategory="",store=""){const explicit=normItem(explicitCategory).replace(/\s+/g,"_");if(KNOWN_SHOP_CATEGORIES.has(explicit))return explicit;const ref=referenceCategoryForItem(name,store);if(ref)return ref;const s=normItem(`${name||""} ${explicitCategory||""}`);
  if(/vip.*(30|day|jour|dia|tag|日)|30.*vip|vip.*time|vip.*temps|vip.*zeit/.test(s))return "vip_time";
  if(/mythic.*blueprint|mythical.*blueprint|legendary.*blueprint|blueprint|plan.*equip|equip.*plan|equip.*blueprint|memoire.*equip|装備.*レシピ|装备.*蓝图/.test(s))return "blueprint";
  if(/exclusive.*weapon|weapon.*shard|arme.*exclusive|fragment.*arme|专属武器|専用武器/.test(s))return "exclusive";
  if(/universal.*(legendary|ur).*shard|ur.*shard|golden.*shard|fragment.*ur|hero.*shard|英雄.*碎片/.test(s))return "hero";
  if(/drone.*(chip|component|part|gear)|component.*drone|part.*drone|piece.*drone|drone|drohne|dron|无人机|ドローン|درون/.test(s))return "drone";
  if(/stamina|endurance|\bap\b|energie|energy|体力|طاقة/.test(s))return "stamina";
  if(/armament|兵装|overlord|bond badge|badge.*bond|连携|連携/.test(s))return "armament";
  if(/skill.*chip|chip.*skill|skill.*medal|medaille.*compet|技能.*芯片|スキル.*チップ/.test(s))return "skill";
  if(/healing.*speed|heal.*speed|soin.*acceler|加速.*治疗/.test(s))return "speed_heal";
  if(/research.*speed|science.*speed|recherche.*acceler|forsch.*beschleun|研究.*加速/.test(s))return "speed_research";
  if(/construct.*speed|build.*speed|construction.*acceler|bau.*beschleun|建造.*加速/.test(s))return "speed_build";
  if(/train.*speed|training.*speed|entrain.*acceler|ausbild.*beschleun|训练.*加速/.test(s))return "speed_train";
  if(/speed|acceler|beschleun|加速|تسريع/.test(s))return "speed";
  if(/shield|bouclier|schild|护盾|シールド|درع/.test(s))return "shield";
  if(/teleport|teleporteur|teleporter|迁城|テレポート/.test(s))return "teleport";
  if(/campaign.*chest|coffre.*campagne|expedition.*chest|远征.*宝箱|遠征.*宝箱/.test(s))return "campaign_chest";
  if(/resource|ressource|gold|iron|fer|food|nourriture|coin|pieces|资源|資源|موارد/.test(s))return "resource";
  if(/decor|skin|cosmetic|decoration|装饰|スキン/.test(s))return "cosmetic";
  if(/chest|coffre|宝箱|ボックス/.test(s))return "chest";
  return "other";
}
function storeKind(v){const canonical=canonicalShopStore(v),s=normItem(canonical||v);if(/honor|honneur|ehre|荣誉|名誉|الشرف/.test(s))return "honor";if(/campaign|campagne|战役|キャンペーン|الحملة/.test(s))return "campaign";if(/alliance|allianz|联盟|同盟|التحالف/.test(s))return "alliance";if(/vip/.test(s))return "vip";if(/diamond|diamant|diamante|钻石|ダイヤ|ألماس/.test(s))return "diamond";if(/season|saison|temporada|赛季|シーズン|الموسم/.test(s))return "season";if(/cosmetic|cosmetique|kosmetik|装饰|コスメ/.test(s))return "cosmetics";if(/coupon|coupons/.test(s))return "coupons";if(/centre commercial|bons plans|mobilisation|pass|hebdomadaire|mensuel|promotion|brique/.test(s))return "paid";return "other";}
function currencyKey(v){const s=normItem(v).replace(/[’']/g," ");if(!s)return "";if(/diamond|diamant|钻石|ダイヤ|الماس/.test(s))return "diamonds";if(/honor|honneur|medaille.*honneur|荣誉|名誉/.test(s))return "honor_medals";if(/campaign|campagne/.test(s))return "campaign_points";if(/alliance|联盟|同盟/.test(s))return "alliance_coins";if(/season|saison/.test(s))return "season_tokens";if(/coupon/.test(s))return "coupons";if(/cosmetic|cosmetique/.test(s))return "cosmetic_tokens";if(/eur|euro|€/.test(s))return "EUR";if(/usd|\$/.test(s))return "USD";return cleanName(v);}
function expectedCurrencyForStore(store){return ({honor:"honor_medals",campaign:"campaign_points",alliance:"alliance_coins",vip:"diamonds",diamond:"diamonds",season:"season_tokens",cosmetics:"cosmetic_tokens",coupons:"coupons"})[storeKind(store)]||null;}
function normalizedObservedItemKey(o){const ref=findShopReference(o?.item_name,o?._store_type||o?.store_type||o?.store);return normItem(ref?.item||o?.item_name).replace(/[^a-z0-9À-￿]+/g," ").trim();}
function normalizeObservedCurrency(o){const expected=expectedCurrencyForStore(o?._store_type||o?.store_type||o?.store),read=currencyKey(o?._currency||o?.currency);if(expected)return {currency:expected,normalized:read!==expected,expected,read};return {currency:read||cleanName(o?._currency||o?.currency),normalized:false,expected:null,read};}
const VIP30_REFERENCE_POLICY=Object.freeze({
  diamonds:10000,
  days:30,
  checked_at:"2026-08-30",
  evidence_kind:"public-community-cross-check",
  live_verified:false,
  requires_in_game_check:true,
  sources:["Last War Vault VIP Guide","LastWarTutorial VIP Program","LDShop Last War VIP Guide"]
});
const SHOP_EVIDENCE_TEXT={
  fr:{relevance:n=>`Pertinence ${n}/100`,data:n=>`Confiance données ${n}%`,reserve:n=>`Référence croisée au 30/08/2026 : VIP 30 jours observé à ${n.toLocaleString("fr-FR")} diamants. Vérifie le coût actuel dans Last War avant achat.`},
  en:{relevance:n=>`Relevance ${n}/100`,data:n=>`Data confidence ${n}%`,reserve:n=>`Cross-checked reference on 2026-08-30: 30-day VIP observed at ${n.toLocaleString("en-GB")} diamonds. Check the current in-game cost before buying.`},
  es:{relevance:n=>`Relevancia ${n}/100`,data:n=>`Confianza de datos ${n}%`,reserve:n=>`Referencia cruzada del 30/08/2026: VIP de 30 días observado a ${n.toLocaleString("es-ES")} diamantes. Verifica el coste actual en el juego antes de comprar.`},
  de:{relevance:n=>`Relevanz ${n}/100`,data:n=>`Datenvertrauen ${n}%`,reserve:n=>`Abgeglichen am 30.08.2026: 30 Tage VIP wurden mit ${n.toLocaleString("de-DE")} Diamanten beobachtet. Prüfe vor dem Kauf den aktuellen Preis im Spiel.`},
  ja:{relevance:n=>`関連度 ${n}/100`,data:n=>`データ信頼度 ${n}%`,reserve:n=>`2026/08/30照合済み参照：30日VIPはダイヤ${n.toLocaleString("ja-JP")}で確認。購入前にゲーム内の現在価格を確認してください。`},
  zh:{relevance:n=>`相关度 ${n}/100`,data:n=>`数据置信度 ${n}%`,reserve:n=>`2026-08-30交叉核对参考：30天VIP曾显示为 ${n.toLocaleString("zh-CN")} 钻石。购买前请在游戏内确认当前价格。`},
  ar:{relevance:n=>`الملاءمة ${n}/100`,data:n=>`ثقة البيانات ${n}%`,reserve:n=>`مرجع تمت مراجعته في 2026-08-30: شوهد VIP لمدة 30 يوماً بسعر ${n.toLocaleString("ar")} ألماسة. تحقق من السعر الحالي داخل اللعبة قبل الشراء.`}
};
function shopEvidenceText(locale){return SHOP_EVIDENCE_TEXT[localePack(locale)]||SHOP_EVIDENCE_TEXT.en;}
function shopSourceConfidence(source,freshnessStatus="unknown"){
  if(source==="official")return 98;
  if(source==="scan")return freshnessStatus==="fresh"?94:freshnessStatus==="aging"?84:72;
  if(source==="reference")return 68;
  return 52;
}
function shopAvailabilityStatus(source){return source==="official"?"official_current":source==="scan"?"observed_scan":source==="reference"?"reference_unverified":"strategy_unverified";}
function decorateShopRecommendation(rec,profileConfidence,locale){
  const src=String(rec?.source||"strategy"),fresh=rec?.data_freshness?.status||"unknown",sourceConfidence=shopSourceConfidence(src,fresh),dataConfidence=Math.max(0,Math.min(sourceConfidence,Number(profileConfidence)||0)),e=shopEvidenceText(locale),relevance=rec?.score===null||rec?.score===undefined?null:(Number.isFinite(Number(rec.score))?Math.round(Number(rec.score)):null),currency=rec?.currency||rec?.budget?.currency||"",guard=rec?.paid_guard||paidPurchaseGuard({source:src,currency,price:rec?.budget?.price,current_price_verified:rec?.current_price_verified,current_contents_verified:rec?.current_contents_verified,cost_gain_verified:rec?.cost_gain_verified},locale);
  return {...rec,currency,purchase_type:guard.purchase_type,purchase_type_label:guard.purchase_type_label,paid_guard:guard,relevance_score:relevance,relevance_label:relevance===null?null:e.relevance(relevance),source_confidence:sourceConfidence,evidence_confidence:dataConfidence,evidence_confidence_label:e.data(dataConfidence),availability_status:shopAvailabilityStatus(src),availability_live_verified:src==="official",availability_observed:src==="official"||src==="scan"};
}
const ADAPTIVE_TEXT={
  fr:{score:n=>shopEvidenceText("fr").relevance(n),reserve:n=>shopEvidenceText("fr").reserve(n),lowBudget:"Cet achat ferait passer tes diamants sous la réserve de référence VIP. Vérifie le coût actuel en jeu.",unknownBudget:"Solde de diamants non lu : WarBoost ne pénalise pas la pertinence, mais conserve la réserve VIP comme référence datée à vérifier en jeu.",vs:d=>`Contexte VS jour ${d} pris en compte.`,allStars:"Tes héros principaux visibles sont déjà à 5★ : les fragments héros génériques perdent fortement en priorité.",exFirst:t=>`Armes exclusives encore en retrait${t?` (${t})`:""} : évite de disperser les ressources rares.`,notAffordable:"Solde visible insuffisant pour cette offre.",realMoney:"Achat en argent réel : WarBoost limite volontairement la recommandation tant que le gain n'est pas ciblé.",budgetOk:"Le solde visible reste au-dessus de la réserve diamants après achat."},
  en:{score:n=>shopEvidenceText("en").relevance(n),reserve:n=>shopEvidenceText("en").reserve(n),lowBudget:"This purchase would take your diamonds below the dated VIP reference reserve. Check the current in-game cost.",unknownBudget:"Diamond balance was not read: relevance is not penalized, but the VIP reserve remains a dated reference that must be checked in game.",vs:d=>`VS Day ${d} context included.`,allStars:"Your visible main heroes are already 5★, so generic hero shards lose a lot of priority.",exFirst:t=>`Exclusive weapons still lag${t?` (${t})`:""}; avoid spreading rare resources.`,notAffordable:"Visible balance is insufficient for this offer.",realMoney:"Real-money purchase: WarBoost deliberately caps the recommendation unless the gain is targeted.",budgetOk:"Visible balance remains above the diamond reserve after purchase."},
  es:{score:n=>shopEvidenceText("es").relevance(n),reserve:n=>shopEvidenceText("es").reserve(n),lowBudget:"Esta compra dejaría tus diamantes por debajo de la reserva VIP de referencia fechada. Verifica el coste actual en el juego.",unknownBudget:"No se leyó el saldo de diamantes; la relevancia no se penaliza, pero la reserva VIP sigue siendo una referencia fechada que debe verificarse en el juego.",vs:d=>`Contexto VS día ${d} incluido.`,allStars:"Tus héroes principales visibles ya están en 5★: los fragmentos genéricos pierden prioridad.",exFirst:t=>`Las armas exclusivas siguen atrasadas${t?` (${t})`:""}; evita dispersar recursos raros.`,notAffordable:"El saldo visible no alcanza para esta oferta.",realMoney:"Compra con dinero real: WarBoost limita la recomendación si la mejora no es específica.",budgetOk:"El saldo visible queda por encima de la reserva de diamantes."},
  de:{score:n=>shopEvidenceText("de").relevance(n),reserve:n=>shopEvidenceText("de").reserve(n),lowBudget:"Dieser Kauf würde die Diamanten unter die datierte VIP-Referenzreserve drücken. Prüfe den aktuellen Preis im Spiel.",unknownBudget:"Diamantenstand nicht gelesen; die Relevanz wird nicht bestraft, aber die VIP-Reserve bleibt eine datierte Referenz, die im Spiel geprüft werden muss.",vs:d=>`VS-Tag ${d} berücksichtigt.`,allStars:"Die sichtbaren Haupthelden sind bereits 5★; allgemeine Heldensplitter verlieren Priorität.",exFirst:t=>`Exklusivwaffen liegen noch zurück${t?` (${t})`:""}; seltene Ressourcen nicht verteilen.`,notAffordable:"Der sichtbare Bestand reicht für dieses Angebot nicht aus.",realMoney:"Echtgeldkauf: WarBoost begrenzt die Empfehlung ohne klar gezielten Fortschritt.",budgetOk:"Der sichtbare Bestand bleibt nach dem Kauf über der Diamantenreserve."},
  ja:{score:n=>shopEvidenceText("ja").relevance(n),reserve:n=>shopEvidenceText("ja").reserve(n),lowBudget:"購入後のダイヤが日付付きVIP参照予備を下回ります。現在価格をゲーム内で確認してください。",unknownBudget:"ダイヤ残高は未読です。関連度は減点しませんが、VIP予備はゲーム内確認が必要な日付付き参照として扱います。",vs:d=>`VS ${d}日目の状況を反映。`,allStars:"主力の表示英雄はすでに5★のため、汎用英雄欠片の優先度は大きく下がります。",exFirst:t=>`専用武器がまだ不足${t?` (${t})`:""}。希少素材を分散しないでください。`,notAffordable:"表示残高では購入できません。",realMoney:"課金商品は、明確なボトルネック解消でない限り評価を上限設定します。",budgetOk:"購入後もダイヤ予備を維持できます。"},
  zh:{score:n=>shopEvidenceText("zh").relevance(n),reserve:n=>shopEvidenceText("zh").reserve(n),lowBudget:"购买后钻石会低于带日期的VIP参考预留。请在游戏内确认当前价格。",unknownBudget:"未读取钻石余额；相关度不扣减，但VIP预留仅作为需在游戏内确认的带日期参考。",vs:d=>`已纳入VS第${d}天情境。`,allStars:"可见主力英雄均已5★，通用英雄碎片优先度大幅下降。",exFirst:t=>`专属武器仍落后${t?`（${t}）`:""}；不要分散稀缺资源。`,notAffordable:"可见余额不足以购买该商品。",realMoney:"真钱购买：若不能直接解决瓶颈，WarBoost会限制推荐等级。",budgetOk:"购买后可见余额仍高于钻石预留。"},
  ar:{score:n=>shopEvidenceText("ar").relevance(n),reserve:n=>shopEvidenceText("ar").reserve(n),lowBudget:"سيخفض هذا الشراء الألماس تحت احتياطي VIP المرجعي المؤرخ. تحقق من السعر الحالي داخل اللعبة.",unknownBudget:"لم تتم قراءة رصيد الألماس؛ لا تُخفض الملاءمة، لكن احتياطي VIP يبقى مرجعاً مؤرخاً يجب التحقق منه داخل اللعبة.",vs:d=>`تم احتساب سياق يوم VS ${d}.`,allStars:"الأبطال الرئيسيون الظاهرون عند 5★؛ شظايا الأبطال العامة أقل أولوية.",exFirst:t=>`الأسلحة الحصرية ما زالت متأخرة${t?` (${t})`:""}؛ لا تشتت الموارد النادرة.`,notAffordable:"الرصيد الظاهر غير كافٍ لهذا العرض.",realMoney:"شراء بأموال حقيقية: يحد WarBoost التوصية ما لم يكن التقدم مستهدفاً مباشرة.",budgetOk:"يبقى الرصيد الظاهر فوق احتياطي الألماس بعد الشراء."}
};
const SHOP_ALIGNMENT_TEXT={
  fr:{verify:"À vérifier en boutique",aligned:"Aligné avec le Diagnostic PRO : cette ressource alimente directement tes priorités actuelles.",deferred:"Le Diagnostic PRO place actuellement une autre famille de ressources devant celle-ci.",rank:n=>`Correspond à la priorité ressource n°${n} du Diagnostic PRO.`,opaque:'Contenu non détaillé : WarBoost place une ressource directe et vérifiable devant ce coffre. Si son contenu est identifié plus tard, il sera reclassé.'},
  en:{verify:"Check in shop",aligned:"Aligned with PRO Diagnosis: this resource directly feeds your current priorities.",deferred:"PRO Diagnosis currently places another resource family ahead of this one.",rank:n=>`Matches resource priority #${n} from PRO Diagnosis.`,opaque:'Contents are not detailed: WarBoost ranks a direct, verifiable resource ahead of this chest. If its contents are identified later, it will be re-ranked.'},
  es:{verify:"Verificar en tienda",aligned:"Alineado con el Diagnóstico PRO: este recurso alimenta directamente tus prioridades actuales.",deferred:"El Diagnóstico PRO coloca actualmente otra familia de recursos por delante de esta.",rank:n=>`Coincide con la prioridad de recurso n.º ${n} del Diagnóstico PRO.`,opaque:'Contenido no detallado: WarBoost coloca un recurso directo y verificable por delante de este cofre. Si su contenido se identifica después, se volverá a clasificar.'},
  it:{verify:"Verifica nel negozio",aligned:"Allineato con la Diagnosi PRO: questa risorsa alimenta direttamente le tue priorità attuali.",deferred:"La Diagnosi PRO mette attualmente un'altra famiglia di risorse davanti a questa.",rank:n=>`Corrisponde alla priorità risorsa n. ${n} della Diagnosi PRO.`,opaque:'Contenuto non dettagliato: WarBoost mette una risorsa diretta e verificabile davanti a questo forziere. Se il contenuto verrà identificato, sarà riclassificato.'},
  de:{verify:"Im Shop prüfen",aligned:"Mit der PRO-Diagnose abgestimmt: Diese Ressource unterstützt direkt deine aktuellen Prioritäten.",deferred:"Die PRO-Diagnose setzt derzeit eine andere Ressourcenfamilie vor diese.",rank:n=>`Entspricht Ressourcenpriorität Nr. ${n} der PRO-Diagnose.`,opaque:'Inhalt nicht im Detail bekannt: WarBoost priorisiert eine direkte, überprüfbare Ressource vor dieser Kiste. Wenn der Inhalt später bekannt ist, wird sie neu bewertet.'},
  pt:{verify:"Verificar na loja",aligned:"Alinhado com o Diagnóstico PRO: este recurso alimenta diretamente as tuas prioridades atuais.",deferred:"O Diagnóstico PRO coloca atualmente outra família de recursos à frente desta.",rank:n=>`Corresponde à prioridade de recurso n.º ${n} do Diagnóstico PRO.`,opaque:'Conteúdo não detalhado: o WarBoost coloca um recurso direto e verificável à frente deste baú. Se o conteúdo for identificado depois, será reclassificado.'},
  nl:{verify:"In winkel controleren",aligned:"Afgestemd op de PRO-diagnose: deze grondstof ondersteunt direct je huidige prioriteiten.",deferred:"De PRO-diagnose plaatst momenteel een andere grondstoffamilie boven deze.",rank:n=>`Komt overeen met grondstofprioriteit #${n} van de PRO-diagnose.`,opaque:'Inhoud niet gespecificeerd: WarBoost zet een directe, verifieerbare grondstof vóór deze kist. Zodra de inhoud bekend is, wordt de kist opnieuw gerangschikt.'},
  zh:{verify:"在商店中确认",aligned:"与 PRO 诊断一致：该资源会直接推进你当前的优先目标。",deferred:"PRO 诊断目前将另一类资源排在此项之前。",rank:n=>`对应 PRO 诊断中的第 ${n} 资源优先级。`,opaque:'宝箱内容未明确：WarBoost 会优先选择直接且可验证的资源。若之后确认宝箱内容，将重新计算排名。'},
  ja:{verify:"ショップで確認",aligned:"PRO診断と一致：この資源は現在の優先目標を直接進めます。",deferred:"PRO診断では現在、別の資源カテゴリがこれより上位です。",rank:n=>`PRO診断の資源優先度 ${n} 位に一致します。`,opaque:'中身が未確認の箱です。WarBoostは直接かつ確認可能な資源をこの箱より優先します。中身が判明したら再評価します。'},
  ru:{verify:"Проверить в магазине",aligned:"Согласовано с PRO-диагностикой: этот ресурс напрямую продвигает текущие приоритеты.",deferred:"PRO-диагностика сейчас ставит другую группу ресурсов выше этой.",rank:n=>`Соответствует приоритету ресурсов №${n} в PRO-диагностике.`,opaque:'Содержимое не уточнено: WarBoost ставит прямой и проверяемый ресурс выше этого сундука. Если содержимое станет известно, рейтинг будет пересчитан.'},
  ar:{verify:"تحقق في المتجر",aligned:"متوافق مع تشخيص PRO: هذا المورد يدعم أولوياتك الحالية مباشرة.",deferred:"يضع تشخيص PRO حالياً فئة موارد أخرى قبل هذه الفئة.",rank:n=>`يتوافق مع أولوية الموارد رقم ${n} في تشخيص PRO.`,opaque:'محتوى الصندوق غير مفصل: يضع WarBoost المورد المباشر والقابل للتحقق قبل هذا الصندوق. إذا تم تحديد محتواه لاحقاً فسيعاد ترتيبه.'},
  pl:{verify:"Sprawdź w sklepie",aligned:"Zgodne z Diagnostyką PRO: ten zasób bezpośrednio wspiera Twoje obecne priorytety.",deferred:"Diagnostyka PRO stawia obecnie inną grupę zasobów wyżej.",rank:n=>`Odpowiada priorytetowi zasobów nr ${n} w Diagnostyce PRO.`,opaque:'Zawartość nie jest określona: WarBoost stawia bezpośredni i weryfikowalny zasób wyżej niż tę skrzynię. Po poznaniu zawartości ranking zostanie przeliczony.'},
  tr:{verify:"Mağazada kontrol et",aligned:"PRO Tanısı ile uyumlu: bu kaynak mevcut önceliklerini doğrudan ilerletir.",deferred:"PRO Tanısı şu anda başka bir kaynak grubunu bunun önüne koyuyor.",rank:n=>`PRO Tanısındaki ${n}. kaynak önceliğiyle eşleşir.`,opaque:'Sandığın içeriği ayrıntılı değil: WarBoost doğrudan ve doğrulanabilir kaynağı bu sandığın önüne koyar. İçeriği daha sonra belirlenirse yeniden sıralanır.'},
  ko:{verify:"상점에서 확인",aligned:"PRO 진단과 일치: 이 자원은 현재 우선순위를 직접 강화합니다.",deferred:"PRO 진단은 현재 다른 자원군을 이 항목보다 우선합니다.",rank:n=>`PRO 진단의 자원 우선순위 ${n}위와 일치합니다.`,opaque:'상자 내용이 명확하지 않습니다. WarBoost는 직접적이고 확인 가능한 자원을 이 상자보다 우선합니다. 내용이 확인되면 다시 순위를 계산합니다.'},
  vi:{verify:"Kiểm tra trong cửa hàng",aligned:"Phù hợp với Chẩn đoán PRO: tài nguyên này trực tiếp phục vụ các ưu tiên hiện tại của bạn.",deferred:"Chẩn đoán PRO hiện xếp một nhóm tài nguyên khác cao hơn nhóm này.",rank:n=>`Khớp với ưu tiên tài nguyên số ${n} của Chẩn đoán PRO.`,opaque:'Nội dung rương chưa được xác định rõ: WarBoost xếp tài nguyên trực tiếp và có thể kiểm chứng cao hơn rương này. Khi biết rõ nội dung, rương sẽ được xếp hạng lại.'},
  th:{verify:"ตรวจสอบในร้านค้า",aligned:"สอดคล้องกับการวิเคราะห์ PRO: ทรัพยากรนี้ช่วยเป้าหมายลำดับความสำคัญปัจจุบันโดยตรง",deferred:"การวิเคราะห์ PRO จัดทรัพยากรอีกกลุ่มไว้เหนือรายการนี้ในตอนนี้",rank:n=>`ตรงกับลำดับความสำคัญทรัพยากรอันดับ ${n} ของการวิเคราะห์ PRO`,opaque:'ยังไม่ทราบรายละเอียดของกล่อง: WarBoost จะจัดทรัพยากรที่ตรงเป้าหมายและตรวจสอบได้ไว้เหนือกล่องนี้ หากทราบของภายในภายหลังจะจัดอันดับใหม่'},
  id:{verify:"Periksa di toko",aligned:"Selaras dengan Diagnosis PRO: sumber daya ini langsung mendukung prioritasmu saat ini.",deferred:"Diagnosis PRO saat ini menempatkan kelompok sumber daya lain di atas ini.",rank:n=>`Sesuai dengan prioritas sumber daya #${n} dari Diagnosis PRO.`,opaque:'Isi peti belum dirinci: WarBoost menempatkan sumber daya langsung yang dapat diverifikasi di atas peti ini. Jika isinya diketahui nanti, peringkat akan dihitung ulang.'},
  uk:{verify:"Перевірити в магазині",aligned:"Узгоджено з PRO-діагностикою: цей ресурс безпосередньо підтримує поточні пріоритети.",deferred:"PRO-діагностика наразі ставить іншу групу ресурсів вище цієї.",rank:n=>`Відповідає пріоритету ресурсів №${n} у PRO-діагностиці.`,opaque:'Вміст не деталізовано: WarBoost ставить прямий і перевірюваний ресурс вище за цю скриню. Якщо вміст стане відомий, рейтинг буде перераховано.'},
  ro:{verify:"Verifică în magazin",aligned:"Aliniat cu Diagnosticul PRO: această resursă susține direct prioritățile tale actuale.",deferred:"Diagnosticul PRO plasează momentan o altă familie de resurse înaintea acesteia.",rank:n=>`Corespunde priorității de resurse nr. ${n} din Diagnosticul PRO.`,opaque:'Conținutul nu este detaliat: WarBoost pune o resursă directă și verificabilă înaintea acestui cufăr. Dacă îi este identificat conținutul, va fi reclasificat.'},
  el:{verify:"Έλεγχος στο κατάστημα",aligned:"Ευθυγραμμισμένο με τη Διάγνωση PRO: αυτός ο πόρος τροφοδοτεί άμεσα τις τρέχουσες προτεραιότητές σου.",deferred:"Η Διάγνωση PRO τοποθετεί αυτή τη στιγμή άλλη κατηγορία πόρων πιο ψηλά.",rank:n=>`Αντιστοιχεί στην προτεραιότητα πόρου #${n} της Διάγνωσης PRO.`,opaque:'Το περιεχόμενο δεν είναι γνωστό με λεπτομέρεια: το WarBoost βάζει έναν άμεσο και επαληθεύσιμο πόρο πάνω από αυτό το κιβώτιο. Αν το περιεχόμενο ταυτοποιηθεί, θα γίνει νέα κατάταξη.'},
  cs:{verify:"Ověřit v obchodě",aligned:"V souladu s PRO diagnostikou: tento zdroj přímo podporuje tvé aktuální priority.",deferred:"PRO diagnostika nyní řadí jinou skupinu zdrojů před tuto.",rank:n=>`Odpovídá prioritě zdrojů č. ${n} z PRO diagnostiky.`,opaque:'Obsah není podrobně znám: WarBoost řadí přímý a ověřitelný zdroj před tuto truhlu. Pokud bude obsah později znám, pořadí se přepočítá.'},
  sv:{verify:"Kontrollera i butiken",aligned:"I linje med PRO-diagnosen: den här resursen driver direkt dina nuvarande prioriteringar.",deferred:"PRO-diagnosen placerar just nu en annan resursfamilj före denna.",rank:n=>`Motsvarar resursprioritet #${n} i PRO-diagnosen.`,opaque:'Innehållet är inte specificerat: WarBoost placerar en direkt och verifierbar resurs före den här kistan. När innehållet blir känt räknas rankingen om.'}
};
function shopLocaleKey(locale){
  const x=String(locale||"en").toLowerCase();
  if(x.startsWith("fr"))return "fr";if(x.startsWith("es"))return "es";if(x.startsWith("it"))return "it";if(x.startsWith("de"))return "de";if(x.startsWith("pt"))return "pt";if(x.startsWith("nl"))return "nl";if(x.startsWith("zh"))return "zh";if(x.startsWith("ja"))return "ja";if(x.startsWith("ru"))return "ru";if(x.startsWith("ar"))return "ar";if(x.startsWith("pl"))return "pl";if(x.startsWith("tr"))return "tr";if(x.startsWith("ko"))return "ko";if(x.startsWith("vi"))return "vi";if(x.startsWith("th"))return "th";if(x.startsWith("id"))return "id";if(x.startsWith("uk"))return "uk";if(x.startsWith("ro"))return "ro";if(x.startsWith("el"))return "el";if(x.startsWith("cs"))return "cs";if(x.startsWith("sv"))return "sv";return "en";
}
function shopAlignmentText(locale){return SHOP_ALIGNMENT_TEXT[shopLocaleKey(locale)]||SHOP_ALIGNMENT_TEXT.en;}
const SHOP_SITUATIONAL_TEXT={
  fr:{deferred:"Ressource situationnelle : sans besoin confirmé par le VS, la Saison ou un événement, WarBoost la place derrière les ressources de progression directe.",matched:"Contexte confirmé : cette ressource situationnelle correspond au besoin actuel et peut remonter temporairement.",season:"Saison active : l'Endurance garde une valeur utile, mais reste derrière un goulot de progression direct sauf besoin explicite.",transfer:"Utilité de transfert non confirmée : conserve les jetons/ressources de progression avant ce type d'achat."},
  en:{deferred:"Situational resource: without a confirmed VS, Season or event need, WarBoost ranks it below direct progression resources.",matched:"Confirmed context: this situational resource matches the current need and may temporarily rank higher.",season:"Active Season: Stamina remains useful, but stays below a direct progression bottleneck unless an explicit need is detected.",transfer:"Transfer utility is not confirmed: keep progression currencies/resources ahead of this purchase."},
  es:{deferred:"Recurso situacional: sin una necesidad confirmada por VS, Temporada o evento, WarBoost lo coloca detrás de los recursos de progreso directo.",matched:"Contexto confirmado: este recurso situacional coincide con la necesidad actual y puede subir temporalmente.",season:"Temporada activa: la Energía sigue siendo útil, pero queda detrás de un cuello de botella directo salvo necesidad explícita.",transfer:"La utilidad de transferencia no está confirmada: conserva antes las monedas y recursos de progreso."},
  it:{deferred:"Risorsa situazionale: senza un bisogno confermato da VS, Stagione o evento, WarBoost la mette dietro alle risorse di progressione diretta.",matched:"Contesto confermato: questa risorsa situazionale corrisponde al bisogno attuale e può salire temporaneamente.",season:"Stagione attiva: l'Energia resta utile, ma rimane dietro a un collo di bottiglia diretto salvo bisogno esplicito.",transfer:"Utilità del trasferimento non confermata: dai priorità alle valute e risorse di progressione."},
  de:{deferred:"Situative Ressource: Ohne bestätigten VS-, Saison- oder Eventbedarf ordnet WarBoost sie hinter direkte Fortschrittsressourcen ein.",matched:"Bestätigter Kontext: Diese situative Ressource passt zum aktuellen Bedarf und kann vorübergehend höher eingestuft werden.",season:"Aktive Saison: Ausdauer bleibt nützlich, liegt aber ohne ausdrücklichen Bedarf hinter einem direkten Fortschrittsengpass.",transfer:"Transfer-Nutzen nicht bestätigt: Fortschrittswährungen und -ressourcen zuerst behalten."},
  pt:{deferred:"Recurso situacional: sem necessidade confirmada por VS, Temporada ou evento, o WarBoost coloca-o atrás dos recursos de progressão direta.",matched:"Contexto confirmado: este recurso situacional corresponde à necessidade atual e pode subir temporariamente.",season:"Temporada ativa: a Energia continua útil, mas fica atrás de um bloqueio direto salvo necessidade explícita.",transfer:"Utilidade de transferência não confirmada: preserva primeiro moedas e recursos de progressão."},
  nl:{deferred:"Situationele grondstof: zonder bevestigde VS-, Seizoen- of eventbehoefte zet WarBoost deze achter directe voortgangsgrondstoffen.",matched:"Bevestigde context: deze situationele grondstof past bij de huidige behoefte en kan tijdelijk hoger komen.",season:"Actief seizoen: Energie blijft nuttig, maar staat zonder expliciete behoefte achter een directe voortgangsblokkade.",transfer:"Overdrachtsnut niet bevestigd: bewaar eerst voortgangsvaluta en -grondstoffen."},
  zh:{deferred:"情境资源：如果 VS、赛季或活动没有明确需求，WarBoost 会把它排在直接成长资源之后。",matched:"情境已确认：该资源符合当前需求，可临时提高优先级。",season:"赛季进行中：体力仍有价值，但除非检测到明确需求，否则仍排在直接成长瓶颈之后。",transfer:"未确认转服需求：优先保留成长货币和资源。"},
  ja:{deferred:"状況依存資源です。VS・シーズン・イベントで必要性が確認できない場合、WarBoostは直接育成資源より下に順位付けします。",matched:"状況を確認済み：現在の必要性に合うため、一時的に優先度を上げられます。",season:"シーズン中：スタミナは有用ですが、明確な必要性がない限り直接の育成ボトルネックより下です。",transfer:"移転の必要性は未確認です。育成通貨・資源を先に温存してください。"},
  ru:{deferred:"Ситуационный ресурс: без подтвержденной потребности VS, Сезона или события WarBoost ставит его ниже прямых ресурсов прогресса.",matched:"Контекст подтвержден: ресурс соответствует текущей потребности и может временно подняться в рейтинге.",season:"Активный сезон: энергия полезна, но без явной потребности остается ниже прямого узкого места прогресса.",transfer:"Потребность в переносе не подтверждена: сначала сохраняйте валюту и ресурсы прогресса."},
  ar:{deferred:"مورد ظرفي: من دون حاجة مؤكدة في VS أو الموسم أو حدث، يضعه WarBoost بعد موارد التقدم المباشر.",matched:"تم تأكيد السياق: هذا المورد الظرفي يطابق الحاجة الحالية ويمكن أن ترتفع أولويته مؤقتاً.",season:"الموسم نشط: تظل الطاقة مفيدة، لكنها تبقى بعد اختناق التقدم المباشر ما لم توجد حاجة صريحة.",transfer:"حاجة النقل غير مؤكدة: احتفظ أولاً بعملات وموارد التقدم."},
  pl:{deferred:"Zasób sytuacyjny: bez potwierdzonej potrzeby VS, Sezonu lub wydarzenia WarBoost umieszcza go za bezpośrednimi zasobami rozwoju.",matched:"Kontekst potwierdzony: zasób odpowiada bieżącej potrzebie i może tymczasowo awansować.",season:"Aktywny sezon: Energia pozostaje użyteczna, ale bez wyraźnej potrzeby jest niżej niż bezpośrednie wąskie gardło rozwoju.",transfer:"Potrzeba transferu nie jest potwierdzona: najpierw zachowaj waluty i zasoby rozwoju."},
  tr:{deferred:"Durumsal kaynak: VS, Sezon veya etkinlik ihtiyacı doğrulanmadıkça WarBoost bunu doğrudan ilerleme kaynaklarının arkasına koyar.",matched:"Bağlam doğrulandı: bu durumsal kaynak mevcut ihtiyaca uyuyor ve geçici olarak yükseltilebilir.",season:"Aktif Sezon: Dayanıklılık yararlıdır ancak açık bir ihtiyaç yoksa doğrudan ilerleme darboğazının gerisinde kalır.",transfer:"Transfer ihtiyacı doğrulanmadı: önce ilerleme para birimlerini ve kaynaklarını koru."},
  ko:{deferred:"상황형 자원: VS·시즌·이벤트에서 필요성이 확인되지 않으면 WarBoost는 직접 성장 자원보다 낮게 배치합니다.",matched:"상황 확인됨: 현재 필요와 맞아 일시적으로 우선순위가 올라갈 수 있습니다.",season:"시즌 진행 중: 스태미나는 유용하지만 명확한 필요가 없으면 직접 성장 병목보다 낮습니다.",transfer:"이전 필요가 확인되지 않았습니다. 성장 화폐와 자원을 먼저 보존하세요."},
  vi:{deferred:"Tài nguyên tình huống: nếu VS, Mùa hoặc sự kiện chưa xác nhận nhu cầu, WarBoost xếp sau tài nguyên tăng tiến trực tiếp.",matched:"Bối cảnh đã xác nhận: tài nguyên này phù hợp nhu cầu hiện tại và có thể tạm thời tăng hạng.",season:"Mùa đang hoạt động: Thể lực vẫn hữu ích nhưng đứng sau nút thắt tăng tiến trực tiếp nếu chưa có nhu cầu rõ ràng.",transfer:"Chưa xác nhận nhu cầu chuyển máy chủ: ưu tiên giữ tiền tệ và tài nguyên tăng tiến."},
  th:{deferred:"ทรัพยากรตามสถานการณ์: หาก VS ซีซัน หรืออีเวนต์ยังไม่ยืนยันความจำเป็น WarBoost จะจัดไว้หลังทรัพยากรพัฒนาโดยตรง",matched:"ยืนยันบริบทแล้ว: ทรัพยากรนี้ตรงกับความต้องการปัจจุบันและอาจเลื่อนอันดับขึ้นชั่วคราว",season:"ซีซันกำลังดำเนินอยู่: พลังงานยังมีประโยชน์ แต่จะอยู่หลังคอขวดการพัฒนาโดยตรงหากไม่มีความต้องการชัดเจน",transfer:"ยังไม่ยืนยันความจำเป็นในการย้ายเซิร์ฟเวอร์: เก็บสกุลเงินและทรัพยากรพัฒนาไว้ก่อน"},
  id:{deferred:"Sumber daya situasional: tanpa kebutuhan VS, Musim, atau event yang terkonfirmasi, WarBoost menempatkannya di bawah sumber daya progres langsung.",matched:"Konteks terkonfirmasi: sumber daya situasional ini sesuai kebutuhan saat ini dan dapat naik sementara.",season:"Musim aktif: Stamina tetap berguna, tetapi berada di bawah hambatan progres langsung kecuali ada kebutuhan eksplisit.",transfer:"Kebutuhan transfer belum terkonfirmasi: simpan mata uang dan sumber daya progres terlebih dahulu."},
  uk:{deferred:"Ситуативний ресурс: без підтвердженої потреби VS, Сезону чи події WarBoost ставить його нижче прямих ресурсів прогресу.",matched:"Контекст підтверджено: ресурс відповідає поточній потребі й може тимчасово піднятися в рейтингу.",season:"Активний сезон: енергія корисна, але без явної потреби залишається нижче прямого вузького місця прогресу.",transfer:"Потребу в перенесенні не підтверджено: спершу зберігай валюту й ресурси прогресу."},
  ro:{deferred:"Resursă situațională: fără o nevoie confirmată de VS, Sezon sau eveniment, WarBoost o plasează după resursele de progres direct.",matched:"Context confirmat: această resursă corespunde nevoii actuale și poate urca temporar.",season:"Sezon activ: Energia rămâne utilă, dar fără o nevoie explicită stă după un blocaj direct de progres.",transfer:"Nevoia de transfer nu este confirmată: păstrează mai întâi monedele și resursele de progres."},
  el:{deferred:"Πόρος κατά περίπτωση: χωρίς επιβεβαιωμένη ανάγκη από VS, Σεζόν ή event, το WarBoost τον βάζει κάτω από τους άμεσους πόρους προόδου.",matched:"Επιβεβαιωμένο πλαίσιο: ο πόρος ταιριάζει στην τρέχουσα ανάγκη και μπορεί προσωρινά να ανέβει.",season:"Ενεργή Σεζόν: η Ενέργεια παραμένει χρήσιμη, αλλά χωρίς ρητή ανάγκη μένει κάτω από ένα άμεσο bottleneck προόδου.",transfer:"Δεν έχει επιβεβαιωθεί ανάγκη μεταφοράς: κράτησε πρώτα νομίσματα και πόρους προόδου."},
  cs:{deferred:"Situační zdroj: bez potvrzené potřeby VS, Sezóny nebo události jej WarBoost řadí za přímé zdroje postupu.",matched:"Kontext potvrzen: zdroj odpovídá aktuální potřebě a může dočasně postoupit výš.",season:"Aktivní sezóna: Energie je užitečná, ale bez výslovné potřeby zůstává za přímým úzkým místem postupu.",transfer:"Potřeba transferu není potvrzena: nejdřív šetři měny a zdroje postupu."},
  sv:{deferred:"Situationsresurs: utan bekräftat behov i VS, Säsong eller event placerar WarBoost den efter direkta progressionsresurser.",matched:"Bekräftad kontext: resursen matchar det aktuella behovet och kan tillfälligt rankas högre.",season:"Aktiv säsong: Energi är fortfarande nyttig, men ligger utan uttryckligt behov efter en direkt progressionsflaskhals.",transfer:"Överföringsbehov är inte bekräftat: spara först progressionsvalutor och resurser."}
};
function shopSituationalText(locale){return SHOP_SITUATIONAL_TEXT[shopLocaleKey(locale)]||SHOP_SITUATIONAL_TEXT.en;}
function adaptiveText(locale){return ADAPTIVE_TEXT[localePack(locale)]||ADAPTIVE_TEXT.en;}
function isDiamondCurrency(v){return /diamond|diamant|diamante|gem|gems|钻石|ダイヤ|ألماس|💎/.test(normItem(v));}
function isCashCurrency(v){const raw=String(v||"");return /eur|usd|gbp|euro|dollar|pound/.test(normItem(v))||/[€$£]/.test(raw);}
const SHOP_PAYMENT_TEXT={
  fr:{real:'Achat réel',diamond:'Diamants / monnaie premium',game:'Monnaie du jeu',unknown:'Type de paiement à vérifier',verify:'Achat réel : vérifie le prix actuel, le contenu actuel et le rapport coût/gain avant de payer.',historical:'Offre référencée précédemment. Non confirmée dans ta boutique actuelle. Rescanne la boutique avant toute recommandation d’achat.',observed:(d,p)=>`Prix observé le ${d} : ${p} · prix actuel non vérifié.`,contents:(d,n)=>`Contenu observé le ${d} : ${n} Contenu actuel non vérifié.`},
  en:{real:'Real-money purchase',diamond:'Diamonds / premium currency',game:'In-game currency',unknown:'Payment type to verify',verify:'Real-money purchase: verify the current price, current contents and cost/gain before paying.',historical:'Previously referenced offer. Not confirmed in your current shop. Rescan the shop before any purchase recommendation.',observed:(d,p)=>`Price observed on ${d}: ${p} · current price not verified.`,contents:(d,n)=>`Contents observed on ${d}: ${n} Current contents not verified.`},
  es:{real:'Compra con dinero real',diamond:'Diamantes / moneda premium',game:'Moneda del juego',unknown:'Tipo de pago por verificar',verify:'Compra con dinero real: verifica precio actual, contenido actual y relación coste/ganancia antes de pagar.',historical:'Oferta referenciada anteriormente. No está confirmada en tu tienda actual. Vuelve a escanear la tienda antes de cualquier recomendación de compra.',observed:(d,p)=>`Precio observado el ${d}: ${p} · precio actual no verificado.`,contents:(d,n)=>`Contenido observado el ${d}: ${n} Contenido actual no verificado.`},
  de:{real:'Echtgeldkauf',diamond:'Diamanten / Premiumwährung',game:'Spielwährung',unknown:'Zahlungsart prüfen',verify:'Echtgeldkauf: aktuellen Preis, aktuellen Inhalt und Kosten/Nutzen vor dem Bezahlen prüfen.',historical:'Früher referenziertes Angebot. Im aktuellen Shop nicht bestätigt. Vor jeder Kaufempfehlung den Shop erneut scannen.',observed:(d,p)=>`Beobachteter Preis am ${d}: ${p} · aktueller Preis nicht bestätigt.`,contents:(d,n)=>`Beobachteter Inhalt am ${d}: ${n} Aktueller Inhalt nicht bestätigt.`},
  ja:{real:'課金',diamond:'ダイヤ / プレミアム通貨',game:'ゲーム内通貨',unknown:'支払方法を確認',verify:'課金商品：支払う前に現在価格・現在内容・費用対効果を確認してください。',historical:'過去に参照された商品です。現在のショップでは未確認です。購入推奨を出す前にショップを再スキャンしてください。',observed:(d,p)=>`${d}に確認した価格：${p} · 現在価格は未確認。`,contents:(d,n)=>`${d}に確認した内容：${n} 現在内容は未確認。`},
  zh:{real:'真钱购买',diamond:'钻石 / 高级货币',game:'游戏内货币',unknown:'支付类型待确认',verify:'真钱购买：付款前请确认当前价格、当前内容和成本收益。',historical:'此前记录的商品，尚未在你当前商店中确认。任何购买建议前请重新扫描商店。',observed:(d,p)=>`${d}观察价格：${p} · 当前价格未验证。`,contents:(d,n)=>`${d}观察内容：${n} 当前内容未验证。`},
  ar:{real:'شراء بأموال حقيقية',diamond:'ألماس / عملة مميزة',game:'عملة داخل اللعبة',unknown:'نوع الدفع يحتاج تحقق',verify:'شراء بأموال حقيقية: تحقق من السعر الحالي والمحتوى الحالي ومقارنة التكلفة بالعائد قبل الدفع.',historical:'عرض مسجل سابقاً وغير مؤكد في متجرك الحالي. أعد مسح المتجر قبل أي توصية شراء.',observed:(d,p)=>`السعر المرصود في ${d}: ${p} · السعر الحالي غير مؤكد.`,contents:(d,n)=>`المحتوى المرصود في ${d}: ${n} المحتوى الحالي غير مؤكد.`}
};
function shopPaymentText(locale){return SHOP_PAYMENT_TEXT[localePack(locale)]||SHOP_PAYMENT_TEXT.en}
function purchaseType(currency){return isCashCurrency(currency)?'real_money':isDiamondCurrency(currency)?'diamonds':cleanName(currency)?'game_currency':'unknown'}
function purchaseTypeLabel(type,locale){const t=shopPaymentText(locale);return type==='real_money'?t.real:type==='diamonds'?t.diamond:type==='game_currency'?t.game:t.unknown}
function paidPurchaseGuard({source,currency,price,current_price_verified=false,current_contents_verified=false,cost_gain_verified=false}={},locale){
  const type=purchaseType(currency),paid=type==='real_money',strong_allowed=!paid||(Boolean(current_price_verified)&&Boolean(current_contents_verified)&&Boolean(cost_gain_verified)&&['scan','official'].includes(String(source||'')));
  return {purchase_type:type,purchase_type_label:purchaseTypeLabel(type,locale),real_money:paid,strong_recommendation_allowed:strong_allowed,current_price_verified:Boolean(current_price_verified),current_contents_verified:Boolean(current_contents_verified),cost_gain_verified:Boolean(cost_gain_verified),label:paid&&!strong_allowed?shopPaymentText(locale).verify:''};
}
function vsContextBoost(cat,name,day){const d=Number(day),s=normItem(name);if(!Number.isInteger(d)||d<1||d>6)return 0;
  if(d===1&&cat==="drone")return 5;
  if(d===2&&(cat==="speed_build"||(/construct|build|construction/.test(s)&&cat==="speed")))return 8;
  if(d===3&&(cat==="speed_research"||(/research|science|recherche|forsch/.test(s)&&cat==="speed")))return 8;
  if(d===3&&cat==="drone")return 3;
  if(d===4&&cat==="hero")return 7;
  if(d===5&&["speed","speed_build","speed_research","speed_train"].includes(cat))return 8;
  if(d===6&&cat==="shield")return 16;
  if(d===6&&cat==="teleport")return 12;
  if(d===6&&cat==="speed_heal")return 10;
  return 0;
}
function shopCategoryResourceFamily(cat){return ({exclusive:"exclusive_weapon_shards",blueprint:"gear_materials",gear_material:"gear_materials",hero:"hero_shards",hero_recruit:"hero_shards",drone:"drone_components",training:"hero_xp"})[cat]||null;}
function buildShopDiagnosticAlignment(analysis={}){
  const top=Array.isArray(analysis?.priorities)?analysis.priorities.slice(0,3):[];
  const families=top.map(x=>x?.resource_family||resourceFamily(x?.kind)).filter(x=>x&&x!=="other"&&x!=="data");
  const ordered=[...new Set(families)],counts={};for(const f of families)counts[f]=(counts[f]||0)+1;
  const dominant=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||null;
  return {ordered_families:ordered,dominant_family:dominant&&dominant[1]>=2?dominant[0]:null,dominant_count:dominant&&dominant[1]>=2?dominant[1]:0,top_actions:top.map(x=>({kind:x?.kind||null,resource_family:x?.resource_family||resourceFamily(x?.kind),target:x?.target||null,rank:x?.rank||null}))};
}
function diagnosticShopAdjustment(cat,alignment,locale){
  const family=shopCategoryResourceFamily(cat),txt=shopAlignmentText(locale);
  if(!family||!Array.isArray(alignment?.ordered_families)||!alignment.ordered_families.length)return {bonus:0,reasons:[],family,rank:null};
  const rank=alignment.ordered_families.indexOf(family),scarce=new Set(["exclusive_weapon_shards","gear_materials","hero_shards","drone_components","hero_xp"]);let bonus=rank===0?8:rank===1?5:rank===2?3:0,reasons=[];
  if(alignment.dominant_family){if(family===alignment.dominant_family){bonus+=8;reasons.push(txt.aligned);}else if(scarce.has(family)){bonus-=6;reasons.push(txt.deferred);}}
  else if(rank>=0)reasons.push(txt.rank(rank+1));
  return {bonus,reasons,family,rank:rank>=0?rank+1:null};
}
const OPAQUE_CONTAINER_CATEGORIES=new Set(["campaign_chest","chest"]);
function opaqueContainerGuard(cat,locale){
  // A generic/opaque chest cannot outrank a known direct progression resource merely because of rarity.
  // If its contents are later identified, itemCategory should resolve it to the specific resource category and this guard no longer applies.
  if(!OPAQUE_CONTAINER_CATEGORIES.has(cat))return {opaque:false,cap:null,reason:""};
  const txt=shopAlignmentText(locale);
  return {opaque:true,cap:70,reason:txt.opaque||SHOP_ALIGNMENT_TEXT.en.opaque};
}
const SITUATIONAL_SHOP_CATEGORIES=new Set(["stamina","shield","teleport","transfer","speed","speed_build","speed_research","speed_train","speed_heal"]);
function explicitSituationalSignal(cat,state){
  const vsDay=Number(state?.vs?.day),seasonActive=seasonIsActive(state?.season||{}),seasonDay=seasonActive?num(state?.season?.day):null,seasonTotal=seasonActive?num(state?.season?.total_days):null;
  const event=state?.event||state?.events||{},season=state?.season||{},vs=state?.vs||{};
  const activeSeason=seasonDay!==null&&(seasonTotal===null||seasonTotal<=0||seasonDay<=seasonTotal);
  if(cat==="shield"||cat==="teleport"||cat==="speed_heal")return vsDay===6;
  if(cat==="speed_build")return vsDay===2||Boolean(vs?.build_priority);
  if(cat==="speed_research")return vsDay===3||Boolean(vs?.research_priority);
  if(cat==="speed_train")return vsDay===5||Boolean(vs?.training_priority);
  if(cat==="speed")return vsDay===5||Boolean(vs?.speedup_priority);
  if(cat==="transfer")return Boolean(event?.transfer_priority||event?.server_transfer||season?.transfer_priority);
  if(cat==="stamina")return Boolean(event?.stamina_priority||event?.energy_priority||season?.stamina_priority||season?.energy_priority||vs?.stamina_priority);
  return false;
}
function situationalUtilityGuard(cat,state,locale,name=""){
  if(!SITUATIONAL_SHOP_CATEGORIES.has(cat))return {situational:false,contextual:false,cap:null,reason:""};
  const txt=shopSituationalText(locale),strong=explicitSituationalSignal(cat,state),vsBoost=vsContextBoost(cat,name,state?.vs?.day),seasonDay=num(state?.season?.day),seasonTotal=num(state?.season?.total_days),activeSeason=seasonDay!==null&&(seasonTotal===null||seasonTotal<=0||seasonDay<=seasonTotal);
  if(strong||vsBoost>0)return {situational:true,contextual:true,cap:88,reason:txt.matched};
  if(cat==="stamina"&&activeSeason)return {situational:true,contextual:false,cap:76,reason:txt.season};
  if(cat==="transfer")return {situational:true,contextual:false,cap:38,reason:txt.transfer};
  const caps={shield:60,teleport:60,speed_heal:64,speed_build:64,speed_research:64,speed_train:64,speed:62,stamina:64};
  return {situational:true,contextual:false,cap:caps[cat]??64,reason:txt.deferred};
}
function baseOfferScore(cat,needs){
  if(cat==="vip_time")return 94;
  if(cat==="monthly_pass")return 52;
  if(cat==="blueprint")return 84+needs.gearUrgency*14;
  if(cat==="gear_material")return 68+needs.gearUrgency*18;
  if(cat==="exclusive")return 62+needs.exclusiveUrgency*36;
  if(cat==="hero")return needs.needStars?86+needs.starsUrgency*10:42;
  if(cat==="hero_recruit")return needs.needStars?62:34;
  if(cat==="drone")return 70+needs.droneUrgency*20-(needs.exclusiveUrgency>.85?4:0);
  if(cat==="stamina")return 84;
  if(cat==="armament")return 78;
  if(cat==="armament_material")return 70;
  if(cat==="skill")return 75;
  if(cat==="overlord")return 68;
  if(cat==="badge_value")return 66;
  if(cat==="campaign_chest")return 84;
  if(cat==="training")return needs.needLevel?72:54;
  if(cat==="season_skill")return 74;
  if(cat==="profession")return 55;
  if(["speed","speed_build","speed_research","speed_train","speed_heal"].includes(cat))return 65;
  if(cat==="shield")return 58;
  if(cat==="teleport")return 56;
  if(cat==="combat_data")return 50;
  if(cat==="superalloy")return 50;
  if(cat==="decoration_component")return 36;
  if(cat==="survivor")return 34;
  if(cat==="trade")return 40;
  if(cat==="transfer")return 28;
  if(cat==="event_pack")return 38;
  if(cat==="diamond_topup")return 24;
  if(cat==="gold_brick")return 22;
  if(cat==="chest")return 48;
  if(cat==="resource")return 18;
  if(cat==="cosmetic")return 12;
  return 45;
}
function scoreVisibleOffer(o,needs,state){const rawStore=o?.store_type||o?.store||"",cat=itemCategory(o?.item_name,o?.category,rawStore),store=storeKind(rawStore),shop=state?.shop||{},a=adaptiveText(state?._locale),factors=[];let score=baseOfferScore(cat,needs);const mi=metaShopAdjustment(cat,needs,state);score+=mi.bonus;if(mi.bonus)factors.push(`Multi-source meta +${mi.bonus}`);
  if(store==="honor"){if(cat==="blueprint")score=Math.max(score,99);if(cat==="exclusive"&&needs.needExclusive)score=Math.max(score,97);else if(cat==="hero"&&!needs.needStars)score=Math.min(score,34);else if(!["blueprint","exclusive"].includes(cat))score-=6;}
  if(store==="campaign"){if(cat==="exclusive"&&needs.needExclusive)score=Math.max(score,98);if(cat==="campaign_chest")score=Math.max(score,88);if(cat==="drone")score=Math.max(score,82);}
  if(store==="alliance"){if(cat==="hero"&&needs.needStars)score=Math.max(score,94);if(cat==="drone")score=Math.max(score,84);}
  if(store==="vip"){if(cat==="stamina")score=Math.max(score,86);if(cat==="hero"&&needs.needStars)score=Math.max(score,92);if(cat==="teleport")score=Math.max(score,63);}
  if(store==="diamond"){if(cat==="resource"||cat==="hero"||cat==="chest")score=Math.min(score,28);}
  const vsBoost=vsContextBoost(cat,o?.item_name,state?.vs?.day);if(vsBoost){score+=vsBoost;factors.push(a.vs(state.vs.day));}
  if(num(state?.season?.day)!==null){if(cat==="stamina")score+=3;if(cat==="drone")score+=2;}
  const discount=Math.max(0,Math.min(4,(num(o?.discount_pct)||0)/20));score+=discount;
  const currency=cleanName(o?.currency)||cleanName(shop?.currency),price=num(o?.price),balance=num(shop?.currency_balance),reserve=VIP30_REFERENCE_POLICY.diamonds;
  const diamond=isDiamondCurrency(currency)||((store==="vip"||store==="diamond")&&!isCashCurrency(currency));
  if(diamond&&price!==null){
    if(balance!==null){
      if(balance<price){score=0;factors.push(a.notAffordable);}
      else if(cat!=="vip_time"&&balance-price<reserve){score-=26;factors.push(a.lowBudget);}
      else {const discretionary=Math.max(0,balance-reserve);if(cat!=="vip_time"&&discretionary>0&&price>discretionary*.25)score-=6;factors.push(a.budgetOk);}
    }else factors.push(a.unknownBudget);
  }
  if(isCashCurrency(currency)){const targeted=["exclusive","blueprint","gear_material","drone","armament","armament_material","monthly_pass"].includes(cat);score=Math.min(score,targeted?88:78);factors.push(a.realMoney);}
  if(cat==="hero"&&!needs.needStars)factors.push(a.allStars);
  if(needs.needExclusive&&["drone","stamina","speed","speed_build","speed_research","speed_train","speed_heal","hero"].includes(cat)){const t=needs.exTargets.slice(0,2).map(exTargetLabel).filter(Boolean).join(" / ");factors.push(a.exFirst(t));}
  const da=diagnosticShopAdjustment(cat,state?._shop_alignment,state?._locale);score+=da.bonus;factors.push(...da.reasons);
  const opaqueGuard=opaqueContainerGuard(cat,state?._locale);
  if(opaqueGuard.opaque){score=Math.min(score,opaqueGuard.cap);factors.push(opaqueGuard.reason);}
  const situationalGuard=situationalUtilityGuard(cat,state,state?._locale,o?.item_name||"");
  if(situationalGuard.situational){score=Math.min(score,situationalGuard.cap);factors.push(situationalGuard.reason);}
  score=Math.max(0,Math.min(100,Math.round(score)));
  return {score,cat,factors,budget:{currency,price,balance,reserve,diamond},opaque_container:opaqueGuard.opaque,opaque_score_cap:opaqueGuard.cap,situational_resource:situationalGuard.situational,situational_context_confirmed:situationalGuard.contextual,situational_score_cap:situationalGuard.cap};
}
function verdict(score,p){return score>=85?{key:"buy_now",label:p.buy}:score>=55?{key:"consider",label:p.consider}:{key:"skip",label:p.skip};}
function offerReason(cat,needs,p){const exTarget=needs.exTargets.slice(0,2).map(exTargetLabel).filter(Boolean).join(" / "),starTarget=needs.starTargets.slice(0,2).map(x=>x.name).join(" / ");if(cat==="blueprint"||cat==="gear_material")return p.reasonBlueprint;if(cat==="exclusive")return p.reasonExclusive(exTarget);if(cat==="hero"||cat==="hero_recruit")return p.reasonHero(starTarget);if(cat==="drone")return p.reasonDrone;if(cat==="stamina")return p.reasonStamina;if(["speed","speed_build","speed_research","speed_train","speed_heal"].includes(cat))return p.reasonSpeed;if(cat==="shield")return p.reasonShield;if(["resource","cosmetic","diamond_topup","gold_brick","event_pack"].includes(cat))return p.reasonResource;return p.reasonVisible;}
const CURRENCY_LABELS={
  fr:{diamonds:"diamants",alliance_coins:"jetons Alliance",honor_medals:"médailles d’Honneur",campaign_points:"points Campagne",season_tokens:"jetons Saison",cosmetic_tokens:"jetons Cosmétiques",coupons:"coupons"},
  en:{diamonds:"diamonds",alliance_coins:"Alliance coins",honor_medals:"Honor medals",campaign_points:"Campaign points",season_tokens:"Season tokens",cosmetic_tokens:"Cosmetic tokens",coupons:"coupons"},
  es:{diamonds:"diamantes",alliance_coins:"monedas de Alianza",honor_medals:"medallas de Honor",campaign_points:"puntos de Campaña",season_tokens:"fichas de Temporada",cosmetic_tokens:"fichas Cosméticas",coupons:"cupones"},
  it:{diamonds:"diamanti",alliance_coins:"monete Alleanza",honor_medals:"medaglie d’Onore",campaign_points:"punti Campagna",season_tokens:"gettoni Stagione",cosmetic_tokens:"gettoni Cosmetici",coupons:"coupon"},
  de:{diamonds:"Diamanten",alliance_coins:"Allianzmünzen",honor_medals:"Ehrenmedaillen",campaign_points:"Kampagnenpunkte",season_tokens:"Saisonmarken",cosmetic_tokens:"Kosmetikmarken",coupons:"Coupons"},
  pt:{diamonds:"diamantes",alliance_coins:"moedas da Aliança",honor_medals:"medalhas de Honra",campaign_points:"pontos de Campanha",season_tokens:"fichas de Temporada",cosmetic_tokens:"fichas Cosméticas",coupons:"cupões"},
  nl:{diamonds:"diamanten",alliance_coins:"Alliantiemunten",honor_medals:"Eremedailles",campaign_points:"Campagnepunten",season_tokens:"Seizoensfiches",cosmetic_tokens:"Cosmetische fiches",coupons:"coupons"},
  zh:{diamonds:"钻石",alliance_coins:"联盟币",honor_medals:"荣誉勋章",campaign_points:"战役点数",season_tokens:"赛季代币",cosmetic_tokens:"装饰代币",coupons:"优惠券"},
  ja:{diamonds:"ダイヤ",alliance_coins:"同盟コイン",honor_medals:"名誉メダル",campaign_points:"キャンペーンポイント",season_tokens:"シーズントークン",cosmetic_tokens:"コスメトークン",coupons:"クーポン"},
  ru:{diamonds:"алмазы",alliance_coins:"монеты Альянса",honor_medals:"медали Чести",campaign_points:"очки Кампании",season_tokens:"жетоны Сезона",cosmetic_tokens:"косметические жетоны",coupons:"купоны"},
  ar:{diamonds:"ألماس",alliance_coins:"عملات التحالف",honor_medals:"ميداليات الشرف",campaign_points:"نقاط الحملة",season_tokens:"رموز الموسم",cosmetic_tokens:"رموز الزينة",coupons:"قسائم"},
  pl:{diamonds:"diamenty",alliance_coins:"monety Sojuszu",honor_medals:"medale Honoru",campaign_points:"punkty Kampanii",season_tokens:"żetony Sezonu",cosmetic_tokens:"żetony Kosmetyczne",coupons:"kupony"},
  tr:{diamonds:"elmas",alliance_coins:"İttifak parası",honor_medals:"Onur madalyaları",campaign_points:"Sefer puanları",season_tokens:"Sezon jetonları",cosmetic_tokens:"Kozmetik jetonları",coupons:"kuponlar"},
  ko:{diamonds:"다이아몬드",alliance_coins:"연맹 코인",honor_medals:"명예 메달",campaign_points:"캠페인 포인트",season_tokens:"시즌 토큰",cosmetic_tokens:"코스메틱 토큰",coupons:"쿠폰"},
  vi:{diamonds:"kim cương",alliance_coins:"xu Liên minh",honor_medals:"huy chương Danh dự",campaign_points:"điểm Chiến dịch",season_tokens:"token Mùa",cosmetic_tokens:"token Trang trí",coupons:"phiếu"},
  th:{diamonds:"เพชร",alliance_coins:"เหรียญพันธมิตร",honor_medals:"เหรียญเกียรติยศ",campaign_points:"แต้มแคมเปญ",season_tokens:"โทเคนซีซัน",cosmetic_tokens:"โทเคนคอสเมติก",coupons:"คูปอง"},
  id:{diamonds:"berlian",alliance_coins:"koin Aliansi",honor_medals:"medali Kehormatan",campaign_points:"poin Kampanye",season_tokens:"token Musim",cosmetic_tokens:"token Kosmetik",coupons:"kupon"},
  uk:{diamonds:"діаманти",alliance_coins:"монети Альянсу",honor_medals:"медалі Честі",campaign_points:"очки Кампанії",season_tokens:"жетони Сезону",cosmetic_tokens:"косметичні жетони",coupons:"купони"},
  ro:{diamonds:"diamante",alliance_coins:"monede Alianță",honor_medals:"medalii de Onoare",campaign_points:"puncte Campanie",season_tokens:"jetoane Sezon",cosmetic_tokens:"jetoane Cosmetice",coupons:"cupoane"},
  el:{diamonds:"διαμάντια",alliance_coins:"νομίσματα Συμμαχίας",honor_medals:"μετάλλια Τιμής",campaign_points:"πόντοι Εκστρατείας",season_tokens:"μάρκες Σεζόν",cosmetic_tokens:"μάρκες Καλλυντικών",coupons:"κουπόνια"},
  cs:{diamonds:"diamanty",alliance_coins:"alianční mince",honor_medals:"medaile Cti",campaign_points:"body Kampaně",season_tokens:"žetony Sezóny",cosmetic_tokens:"kosmetické žetony",coupons:"kupóny"},
  sv:{diamonds:"diamanter",alliance_coins:"Alliansmynt",honor_medals:"Hedersmedaljer",campaign_points:"Kampanjpoäng",season_tokens:"Säsongstoken",cosmetic_tokens:"Kosmetiska token",coupons:"kuponger"}
};
function currencyLabel(v,locale){const c=normItem(v),k=shopLocaleKey(locale),map=CURRENCY_LABELS[k]||CURRENCY_LABELS.en;return map[c]||cleanName(v);}
function priceLabel(o,locale){const price=num(o?.price),currency=currencyLabel(o?.currency,locale);if(price===null)return currency||"";const n=price.toLocaleString(String(locale||"en-GB"),{maximumFractionDigits:2});return `${n}${currency?` ${currency}`:""}`;}
function genericShopRecommendations(state,locale,needs){const p=shopText(locale),st=shopStores(locale),a=adaptiveText(locale),safe=shopSafetyText(locale),action=shopAlignmentText(locale),out=[];const add=(item,store,cat,score,reason,target="")=>{const mi=metaShopAdjustment(cat,needs,state),da=diagnosticShopAdjustment(cat,state?._shop_alignment,locale),sg=situationalUtilityGuard(cat,state,locale,item);score=Math.max(1,Math.min(100,score+mi.bonus+da.bonus));if(sg.situational)score=Math.min(score,sg.cap);out.push({item,store:`${store} · ${safe.notVerified}`,score,score_label:a.score(score),reason:[reason,...da.reasons,sg.reason].filter(Boolean).join(" "),target,verdict:action.verify,verdict_key:"strategy",source:"strategy",availability_label:safe.notVerified,evidence_ids:mi.evidence,diagnostic_alignment:{resource_family:da.family,priority_rank:da.rank,bonus:da.bonus},situational_resource:sg.situational,situational_context_confirmed:sg.contextual,situational_score_cap:sg.cap});};
  add(p.honorBp,st.honor,"blueprint",Math.round(84+needs.gearUrgency*14),p.reasonBlueprint,safe.mainGear);
  if(needs.needExclusive){const t=needs.exTargets.slice(0,3).map(exTargetLabel).filter(Boolean).join(" / ");add(p.campaignEx,st.campaign,"exclusive",98,p.reasonExclusive(t),t);add(p.paidExclusive,st.paid,"exclusive",82,p.reasonPaid(`EX: ${t}`),t);}
  if(needs.needStars){const t=needs.starTargets.slice(0,3).map(x=>x.name).join(" / ");add(p.allianceHero,st.allianceCampaign,"hero",94,p.reasonHero(t),t);}
  const droneScore=Math.round(70+needs.droneUrgency*20-(needs.exclusiveUrgency>.85?4:0));add(p.allianceDrone,st.allianceCampaign,"drone",droneScore,p.reasonDrone,safe.droneTarget(needs.droneLevel));
  add(p.vipStamina,st.vip,"stamina",86,p.reasonStamina);add(p.speed,st.vipAlliance,"speed",65,p.reasonSpeed);add(p.shield,st.allianceDiamond,"shield",58,p.reasonShield);
  if(!needs.needExclusive&&needs.needGear)add(p.paidGear,st.paid,"blueprint",80,p.reasonPaid(safe.mainGear),safe.mainGear);else if(!needs.needExclusive&&!needs.needStars&&!needs.needGear&&needs.droneKnown)add(p.paidDrone,st.paid,"drone",76,p.reasonPaid(safe.droneTarget(needs.droneLevel)),safe.droneTarget(needs.droneLevel));
  add(p.resources,st.diamondPaid,"resource",18,p.reasonResource);
  return out.sort((x,y)=>y.score-x.score).slice(0,8).map((x,i)=>({...x,rank:i+1}));
}

function shopProfileConfidence(needs){const hs=Array.isArray(needs?.heroes)?needs.heroes:[];if(!hs.length)return 0;const ratio=fn=>hs.filter(fn).length/Math.max(5,hs.length);let score=0;score+=Math.min(20,hs.length/5*20);score+=ratio(h=>cleanName(h.name)&&!/^Hero\s+\d+$/i.test(h.name))*10;score+=ratio(h=>h.level!==null)*15;score+=ratio(h=>h.stars!==null)*15;score+=ratio(h=>h.exclusive!==null)*25;score+=ratio(h=>h.gear!==null)*10;if(needs.droneKnown)score+=5;return Math.max(0,Math.min(100,Math.round(score)));}

function referenceLabel(locale){const k=localePack(locale);return k==="fr"?"Référentiel WarBoost · disponibilité à vérifier":k==="es"?"Referencia WarBoost · disponibilidad por verificar":k==="de"?"WarBoost-Referenz · Verfügbarkeit prüfen":k==="ja"?"WarBoost参照 · 在庫要確認":k==="zh"?"WarBoost 参考目录 · 需确认可用性":k==="ar"?"مرجع WarBoost · التوفر يحتاج تحقق":"WarBoost reference · availability unverified";}
function referenceSummary(locale,stats){const k=localePack(locale);if(k==="fr")return `Référentiel construit depuis les captures Last War fournies : ${stats.named} articles nommés dans ${stats.stores} boutiques/familles. Il sert à reconnaître et comparer les achats, mais ne confirme jamais qu'une offre est encore disponible aujourd'hui.`;if(k==="es")return `Referencia basada en capturas proporcionadas: ${stats.named} artículos en ${stats.stores} tiendas/familias. Ayuda a reconocer y comparar compras, sin afirmar disponibilidad actual.`;if(k==="de")return `Referenz aus bereitgestellten Screenshots: ${stats.named} benannte Artikel in ${stats.stores} Shop-Familien. Sie dient zum Erkennen und Vergleichen, nicht als Live-Verfügbarkeit.`;if(k==="ja")return `提供されたスクリーンショットから作成した参照：${stats.stores}種類のショップに${stats.named}件。商品認識と比較用で、現在販売中とは断定しません。`;if(k==="zh")return `基于用户截图的参考目录：${stats.stores} 类商店、${stats.named} 个命名商品。用于识别和比较，不代表当前仍在售。`;if(k==="ar")return `مرجع مبني على لقطات الشاشة المقدمة: ${stats.named} عنصراً ضمن ${stats.stores} فئة متجر. يفيد للتعرف والمقارنة ولا يؤكد التوفر الحالي.`;return `Reference built from provided Last War screenshots: ${stats.named} named items across ${stats.stores} shop families. It helps recognition and comparison but never claims live availability.`;}
function referenceMatchText(locale,score){const k=localePack(locale);if(k==="fr")return `Référentiel WarBoost reconnu ${score}%`;if(k==="es")return `Referencia WarBoost reconocida ${score}%`;if(k==="de")return `WarBoost-Referenz erkannt ${score}%`;if(k==="ja")return `WarBoost参照一致 ${score}%`;if(k==="zh")return `WarBoost 参考匹配 ${score}%`;if(k==="ar")return `تطابق مرجع WarBoost ${score}%`;return `WarBoost reference match ${score}%`;}
function observedSummary(locale,stores,uniqueOffers,rawOffers=uniqueOffers){const k=localePack(locale),dedup=rawOffers>uniqueOffers;if(k==="fr")return `${stores} boutique${stores>1?"s":""} scannée${stores>1?"s":""} récemment · ${uniqueOffers} offre${uniqueOffers>1?"s":""} unique${uniqueOffers>1?"s":""}${dedup?` (${rawOffers} lignes visibles cumulées)`:""}. WarBoost fusionne les doublons et compare les scans sans écraser la boutique précédente.`;if(k==="es")return `${stores} tienda(s) reciente(s) · ${uniqueOffers} oferta(s) única(s)${dedup?` (${rawOffers} líneas visibles)`:""}.`;if(k==="de")return `${stores} kürzlich gescannte Shops · ${uniqueOffers} eindeutige Angebote${dedup?` (${rawOffers} sichtbare Zeilen)`:""}.`;if(k==="ja")return `最近のショップ ${stores}件 · 重複除外 ${uniqueOffers}件${dedup?`（表示行${rawOffers}件）`:""}。`;if(k==="zh")return `近期扫描 ${stores} 个商店 · 去重后 ${uniqueOffers} 个商品${dedup?`（可见行 ${rawOffers}）`:""}。`;if(k==="ar")return `${stores} متاجر حديثة · ${uniqueOffers} عروض فريدة${dedup?` (${rawOffers} صفوف ظاهرة)`:""}.`;return `${stores} recently scanned shops · ${uniqueOffers} unique offers${dedup?` (${rawOffers} visible rows)`:""}.`;}

function observedShopOffers(shop={}){
  const rows=[],sources=[...(Array.isArray(shop?.snapshots)?shop.snapshots:[])];
  if(Array.isArray(shop?.offers)&&shop.offers.length)sources.push({store_type:shop.store_type,currency:shop.currency,currency_balance:shop.currency_balance,vip_level:shop.vip_level,vip_days_remaining:shop.vip_days_remaining,offers:shop.offers,updated_at:shop.updated_at});
  for(const snap of sources){
    const store=canonicalShopStore(snap?.store_type||"")||cleanName(snap?.store_type)||"Last War Shop",fresh=freshnessInfo(snap?.updated_at||null,"shop","fr");
    for(const o of Array.isArray(snap?.offers)?snap.offers:[]){
      const cur=normalizeObservedCurrency({...o,_store_type:store,_currency:o?.currency||snap?.currency||""}),price=num(o?.price),priceConfidence=num(o?.price_confidence),currencyConfidence=num(o?.currency_confidence);
      rows.push({...o,_store_type:store,_currency:cur.currency,_currency_original:o?.currency||snap?.currency||"",_currency_normalized:cur.normalized,_currency_expected:cur.expected,_currency_balance:snap?.currency_balance??null,_updated_at:snap?.updated_at||null,_freshness_status:fresh.status,_price:price,_price_confidence:priceConfidence,_currency_confidence:currencyConfidence});
    }
  }
  const groups=new Map();
  for(const o of rows){const key=`${normItem(o._store_type)}|${normalizedObservedItemKey(o)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o)}
  const out=[];let soldCount=0,conflictCount=0;
  for(const group of groups.values()){
    group.sort((a,b)=>String(b._updated_at||"").localeCompare(String(a._updated_at||"")));
    const newest=group[0]?._updated_at||"",latest=group.filter(x=>(x._updated_at||"")===newest),sold=latest.some(x=>x?.sold===true);
    if(sold){soldCount++;continue}
    let best=[...latest].sort((a,b)=>((b._price!==null?1:0)+(b._currency?1:0)+(num(b._price_confidence)||0)+(num(b._currency_confidence)||0))-((a._price!==null?1:0)+(a._currency?1:0)+(num(a._price_confidence)||0)+(num(a._currency_confidence)||0)))[0]||group[0];
    const prices=[...new Set(latest.map(x=>x._price).filter(x=>x!==null))];
    const lowPriceConfidence=best._price_confidence!==null&&best._price_confidence<0.65;
    const ref=findShopReference(best?.item_name,best?._store_type),refPrice=num(ref?.price),sameAsRef=best._price!==null&&refPrice!==null&&best._price===refPrice;
    if(prices.length>1){best={...best,price:null,_price:null,_price_conflict:true};conflictCount++}
    else if(lowPriceConfidence&&!sameAsRef)best={...best,price:null,_price:null,_price_suppressed:true};
    else best={...best,price:best._price};
    out.push(best);
  }
  return {rows:out,raw_count:rows.length,unique_count:out.length,sold_count:soldCount,deduped_count:Math.max(0,rows.length-out.length-soldCount),price_conflict_count:conflictCount};
}

function referenceCatalogPriceLabel(r,locale){
  if(r?.price===null||r?.price===undefined)return "";
  const raw=priceLabel({price:r.price,currency:r.currency},locale),date=localePack(locale)==='fr'?SHOP_REFERENCE_DATE.split('-').reverse().join('/'):SHOP_REFERENCE_DATE;
  if(isCashCurrency(r?.currency))return shopPaymentText(locale).observed(date,raw);
  const prefix=localePack(locale)==='fr'?`réf. ${date} · `:`ref. ${date} · `;return `${prefix}${raw}`;
}
function referenceCatalogRecommendations(state,locale,needs){
  const refs=referenceItemsForStrategy({locale,includeTemporary:true}),p=shopText(locale),a=adaptiveText(locale),safe=shopSafetyText(locale),action=shopAlignmentText(locale),out=[];
  for(const r of refs){
    const stateCtx={...state,_locale:locale,shop:{...(state?.shop||{}),currency:r.currency||"",currency_balance:null}};
    const scored=scoreVisibleOffer({item_name:r.item,category:r.category,price:r.price,currency:r.currency,store_type:r.store},needs,stateCtx);
    let score=scored.score;
    if(r.temporary)score-=2;
    if(r.category==="cosmetic")score=Math.min(score,14);
    if(r.category==="event_pack")score=Math.min(score,42);
    score=Math.max(0,Math.min(100,Math.round(score)));
    const target=r.category==="exclusive"?needs.exTargets.slice(0,3).map(exTargetLabel).filter(Boolean).join(" / "):r.category==="hero"?needs.starTargets.slice(0,3).map(x=>x.name).join(" / "):r.category==="drone"?safe.droneTarget(needs.droneLevel):["blueprint","gear_material"].includes(r.category)?shopGearTargetLabel(needs,locale):"";
    const price=referenceCatalogPriceLabel(r,locale),da=diagnosticShopAdjustment(r.category,state?._shop_alignment,locale),opaqueGuard=opaqueContainerGuard(r.category,locale),situationalGuard=situationalUtilityGuard(r.category,state,locale,r.item),paidGuard=paidPurchaseGuard({source:'reference',currency:r.currency,price:r.price},locale),historicalPaid=Boolean(paidGuard.real_money),refDate=localePack(locale)==='fr'?SHOP_REFERENCE_DATE.split('-').reverse().join('/'):SHOP_REFERENCE_DATE,observedContents=isCashCurrency(r.currency)&&cleanName(r.notes)?shopPaymentText(locale).contents(refDate,cleanName(r.notes)):"",baseReason=historicalPaid?shopPaymentText(locale).historical:offerReason(r.category,needs,p);out.push({item:r.item,store:`${r.store} · ${safe.notVerified}`,score:historicalPaid?null:score,score_label:historicalPaid?null:a.score(score),reference_relevance_score:historicalPaid?score:null,reason:[baseReason,shopTargetReason(r.category,target,locale),...da.reasons,opaqueGuard.reason,situationalGuard.reason,observedContents,paidGuard.label,r.temporary?(localePack(locale)==="fr"?"Offre/rotation observée : rescanner avant achat.":"Observed rotating offer: rescan before buying."):""].filter(Boolean).join(" ").trim(),target,verdict:action.verify,verdict_key:historicalPaid?"historical_paid":"strategy",price_label:price,source:"reference",category:r.category,currency:r.currency,availability_label:safe.notVerified,diagnostic_alignment:{resource_family:da.family,priority_rank:da.rank,bonus:da.bonus},paid_guard:paidGuard,current_price_verified:false,current_contents_verified:false,cost_gain_verified:false,historical_reference_paid:historicalPaid,ranking_eligible:!historicalPaid,purchase_recommendation_eligible:!historicalPaid,reference_observed_contents:cleanName(r.notes)||null,opaque_container:opaqueGuard.opaque,opaque_score_cap:opaqueGuard.cap,situational_resource:situationalGuard.situational,situational_context_confirmed:situationalGuard.contextual,situational_score_cap:situationalGuard.cap,_sort:score});
  }
  const seen=new Set(),seenCategories=new Set(),ranked=[];
  const sorted=out.sort((a,b)=>b._sort-a._sort);
  for(const x of sorted){
    const key=`${x.item}|${x.store}`;
    if(seen.has(key))continue;
    if(seenCategories.has(x.category)&&ranked.length<6)continue;
    seen.add(key);seenCategories.add(x.category);ranked.push(x);
    if(ranked.length>=10)break;
  }
  // Payment-channel separation must not make the paid section disappear merely because
  // in-game resources occupy the global TOP 10. Add at most two guarded reference paid options.
  const paidAlready=()=>ranked.filter(x=>purchaseType(x.currency)==='real_money').length;
  for(const x of sorted){
    if(paidAlready()>=2)break;
    if(purchaseType(x.currency)!=='real_money')continue;
    const key=`${x.item}|${x.store}`;if(seen.has(key))continue;
    seen.add(key);ranked.push(x);
  }
  return ranked.slice(0,12).map((x,i)=>{const {_sort,...rest}=x;return {...rest,rank:i+1}});
}

function referenceObservedPriceLabel(offer,store,locale){
  const live=priceLabel({...offer,currency:offer?._currency||offer?.currency},locale);
  if(num(offer?.price)!==null)return live;
  const ref=findShopReference(offer?.item_name,store),sameStore=ref&&canonicalShopStore(ref.store)===canonicalShopStore(store);
  if(!ref||!sameStore||Number(ref.match_score)<96||num(ref.price)===null)return live;
  const date=localePack(locale)==="fr"?SHOP_REFERENCE_DATE.split("-").reverse().join("/"):SHOP_REFERENCE_DATE;
  if(isCashCurrency(ref.currency))return shopPaymentText(locale).observed(date,priceLabel({price:ref.price,currency:ref.currency},locale));
  const prefix=localePack(locale)==="fr"?`réf. ${date} · `:`ref. ${date} · `;
  return `${prefix}${priceLabel({price:ref.price,currency:ref.currency},locale)}`;
}

function buildShopAdvice(state,locale,analysis){
  const p=shopText(locale),a=adaptiveText(locale),safe=shopSafetyText(locale),rawNeeds=heroNeedSnapshot(state),needs=alignShopNeedsWithDiagnostic(rawNeeds,analysis),shop=state?.shop||{},profileConfidence=shopProfileConfidence(needs),alignment=buildShopDiagnosticAlignment(analysis),stateCtx={...state,_locale:locale,_shop_alignment:alignment},caps=Array.isArray(state?.sync?.capabilities)?state.sync.capabilities:[],officialCatalog=Boolean(state?.sync?.sources?.official&&(caps.includes("shop_catalog")||caps.includes("shop")||caps.includes("store_catalog"))),referenceStats=shopReferenceStats();
  let recommendations=[],confidence=Math.min(90,profileConfidence),scanBased=false,store="Last War Shop",catalogFreshness=freshnessInfo(shop?.updated_at||null,"shop",locale),observed=officialCatalog?{rows:(Array.isArray(shop?.offers)?shop.offers.filter(o=>o?.sold!==true).map(o=>({...o,_store_type:canonicalShopStore(shop?.store_type)||shop?.store_type||"Last War Shop",_currency:normalizeObservedCurrency({...o,_store_type:shop?.store_type,_currency:o?.currency||shop?.currency}).currency,_currency_balance:shop?.currency_balance,_updated_at:shop?.updated_at})):[]),raw_count:Array.isArray(shop?.offers)?shop.offers.length:0,unique_count:Array.isArray(shop?.offers)?shop.offers.filter(o=>o?.sold!==true).length:0,sold_count:Array.isArray(shop?.offers)?shop.offers.filter(o=>o?.sold===true).length:0,deduped_count:0,price_conflict_count:0}:observedShopOffers(shop);
  const liveObserved=observed.rows.filter(o=>freshnessInfo(o?._updated_at||null,"shop",locale).status!=="stale"&&freshnessInfo(o?._updated_at||null,"shop",locale).status!=="unknown");
  if(liveObserved.length){
    scanBased=!officialCatalog;
    const storeSet=new Set(liveObserved.map(o=>o._store_type).filter(Boolean));store=storeSet.size===1?[...storeSet][0]:"Boutiques Last War";
    recommendations=liveObserved.map(o=>{
      const offerStore=o._store_type||store,cat=itemCategory(o?.item_name,o?.category,offerStore),availability_label=officialCatalog?safe.officialAvailability:safe.visibleAvailability,fresh=freshnessInfo(o?._updated_at||null,"shop",locale);
      if(cat==="other"){return {item:cleanName(o?.item_name)||"—",store:offerStore,score:null,score_label:safe.unanalysed,reason:safe.unknownReason,target:"",verdict:safe.unanalysed,verdict_key:"unknown",price_label:referenceObservedPriceLabel(o,offerStore,locale),source:officialCatalog?"official":"scan",category:cat,availability_label,data_freshness:fresh,_sort:-1};}
      const offerState={...stateCtx,shop:{...shop,currency:o._currency||o.currency||"",currency_balance:o._currency_balance??null}},scored=scoreVisibleOffer({...o,currency:o._currency||o.currency,store_type:offerStore},needs,offerState),{score,factors,budget}=scored,v=verdict(score,p),target=cat==="exclusive"?needs.exTargets.slice(0,3).map(exTargetLabel).filter(Boolean).join(" / "):cat==="hero"?needs.starTargets.slice(0,3).map(x=>x.name).join(" / "):cat==="drone"?safe.droneTarget(needs.droneLevel):["blueprint","gear_material"].includes(cat)?shopGearTargetLabel(needs,locale):"",ref=findShopReference(o?.item_name,offerStore),source=officialCatalog?"official":"scan",currentPriceVerified=Boolean(num(o?._price??o?.price)!==null&&(source==="official"||(fresh.status==="fresh"&&(num(o?._price_confidence)===null||num(o?._price_confidence)>=.8)))),currentContentsVerified=Boolean(source==="official"||o?.contents_verified===true||o?.content_verified===true),costGainVerified=Boolean(o?.cost_gain_verified===true),paidGuard=paidPurchaseGuard({source,currency:budget?.currency||o?._currency||o?.currency,price:budget?.price,current_price_verified:currentPriceVerified,current_contents_verified:currentContentsVerified,cost_gain_verified:costGainVerified},locale),reason=[offerReason(cat,needs,p),shopTargetReason(cat,target,locale),...factors,ref?referenceMatchText(locale,ref.match_score):"",fresh.label,paidGuard.label].filter(Boolean).join(" ");
      let verdictKey=v.key,verdictLabel=v.label;
      if(fresh.blocks_paid&&paidGuard.real_money){verdictKey="refresh";verdictLabel=refreshBeforePaidText(locale);}
      else if(paidGuard.real_money&&!paidGuard.strong_recommendation_allowed){verdictKey="verify_paid";verdictLabel=shopAlignmentText(locale).verify;}
      return {item:cleanName(o?.item_name)||"—",store:offerStore,score,score_label:a.score(score),reason,target,verdict:verdictLabel,verdict_key:verdictKey,price_label:referenceObservedPriceLabel(o,offerStore,locale),source,category:cat,currency:budget?.currency||o?._currency||o?.currency||"",budget,paid_guard:paidGuard,current_price_verified:currentPriceVerified,current_contents_verified:currentContentsVerified,cost_gain_verified:costGainVerified,availability_label,data_freshness:fresh,opaque_container:scored.opaque_container,opaque_score_cap:scored.opaque_score_cap,situational_resource:scored.situational_resource,situational_context_confirmed:scored.situational_context_confirmed,situational_score_cap:scored.situational_score_cap,_sort:score};
    }).sort((x,y)=>(y._sort??-1)-(x._sort??-1)).slice(0,12).map((x,i)=>{const {_sort,...rest}=x;return {...rest,rank:i+1}});
    const quality=Math.min(30,liveObserved.length)+Math.min(20,new Set(liveObserved.map(o=>o._store_type)).size*4);
    confidence=Math.max(confidence,Math.round(profileConfidence*.66+(68+quality)*.34));confidence=Math.min(officialCatalog?98:92,confidence);
    const freshest=liveObserved.map(x=>x._updated_at).filter(Boolean).sort().at(-1);catalogFreshness=freshnessInfo(freshest||shop?.updated_at||null,"shop",locale);
  }else{
    recommendations=referenceCatalogRecommendations(stateCtx,locale,needs);
    if(!recommendations.length)recommendations=genericShopRecommendations(stateCtx,locale,needs);
    confidence=Math.min(officialCatalog?92:80,Math.max(40,profileConfidence));
  }
  confidence=Math.max(0,confidence-(liveObserved.length?(catalogFreshness?.confidence_penalty||0):0));
  const sourceEvidenceConfidence=officialCatalog?98:liveObserved.length?Math.max(72,94-(catalogFreshness?.confidence_penalty||0)):recommendations.some(x=>x?.source==="reference")?68:52;
  const dataConfidence=Math.max(0,Math.min(sourceEvidenceConfidence,profileConfidence));
  const rankingConfidence=Math.max(0,Math.min(96,Math.round(profileConfidence*.6+sourceEvidenceConfidence*.4)));
  recommendations=recommendations.map(x=>decorateShopRecommendation(x,profileConfidence,locale));
  const recommendationGroups={game_currency:recommendations.filter(x=>x.purchase_type==='game_currency'),diamonds:recommendations.filter(x=>x.purchase_type==='diamonds'),real_money:recommendations.filter(x=>x.purchase_type==='real_money'&&!x.historical_reference_paid),historical_paid:recommendations.filter(x=>x.purchase_type==='real_money'&&x.historical_reference_paid),unknown:recommendations.filter(x=>x.purchase_type==='unknown')};
  const balance=num(shop?.currency_balance),currency=cleanName(shop?.currency),budgetSummary=(balance!==null&&isDiamondCurrency(currency||store))?` ${shopEvidenceText(locale).reserve(VIP30_REFERENCE_POLICY.diamonds)}`:"";
  let summary,catalogStatus,catalogLabel;
  if(officialCatalog){summary=liveObserved.length?safe.officialSummary(store,liveObserved.length):safe.officialEmpty;catalogStatus="official";catalogLabel=safe.officialLabel;}
  else if(liveObserved.length){summary=observedSummary(locale,new Set(liveObserved.map(o=>o._store_type)).size,liveObserved.length,observed.raw_count);catalogStatus="partial";catalogLabel=safe.partialLabel;}
  else {summary=referenceSummary(locale,referenceStats);catalogStatus="reference";catalogLabel=referenceLabel(locale);}
  summary+=budgetSummary;
  return {summary,confidence:dataConfidence,confidence_label:shopEvidenceText(locale).data(dataConfidence),data_confidence:dataConfidence,source_evidence_confidence:sourceEvidenceConfidence,profile_confidence:profileConfidence,ranking_confidence:rankingConfidence,scan_based:scanBased,catalog_status:catalogStatus,catalog_complete:officialCatalog,catalog_label:catalogLabel,store_type:store,updated_at:shop?.updated_at||null,data_freshness:catalogFreshness,recommendations,recommendation_groups:recommendationGroups,knowledge_date:SHOP_REFERENCE_DATE,reference_catalog:referenceStats,observed_shop_count:new Set(liveObserved.map(o=>o._store_type)).size,observed_offer_count:liveObserved.length,raw_observed_offer_count:observed.raw_count,unique_observed_offer_count:liveObserved.length,sold_observed_offer_count:observed.sold_count,deduped_offer_count:observed.deduped_count,price_conflict_count:observed.price_conflict_count,meta_intelligence:metaContext(state),method:officialCatalog?"official-shop-catalog + separated-relevance-evidence-availability + diagnostic-pro-single-source-of-truth + paid-purchase-evidence-guard + historical-paid-reference-quarantine + payment-channel-separation + opaque-container-guard + situational-utility-guard + adaptive-account-rules + dated-vip-reference + VS/season-context":liveObserved.length?"multi-shop-visible-scan + separated-relevance-evidence-availability + item-deduplication + store-currency-integrity + sold-offer-exclusion + ambiguous-price-suppression + dated-reference-matching + diagnostic-pro-single-source-of-truth + paid-purchase-evidence-guard + historical-paid-reference-quarantine + payment-channel-separation + opaque-container-guard + situational-utility-guard + adaptive-account-rules + dated-vip-reference + VS/season-context":"dated-user-screenshot-reference + separated-relevance-evidence-availability + diagnostic-pro-single-source-of-truth + paid-purchase-evidence-guard + historical-paid-reference-quarantine + payment-channel-separation + opaque-container-guard + situational-utility-guard + adaptive-account-rules + availability-unverified",diagnostic_alignment:alignment,budget:{currency:currency||null,balance,reserve_diamonds:VIP30_REFERENCE_POLICY.diamonds,reserve_days:VIP30_REFERENCE_POLICY.days,reserve_basis:VIP30_REFERENCE_POLICY.evidence_kind,reserve_checked_at:VIP30_REFERENCE_POLICY.checked_at,reserve_live_verified:VIP30_REFERENCE_POLICY.live_verified,reserve_requires_in_game_check:VIP30_REFERENCE_POLICY.requires_in_game_check},needs:{exclusive_urgency:Math.round(needs.exclusiveUrgency*100),stars_urgency:Math.round(needs.starsUrgency*100),gear_urgency:Math.round(needs.gearUrgency*100),drone_urgency:Math.round(needs.droneUrgency*100)},limitations:officialCatalog?[]:["Relevance score is not a certainty score","Reference catalogue is dated and does not prove current availability","Exact reference prices are dated and must be checked in game","Fresh scans are accumulated across multiple shops for live ranking","Duplicate rows from the same item/shop are merged","Store currency is normalized only when the shop has a deterministic currency","Sold items are excluded and ambiguous numeric prices are suppressed","Unknown item types receive no purchase recommendation","Opaque chests cannot outrank known direct progression solely on rarity","Situational utilities require matching VS/Season/event context before they can outrank direct progression","Paid offers require fresh account/shop data","Real-money offers never receive a strong buy recommendation unless current price, current contents and cost/gain are explicitly verified","Shop exclusive targets inherit the current Diagnostic PRO exclusive ranking","Reference real-money prices are labelled as dated observations, never as current prices","Historical real-money references are quarantined outside current paid-offer rankings until a fresh scan or official source confirms availability"],sources:[officialCatalog?"Official Last War read-only catalogue":"User-provided Last War shop scans",`WarBoost screenshot reference catalogue ${SHOP_REFERENCE_DATE}`,"Public community cross-check for VIP30 reference (checked 2026-08-30)","WarBoost saved account state"]};
}


function allianceRoleLine(roleCounts,lang){
  const order=["R5","R4","R3","R2","R1"],parts=order.map(r=>`${r} ${roleCounts[r]||0}`).join(" · ");
  if(lang==="fr")return `Répartition : ${parts}.`;
  if(lang==="es")return `Distribución: ${parts}.`;
  if(lang==="de")return `Verteilung: ${parts}.`;
  if(lang==="ja")return `構成：${parts}。`;
  if(lang==="zh")return `分布：${parts}。`;
  if(lang==="ar")return `التوزيع: ${parts}.`;
  return `Rank split: ${parts}.`;
}
const ALLIANCE_AI={
 fr:{empty:"Fais rejoindre les membres et synchronise leur progression avant de générer un plan fiable.",line:(a,r,i)=>`${a} actifs confirmés · ${r} à actualiser · ${i} inactifs probables.`,refresh:"Données trop anciennes pour exclure ou figer les rôles : actualise d’abord le roster.",core:n=>`Noyau actif conseillé : ${n}.`,action:"R5/R4 pilotent · R3 encadrent · R2 relaient/soutiennent · R1 forment la base. Contacte toujours un membre avant toute exclusion."},
 en:{empty:"Invite members and synchronize their progression before generating a reliable plan.",line:(a,r,i)=>`${a} confirmed active · ${r} need refresh · ${i} probable inactive.`,refresh:"Data is too old to remove members or lock roles: refresh the roster first.",core:n=>`Suggested active core: ${n}.`,action:"R5/R4 lead · R3 coordinate · R2 relay/support · R1 form the base. Always contact a member before removal."},
 es:{empty:"Invita miembros y sincroniza su progresión antes de generar un plan fiable.",line:(a,r,i)=>`${a} activos confirmados · ${r} por actualizar · ${i} inactivos probables.`,refresh:"Los datos son demasiado antiguos para excluir o fijar roles: actualiza primero el roster.",core:n=>`Núcleo activo recomendado: ${n}.`,action:"R5/R4 dirigen · R3 coordinan · R2 apoyan/enlazan · R1 forma la base. Contacta siempre antes de excluir."},
 de:{empty:"Lade Mitglieder ein und synchronisiere ihren Fortschritt, bevor du einen verlässlichen Plan erstellst.",line:(a,r,i)=>`${a} bestätigt aktiv · ${r} zu aktualisieren · ${i} wahrscheinlich inaktiv.`,refresh:"Die Daten sind zu alt für Ausschlüsse oder feste Rollen: zuerst den Roster aktualisieren.",core:n=>`Empfohlener aktiver Kern: ${n}.`,action:"R5/R4 führen · R3 koordinieren · R2 unterstützen/vermitteln · R1 bildet die Basis. Vor Ausschluss immer Kontakt aufnehmen."},
 ja:{empty:"信頼できる計画を作る前にメンバーを招待し進捗を同期してください。",line:(a,r,i)=>`アクティブ確認 ${a} · 更新必要 ${r} · 非アクティブの可能性 ${i}。`,refresh:"除名や最終役割固定には信頼度不足です。最終配置前にロスターを更新してください。",core:n=>`推奨アクティブ中核：${n}。`,action:"R5/R4が判断、R3が運用リーダー、R2が連携/支援、R1が基盤。除名前に必ず連絡してください。"},
 zh:{empty:"先邀请成员并同步进度，再生成可靠计划。",line:(a,r,i)=>`已确认活跃 ${a} · 需要更新 ${r} · 可能不活跃 ${i}。`,refresh:"当前可靠度不足以移除成员或锁定角色；最终分配前请更新名单。",core:n=>`建议活跃核心：${n}。`,action:"R5/R4负责决策，R3作为行动干部，R2负责联络/支援，R1作为基础。移除成员前务必先联系。"},
 ar:{empty:"ادعُ الأعضاء وزامن تقدمهم قبل إنشاء خطة موثوقة.",line:(a,r,i)=>`${a} نشط مؤكد · ${r} يحتاج تحديث · ${i} غير نشط على الأرجح.`,refresh:"الموثوقية غير كافية للاستبعاد أو تثبيت الأدوار؛ حدّث القائمة قبل التوزيع النهائي.",core:n=>`النواة النشطة المقترحة: ${n}.`,action:"R5/R4 يقودان القرار، R3 قادة عمليات، R2 دعم/ربط وR1 قاعدة التحالف. تواصل دائماً قبل الاستبعاد."}
};
function buildAllianceAdvice(state,locale){
  const lang=localePack(locale),pack=ALLIANCE_AI[lang]||ALLIANCE_AI.en,members=Array.isArray(state?.alliance?.members)?state.alliance.members:[];
  if(!members.length)return {advice:pack.empty,confidence:20,activity:{active:0,refresh:0,inactive:0,unknown:0},roles:{R5:0,R4:0,R3:0,R2:0,R1:0},immediate_actions:[],plan_b:[]};
  const summary=summarizeAllianceActivity(members),counts=summary.counts;
  const byPower=rows=>rows.map(r=>r.member||r).filter(Boolean).sort((a,b)=>(num(b.power_m)||0)-(num(a.power_m)||0));
  const active=byPower(summary.rows.filter(r=>r.activity.key==="active"));
  const core=active.slice(0,5).map(m=>cleanName(m.name)).filter(Boolean);
  // V2.5.9: tactical roles are assigned ONLY from confirmed-active members.
  // Stale/unknown members stay in refresh status and are never silently placed in rally/defense/mobile/reserve.
  const rally=active.slice(0,5).map(m=>cleanName(m.name)).filter(Boolean);
  const defense=active.slice(5,10).map(m=>cleanName(m.name)).filter(Boolean);
  const mobile=active.slice(10,15).map(m=>cleanName(m.name)).filter(Boolean);
  const reserve=active.slice(15).map(m=>cleanName(m.name)).filter(Boolean);
  const needsRefresh=(counts.refresh||0)>0||(counts.unknown||0)>0;
  const immediate=[
    {rank:1,kind:"rally",action_key:"alliance_rally_core",members:rally,count:rally.length},
    {rank:2,kind:"defense",action_key:"alliance_defense_group",members:defense,count:defense.length},
    {rank:3,kind:"mobile",action_key:"alliance_mobile_group",members:mobile,count:mobile.length},
    {rank:4,kind:"reserve",action_key:"alliance_reserve_group",members:reserve,count:reserve.length}
  ].filter(x=>x.count>0);
  const planB=[];
  if(needsRefresh)planB.push({rank:1,kind:"refresh",action_key:"alliance_plan_b_refresh",count:(counts.refresh||0)+(counts.unknown||0)});
  if(active.length>0&&active.length<5)planB.push({rank:planB.length+1,kind:"defensive",action_key:"alliance_plan_b_defensive",count:active.length});
  if(!planB.length)planB.push({rank:1,kind:"stable",action_key:"alliance_plan_b_stable",count:active.length});
  const advice=[pack.line(counts.active,counts.refresh,counts.inactive),allianceRoleLine(summary.roleCounts,lang),needsRefresh?pack.refresh:"",core.length?pack.core(core.join(" / ")):"",pack.action].filter(Boolean).join("\n");
  return {advice,confidence:summary.confidence,activity:counts,roles:summary.roleCounts,core,reliability:needsRefresh?"refresh_required":"usable",immediate_actions:immediate,plan_b:planB,policy:"No member is removed by this advice; uncertain activity stays marked for refresh."};
}

const CONTEXT_AI={
 fr:{
  vs:{missing:"Synchronise le VS pour obtenir un plan fiable.",day:d=>`VS · Jour ${d}`,lead:n=>`Avance de ${n}.`,trail:n=>`Retard de ${n}.`,even:"Scores proches.",hold:"Économise les ressources qui ne marquent pas aujourd’hui.",player:t=>`Compte joueur : ${t}`,confidence:n=>`Confiance ${n}%`,days:{1:"Priorité : actions et ressources Drone/Radar si elles correspondent aux tâches affichées aujourd’hui.",2:"Priorité : construction et accélérateurs de bâtiment si ce sont les tâches du jour.",3:"Priorité : recherche/technologie et accélérateurs de science si ce sont les tâches du jour.",4:"Priorité : héros, recrutement et améliorations héros uniquement si elles marquent aujourd’hui.",5:"Priorité : entraînement/unités et accélérateurs associés uniquement sur les tâches actives.",6:"Priorité : combat VS. Protège les ressources de progression qui ne donnent pas de points de combat."}},
  season:{missing:"Scanne ou synchronise la Saison pour obtenir un diagnostic fiable.",progress_unknown:"Progression inconnue : actualise avant toute recommandation saisonnière chiffrée.",confirm_state:"Confirme d’abord si une saison est active, terminée ou en entre-saisons.",unknown_state:(n,p)=>`${n||"Saison"} · état à confirmer.${p?` Dernière profession connue : ${p}.`:""}`,ended:(n,p)=>`${n||"Saison"} terminée.${p?` Dernière profession connue : ${p}.`:""} La progression actuelle n’est plus applicable.`,interseason:(n,p)=>`${n||"Saison"} terminée · entre-saisons.${p?` Dernière profession connue : ${p}.`:""} La progression saisonnière n’est plus applicable.`,wait_next:"Actualise WarBoost quand la prochaine saison s’ouvre avant de dépenser des ressources saisonnières rares.",no_old_season:"Aucun conseil S6/Éveil S6 n’est appliqué comme actif pendant l’entre-saisons.",head:(d,t)=>`Saison · Jour ${d||"—"}${t?`/${t}`:""}`,progress:p=>`Progression ${p}%.`,profession:p=>`Profession : ${p}.`,resistance:r=>`Résistance : ${r}.`,unlock:"Priorité : débloque d’abord le prochain palier saisonnier qui augmente ta progression globale.",resist:"La résistance semble être un signal critique : évite de disperser les ressources saisonnières avant d’avoir sécurisé le prochain palier utile.",late:"Fin de saison proche : privilégie les améliorations à retour immédiat et évite les investissements qui ne seront rentables qu’après la saison.",player:t=>`Compte joueur : ${t}`,confidence:n=>`Confiance ${n}%`}
 },
 en:{
  vs:{missing:"Synchronize VS to get a reliable plan.",day:d=>`VS · Day ${d}`,lead:n=>`Lead by ${n}.`,trail:n=>`Behind by ${n}.`,even:"Scores are close.",hold:"Save resources that do not score today.",player:t=>`Player account: ${t}`,confidence:n=>`Confidence ${n}%`,days:{1:"Priority: Drone/Radar actions and resources only when they match today’s displayed tasks.",2:"Priority: construction and building speed-ups when they are today’s tasks.",3:"Priority: research/technology and science speed-ups when they are today’s tasks.",4:"Priority: heroes, recruitment and hero upgrades only when they score today.",5:"Priority: troop training/units and related speed-ups only for active tasks.",6:"Priority: VS combat. Protect progression resources that do not generate combat points."}},
  season:{missing:"Scan or synchronize the Season to get a reliable diagnosis.",progress_unknown:"Progress is unknown: refresh before any numeric season recommendation.",confirm_state:"First confirm whether a season is active, ended, or between seasons.",unknown_state:(n,p)=>`${n||"Season"} · state needs confirmation.${p?` Last known profession: ${p}.`:""}`,ended:(n,p)=>`${n||"Season"} ended.${p?` Last known profession: ${p}.`:""} Current season progress is no longer applicable.`,interseason:(n,p)=>`${n||"Season"} ended · between seasons.${p?` Last known profession: ${p}.`:""} Season progress is no longer applicable.`,wait_next:"Refresh WarBoost when the next season opens before spending scarce season resources.",no_old_season:"No S6/Awakening advice is treated as active between seasons.",head:(d,t)=>`Season · Day ${d||"—"}${t?`/${t}`:""}`,progress:p=>`Progress ${p}%.`,profession:p=>`Profession: ${p}.`,resistance:r=>`Resistance: ${r}.`,unlock:"Priority: unlock the next season milestone that improves overall progression first.",resist:"Resistance appears to be a critical signal: avoid spreading season resources before securing the next useful threshold.",late:"Late season: favor upgrades with immediate return and avoid investments that only pay off after the season.",player:t=>`Player account: ${t}`,confidence:n=>`Confidence ${n}%`}
 },
 es:{
  vs:{missing:"Sincroniza VS para obtener un plan fiable.",day:d=>`VS · Día ${d}`,lead:n=>`Ventaja de ${n}.`,trail:n=>`Desventaja de ${n}.`,even:"Marcadores ajustados.",hold:"Guarda los recursos que no puntúan hoy.",player:t=>`Cuenta jugador: ${t}`,confidence:n=>`Confianza ${n}%`,days:{1:"Prioridad: Drone/Radar solo si coincide con las tareas visibles de hoy.",2:"Prioridad: construcción y aceleradores de edificio si son las tareas del día.",3:"Prioridad: investigación/tecnología y aceleradores de ciencia si puntúan hoy.",4:"Prioridad: héroes, reclutamiento y mejoras de héroe solo si puntúan hoy.",5:"Prioridad: entrenamiento/tropas y aceleradores asociados solo en tareas activas.",6:"Prioridad: combate VS. Protege recursos de progresión que no dan puntos de combate."}},
  season:{missing:"Escanea o sincroniza la Temporada para obtener un diagnóstico fiable.",progress_unknown:"Progreso desconocido: actualiza antes de cualquier recomendación numérica de temporada.",confirm_state:"Confirma primero si la temporada está activa, terminada o entre temporadas.",unknown_state:(n,p)=>`${n||"Temporada"} · estado por confirmar.${p?` Última profesión conocida: ${p}.`:""}`,ended:(n,p)=>`${n||"Temporada"} terminada.${p?` Última profesión conocida: ${p}.`:""} El progreso actual ya no aplica.`,interseason:(n,p)=>`${n||"Temporada"} terminada · entre temporadas.${p?` Última profesión conocida: ${p}.`:""} El progreso ya no aplica.`,wait_next:"Actualiza WarBoost cuando empiece la próxima temporada antes de gastar recursos de temporada escasos.",no_old_season:"No se aplica consejo S6/Despertar S6 como activo entre temporadas.",head:(d,t)=>`Temporada · Día ${d||"—"}${t?`/${t}`:""}`,progress:p=>`Progreso ${p}%.`,profession:p=>`Profesión: ${p}.`,resistance:r=>`Resistencia: ${r}.`,unlock:"Prioridad: desbloquea primero el siguiente hito de temporada que mejore tu progresión global.",resist:"La resistencia parece crítica: no disperses recursos de temporada antes de asegurar el siguiente umbral útil.",late:"Final de temporada: prioriza mejoras con retorno inmediato.",player:t=>`Cuenta jugador: ${t}`,confidence:n=>`Confianza ${n}%`}
 },
 de:{
  vs:{missing:"Synchronisiere VS für einen verlässlichen Plan.",day:d=>`VS · Tag ${d}`,lead:n=>`Vorsprung ${n}.`,trail:n=>`Rückstand ${n}.`,even:"Punktestand knapp.",hold:"Spare Ressourcen, die heute keine Punkte bringen.",player:t=>`Spielerkonto: ${t}`,confidence:n=>`Konfidenz ${n}%`,days:{1:"Priorität: Drohne/Radar nur, wenn es den heutigen Aufgaben entspricht.",2:"Priorität: Bau und Bau-Beschleuniger, wenn dies heute zählt.",3:"Priorität: Forschung/Technologie und Forschungs-Beschleuniger, wenn dies heute zählt.",4:"Priorität: Helden, Rekrutierung und Helden-Upgrades nur bei heutiger Wertung.",5:"Priorität: Truppentraining und passende Beschleuniger nur für aktive Aufgaben.",6:"Priorität: VS-Kampf. Schütze Fortschrittsressourcen ohne Kampfpunkte."}},
  season:{missing:"Scanne oder synchronisiere die Saison für eine verlässliche Diagnose.",progress_unknown:"Fortschritt unbekannt: vor numerischen Saisonempfehlungen aktualisieren.",confirm_state:"Bestätige zuerst, ob die Saison aktiv, beendet oder zwischen Saisons ist.",unknown_state:(n,p)=>`${n||"Saison"} · Status muss bestätigt werden.${p?` Letzter bekannter Beruf: ${p}.`:""}`,ended:(n,p)=>`${n||"Saison"} beendet.${p?` Letzter bekannter Beruf: ${p}.`:""} Aktueller Saisonfortschritt ist nicht mehr anwendbar.`,interseason:(n,p)=>`${n||"Saison"} beendet · zwischen Saisons.${p?` Letzter bekannter Beruf: ${p}.`:""} Saisonfortschritt ist nicht mehr anwendbar.`,wait_next:"WarBoost aktualisieren, wenn die nächste Saison beginnt, bevor seltene Saisonressourcen ausgegeben werden.",no_old_season:"Zwischen Saisons werden keine S6-/Awakening-Empfehlungen als aktiv behandelt.",head:(d,t)=>`Saison · Tag ${d||"—"}${t?`/${t}`:""}`,progress:p=>`Fortschritt ${p}%.`,profession:p=>`Beruf: ${p}.`,resistance:r=>`Resistenz: ${r}.`,unlock:"Priorität: zuerst den nächsten Saison-Meilenstein freischalten, der den Gesamtfortschritt erhöht.",resist:"Resistenz wirkt kritisch: Saisonressourcen nicht verteilen, bevor der nächste sinnvolle Schwellenwert gesichert ist.",late:"Späte Saison: Upgrades mit sofortigem Nutzen priorisieren.",player:t=>`Spielerkonto: ${t}`,confidence:n=>`Konfidenz ${n}%`}
 },
 ja:{
  vs:{missing:"VSを同期すると信頼できる計画を作成できます。",day:d=>`VS・${d}日目`,lead:n=>`${n}リード。`,trail:n=>`${n}ビハインド。`,even:"スコアは接近中。",hold:"今日得点にならない資源は保存。",player:t=>`プレイヤー：${t}`,confidence:n=>`信頼度 ${n}%`,days:{1:"優先：本日の表示タスクに一致する場合のみドローン/レーダー関連。",2:"優先：本日の対象なら建造と建造加速。",3:"優先：本日の対象なら研究/技術と研究加速。",4:"優先：本日得点する場合のみ英雄・募集・英雄強化。",5:"優先：有効タスクの訓練/部隊と関連加速。",6:"優先：VS戦闘。戦闘点にならない育成資源は温存。"}},
  season:{missing:"シーズンをスキャンまたは同期してください。",progress_unknown:"進捗は不明です。数値ベースのシーズン提案の前に更新してください。",confirm_state:"シーズンが開催中・終了・シーズン間のどれかを先に確認してください。",unknown_state:(n,p)=>`${n||"シーズン"}・状態確認が必要です。${p?` 最後に確認した職業：${p}。`:""}`,ended:(n,p)=>`${n||"シーズン"}は終了しています。${p?` 最後に確認した職業：${p}。`:""} 現在の進捗は適用されません。`,interseason:(n,p)=>`${n||"シーズン"}終了・シーズン間です。${p?` 最後に確認した職業：${p}。`:""} シーズン進捗は適用されません。`,wait_next:"次のシーズン開始を確認してからWarBoostを更新し、希少なシーズン資源を使ってください。",no_old_season:"シーズン間はS6/覚醒S6の助言を開催中として扱いません。",head:(d,t)=>`シーズン・${d||"—"}日目${t?`/${t}`:""}`,progress:p=>`進捗 ${p}%`,profession:p=>`職業：${p}。`,resistance:r=>`耐性：${r}。`,unlock:"優先：全体進行を伸ばす次のシーズン段階を先に解放。",resist:"耐性が重要な可能性があります。次の有効閾値まで季節資源を分散しないでください。",late:"終盤：即効性の高い強化を優先。",player:t=>`プレイヤー：${t}`,confidence:n=>`信頼度 ${n}%`}
 },
 zh:{
  vs:{missing:"同步 VS 后可生成可靠计划。",day:d=>`VS · 第${d}天`,lead:n=>`领先 ${n}。`,trail:n=>`落后 ${n}。`,even:"比分接近。",hold:"保存今天不能得分的资源。",player:t=>`玩家账号：${t}`,confidence:n=>`置信度 ${n}%`,days:{1:"优先：仅当与今日显示任务一致时使用无人机/雷达相关资源。",2:"优先：若为今日任务，投入建造和建造加速。",3:"优先：若为今日任务，投入研究/科技和科研加速。",4:"优先：仅在今日得分时进行英雄、招募和英雄升级。",5:"优先：仅针对当前任务进行训练/部队及相关加速。",6:"优先：VS战斗。保留不能产生战斗积分的养成资源。"}},
  season:{missing:"扫描或同步赛季后可获得可靠诊断。",progress_unknown:"进度未知：在任何数值型赛季建议前先更新。",confirm_state:"请先确认赛季处于进行中、已结束或赛季间隔期。",unknown_state:(n,p)=>`${n||"赛季"} · 状态待确认。${p?` 最后已知职业：${p}。`:""}`,ended:(n,p)=>`${n||"赛季"}已结束。${p?` 最后已知职业：${p}。`:""} 当前赛季进度不再适用。`,interseason:(n,p)=>`${n||"赛季"}已结束 · 赛季间隔期。${p?` 最后已知职业：${p}。`:""} 赛季进度不再适用。`,wait_next:"下一赛季开启后先更新WarBoost，再使用稀有赛季资源。",no_old_season:"赛季间隔期不会把S6/觉醒S6建议当作当前有效。",head:(d,t)=>`赛季 · 第${d||"—"}天${t?`/${t}`:""}`,progress:p=>`进度 ${p}%。`,profession:p=>`职业：${p}。`,resistance:r=>`抗性：${r}。`,unlock:"优先：先解锁能提升整体进度的下一个赛季节点。",resist:"抗性可能是关键瓶颈：先确保下一个有效阈值，再分配赛季资源。",late:"赛季后期：优先即时回报升级。",player:t=>`玩家账号：${t}`,confidence:n=>`置信度 ${n}%`}
 },
 ar:{
  vs:{missing:"زامن VS للحصول على خطة موثوقة.",day:d=>`VS · اليوم ${d}`,lead:n=>`تقدم ${n}.`,trail:n=>`تأخر ${n}.`,even:"النتيجة متقاربة.",hold:"احتفظ بالموارد التي لا تسجل نقاطاً اليوم.",player:t=>`حساب اللاعب: ${t}`,confidence:n=>`الثقة ${n}%`,days:{1:"الأولوية: موارد الدرون/الرادار فقط إذا طابقت مهام اليوم الظاهرة.",2:"الأولوية: البناء وتسريعاته إذا كانت ضمن مهام اليوم.",3:"الأولوية: البحث/التقنية وتسريعات العلم إذا كانت تسجل اليوم.",4:"الأولوية: الأبطال والتجنيد وترقياتهم فقط إذا كانت تسجل اليوم.",5:"الأولوية: تدريب القوات وتسريعاته للمهام النشطة فقط.",6:"الأولوية: قتال VS مع حماية موارد التقدم التي لا تعطي نقاط قتال."}},
  season:{missing:"امسح أو زامن الموسم للحصول على تشخيص موثوق.",progress_unknown:"التقدم غير معروف: حدّث البيانات قبل أي توصية موسمية رقمية.",confirm_state:"أكد أولاً ما إذا كان الموسم نشطاً أو منتهياً أو بين موسمين.",unknown_state:(n,p)=>`${n||"الموسم"} · الحالة تحتاج إلى تأكيد.${p?` آخر مهنة معروفة: ${p}.`:""}`,ended:(n,p)=>`${n||"الموسم"} انتهى.${p?` آخر مهنة معروفة: ${p}.`:""} التقدم الحالي لم يعد قابلاً للتطبيق.`,interseason:(n,p)=>`${n||"الموسم"} انتهى · بين موسمين.${p?` آخر مهنة معروفة: ${p}.`:""} تقدم الموسم لم يعد قابلاً للتطبيق.`,wait_next:"حدّث WarBoost عند بدء الموسم التالي قبل إنفاق موارد موسمية نادرة.",no_old_season:"لا تُعامل نصائح S6/إيقاظ S6 على أنها نشطة بين المواسم.",head:(d,t)=>`الموسم · اليوم ${d||"—"}${t?`/${t}`:""}`,progress:p=>`التقدم ${p}%.`,profession:p=>`المهنة: ${p}.`,resistance:r=>`المقاومة: ${r}.`,unlock:"الأولوية: افتح أولاً العتبة الموسمية التالية التي تزيد التقدم العام.",resist:"المقاومة تبدو إشارة حرجة: لا تشتت موارد الموسم قبل تأمين العتبة المفيدة التالية.",late:"نهاية الموسم: أعط الأولوية للترقيات ذات العائد الفوري.",player:t=>`حساب اللاعب: ${t}`,confidence:n=>`الثقة ${n}%`}
 }
};
function contextPack(locale){return CONTEXT_AI[localePack(locale)]||CONTEXT_AI.en}

function vsPrepText(locale){
  const k=localePack(locale);
  const packs={
    fr:{head:"VS · Préparation du dimanche",focus:"Prépare le Jour 1 : empile les tâches Radar à collecter après le reset de lundi et lance les récoltes pour qu’elles se terminent après le reset. N’utilise pas les ressources réservées aux autres jours VS.",hold:"Dimanche n’est pas un jour de score VS : conserve les accélérateurs, fragments héros et ressources de combat pour leur journée dédiée.",avoid:"À éviter : traiter le dimanche comme le Jour 6 Enemy Buster."},
    en:{head:"VS · Sunday preparation",focus:"Prepare Day 1: stack Radar tasks to collect after Monday reset and send gathers that finish after reset. Do not spend resources reserved for other VS days.",hold:"Sunday is not a VS scoring day: keep speed-ups, hero shards and combat resources for their matching day.",avoid:"Avoid: treating Sunday as Day 6 Enemy Buster."},
    es:{head:"VS · Preparación del domingo",focus:"Prepara el Día 1: acumula tareas de Radar para recoger tras el reinicio del lunes y envía recolecciones que terminen después del reinicio. No gastes recursos de otros días VS.",hold:"El domingo no puntúa en VS: guarda aceleradores, fragmentos de héroe y recursos de combate para su día.",avoid:"Evita tratar el domingo como el Día 6 Enemy Buster."},
    de:{head:"VS · Sonntagsvorbereitung",focus:"Bereite Tag 1 vor: Radar-Aufgaben zum Einsammeln nach dem Montagsreset stapeln und Sammelmärsche so senden, dass sie nach dem Reset enden. Ressourcen anderer VS-Tage nicht ausgeben.",hold:"Sonntag ist kein VS-Wertungstag: Beschleuniger, Heldensplitter und Kampfressourcen für den passenden Tag sparen.",avoid:"Vermeide, Sonntag als Tag 6 Enemy Buster zu behandeln."},
    ja:{head:"VS・日曜準備",focus:"1日目の準備：月曜リセット後に回収できるレーダー任務を貯め、リセット後に完了する採集を出します。他のVS日用の資源は使いません。",hold:"日曜はVS得点日ではありません。加速、英雄欠片、戦闘資源は対応する日に温存します。",avoid:"日曜を6日目 Enemy Buster として扱わないでください。"},
    zh:{head:"VS · 周日准备",focus:"准备第1天：积攒雷达任务到周一重置后领取，并派出在重置后完成的采集。不要消耗其他VS日期专用资源。",hold:"周日不是VS计分日：保留加速、英雄碎片和战斗资源到对应日期。",avoid:"不要把周日当成第6天 Enemy Buster。"},
    ar:{head:"VS · تحضير الأحد",focus:"حضّر اليوم 1: خزّن مهام الرادار لجمعها بعد إعادة ضبط الاثنين وأرسل جمع الموارد لينتهي بعد إعادة الضبط. لا تنفق موارد أيام VS الأخرى.",hold:"الأحد ليس يوم تسجيل نقاط VS: احتفظ بالتسريعات وشظايا الأبطال وموارد القتال ليومها المناسب.",avoid:"تجنب اعتبار الأحد هو اليوم 6 Enemy Buster."}
  };
  return packs[k]||packs.en;
}
function playerTopLine(state,locale){
  const a=buildPlayerAnalysis(state,locale),p=a?.priorities?.[0];
  return p?`${p.title}: ${p.target||p.reason||""}`.trim():a?.summary||"";
}
function buildVsAdvice(state,locale){
  const v=state?.vs||{},pack=contextPack(locale).vs,day=Number(v.day),freshness=freshnessInfo(v.updated_at||null,"vs",locale);
  if(day===0){
    const prep=vsPrepText(locale),confidence=Math.max(35,Math.min(82,55+(state?.updated_at||state?.sync?.last_sync?10:0)-(freshness?.confidence_penalty||0))),priorities=[{rank:1,kind:"prep",text:prep.focus},{rank:2,kind:"keep",text:prep.hold},{rank:3,kind:"avoid",text:prep.avoid}];
    return {advice:priorities.map(x=>x.text).join(" "),confidence,priorities,day:0,week:v.week||null,opponent:v.opponent||null,score_gap:null,prep_day:true,data_quality:confidence>=75?"high":confidence>=55?"medium":"low",data_freshness:freshness,engine:`warboost-vs-ai-v${ENGINE_VERSION}`};
  }
  if(!Number.isInteger(day)||day<1||day>6)return {advice:pack.missing,confidence:25,priorities:[],data_quality:"low"};
  const priorities=[];
  const task=pack.days[day]||pack.hold;
  priorities.push({rank:1,kind:"vs_today",text:task});
  priorities.push({rank:2,kind:"hold",text:pack.hold});
  const us=num(v.our_score),them=num(v.their_score);
  let scoreLine="";
  if(us!==null&&them!==null){const gap=Math.round(Math.abs(us-them)*100)/100;scoreLine=us>them?pack.lead(gap):us<them?pack.trail(gap):pack.even;priorities.push({rank:3,kind:"score",text:scoreLine});}
  const pt=playerTopLine(state,locale);if(pt)priorities.push({rank:priorities.length+1,kind:"player",text:pack.player(pt)});
  let confidence=45+(v.opponent?15:0)+(us!==null&&them!==null?15:0)+(state?.updated_at||state?.sync?.last_sync?10:0);
  confidence=Math.max(25,Math.min(92,confidence-(freshness?.confidence_penalty||0)));
  const advice=[pack.day(day),task,scoreLine,pack.hold,pt?pack.player(pt):"",pack.confidence(confidence)].filter(Boolean).join(" ");
  const isFr=localePack(locale)==="fr";
  const today=task;
  const keep=pack.hold;
  const avoid=isFr?"À éviter : dépenser une ressource rare hors des tâches VS actives.":"Avoid: spending scarce resources outside active VS tasks.";
  const concise=[{rank:1,kind:"today",label:isFr?"Aujourd’hui":"Today",text:today},{rank:2,kind:"keep",label:isFr?"À garder":"Keep",text:keep},{rank:3,kind:"avoid",label:isFr?"À éviter":"Avoid",text:avoid}];
  const conciseAdvice=concise.map(x=>`${x.label} : ${x.text}`).join("\n");
  return {advice:conciseAdvice,confidence,priorities:concise,day,week:v.week||null,opponent:v.opponent||null,score_gap:us!==null&&them!==null?us-them:null,data_quality:confidence>=75?"high":confidence>=55?"medium":"low",data_freshness:freshness,engine:`warboost-vs-ai-v${ENGINE_VERSION}`};
}
function season6AwakeningContext(state,locale,player){
  if(Number(state?.season?.number)!==6||!seasonIsActive(state?.season||{}))return null;
  const tx=awakeningText(locale),s6=player?.season6_awakening||null;
  if(!s6)return {active:true,title:tx.title,target:null,decision_value_index:null,formation_bonus_pct:player?.composition?.formation_bonus_pct??0,tech_priority:null,awakening_swap:null,exact_power_projection:false,model:"relative-decision-value-only"};
  const values=(Array.isArray(s6.hero_value_model)?s6.hero_value_model:[]).filter(Boolean).sort((a,b)=>(Number(b?.decision_value_index)||0)-(Number(a?.decision_value_index)||0));
  const best=values[0]||null,formation=Number(player?.composition?.formation_bonus_pct)||0,measuredHybrid=player?.composition?.measured_hybrid_synergy===true;
  const tech=s6?.tech_priorities?.priorities?.[0]||null;
  let text="";
  if(best?.hero)text=tx.action(best.hero);
  if(formation>=20)text=`${text} ${tx.mono(formation)}`.trim();
  else if(formation<20&&!measuredHybrid)text=`${text} ${tx.hybrid}`.trim();
  return {active:true,title:tx.title,target:best?.hero||null,decision_value_index:best?.decision_value_index??null,text,formation_bonus_pct:formation,main_type:player?.composition?.main_type||null,tech_priority:tech?{key:tech.key,label:tech.label,pct:tech.pct,score:tech.score}:null,awakening_swap:s6.awakening_swap||null,exact_power_projection:false,model:"relative-decision-value-only"};
}
function buildSeasonAdvice(state,locale){
  const s=state?.season||{},pack=contextPack(locale).season,lifecycle=seasonLifecycle(s),day=seasonIsActive(s)?num(s.day):null,total=seasonIsActive(s)?num(s.total_days):null,progress=activeSeasonProgress(s),resistance=seasonIsActive(s)?num(s.resistance):null,freshness=freshnessInfo(s.updated_at||null,"season",locale);
  const player=buildPlayerAnalysis(state,locale),pp=player?.priorities?.[0],pt=pp?`${pp.title}: ${pp.target||pp.reason||""}`.trim():player?.summary||"";
  if(lifecycle==="ended"||lifecycle==="interseason"){
    const historicalProfession=s.profession||null,confidence=Math.max(55,Math.min(92,(s.lifecycle_source?82:68)-(freshness?.confidence_penalty||0)/2));
    const inter=lifecycle==="interseason";
    const text=inter?pack.interseason(s.name||(s.number?`S${s.number}`:""),historicalProfession):pack.ended(s.name||(s.number?`S${s.number}`:""),historicalProfession);
    const priorities=[{rank:1,kind:"refresh",text:pack.wait_next},{rank:2,kind:"hold",text:pack.no_old_season}];
    if(pt)priorities.push({rank:3,kind:"player",text:pack.player(pt)});
    return {advice:[text,pack.wait_next,pack.no_old_season,pt?pack.player(pt):"",pack.confidence(Math.round(confidence))].filter(Boolean).join(" "),confidence:Math.round(confidence),priorities,day:null,total_days:null,progress_pct:null,progress_applicable:false,profession:historicalProfession,last_known_profession:historicalProfession,resistance:null,lifecycle,season_active:false,season6_awakening:null,data_quality:confidence>=75?"high":"medium",data_freshness:freshness,engine:`warboost-season-ai-v${ENGINE_VERSION}`};
  }
  if(lifecycle!=="active"){
    const hasIdentity=Boolean(s.name||s.number||s.profession),confidence=Math.max(20,Math.min(48,30+(hasIdentity?8:0)-(freshness?.confidence_penalty||0)));
    const advice=hasIdentity?pack.unknown_state(s.name||(s.number?`S${s.number}`:""),s.profession||null):pack.missing;
    return {advice,confidence,priorities:[{rank:1,kind:"refresh",text:pack.confirm_state}],day:null,total_days:null,progress_pct:null,progress_applicable:false,profession:s.profession||null,last_known_profession:s.profession||null,resistance:null,lifecycle:"unknown",season_active:false,season6_awakening:null,data_quality:"low",data_freshness:freshness,engine:`warboost-season-ai-v${ENGINE_VERSION}`};
  }
  const s6ctx=season6AwakeningContext(state,locale,player),priorities=[];
  if(s6ctx?.target)priorities.push({rank:1,kind:"awakening",text:`${s6ctx.title} · ${s6ctx.target}: ${s6ctx.text}`});
  priorities.push({rank:priorities.length+1,kind:"unlock",text:pack.unlock});
  if(resistance!==null)priorities.push({rank:priorities.length+1,kind:"resistance",text:pack.resist});
  const late=day!==null&&total!==null&&total>0&&day/total>=.8;if(late)priorities.push({rank:priorities.length+1,kind:"late",text:pack.late});
  if(pt)priorities.push({rank:priorities.length+1,kind:"player",text:pack.player(pt)});
  let confidence=35+(day!==null?15:0)+(total!==null?10:0)+(s.profession?10:0)+(progress!==null?10:0)+(resistance!==null?10:0)+(s6ctx?.target?5:0);
  confidence=Math.max(25,Math.min(92,confidence-(freshness?.confidence_penalty||0)));
  const advice=[pack.head(day,total),progress!==null?pack.progress(progress):pack.progress_unknown,s.profession?pack.profession(s.profession):"",resistance!==null?pack.resistance(resistance):"",s6ctx?.target?`${s6ctx.title} · ${s6ctx.target}: ${s6ctx.text}`:"",s6ctx?.tech_priority?`${s6ctx.tech_priority.label}: ${s6ctx.tech_priority.pct}%`:"",pack.unlock,resistance!==null?pack.resist:"",late?pack.late:"",pt?pack.player(pt):"",pack.confidence(confidence)].filter(Boolean).join(" ");
  return {advice,confidence,priorities:priorities.slice(0,4),day,total_days:total,progress_pct:progress,progress_applicable:progress!==null,profession:s.profession||null,resistance,lifecycle:"active",season_active:true,season6_awakening:s6ctx,data_quality:confidence>=75?"high":confidence>=55?"medium":"low",data_freshness:freshness,engine:`warboost-season-ai-v${ENGINE_VERSION}`};
}
function buildSevenDayPlan(state,analysis){
  const priorities=Array.isArray(analysis?.priorities)?analysis.priorities:[],top=priorities[0]||null,second=priorities[1]||null;
  const confidence=Number(analysis?.confidence)||0,needsData=confidence<60||analysis?.composition?.complete===false||analysis?.data_freshness?.blocks_paid===true;
  const topKind=top?.kind||"scan",topTarget=top?.target||top?.hero||null,secondKind=second?.kind||null,secondTarget=second?.target||second?.hero||null;
  const day=(n,mode,action_key,kind=null,target=null,rule_key="hold_unrelated")=>({day:n,mode,action_key,kind,target,rule_key,no_exact_quantity:true});
  const plan=[];
  plan.push(needsData?day(1,"scan","refresh_data","scan",null,"verify_before_spend"):day(1,"focus","top_priority",topKind,topTarget,"hold_unrelated"));
  plan.push(day(2,"checkpoint","checkpoint_top",topKind,topTarget,"verify_progress"));
  plan.push(second?day(3,"focus","secondary_priority",secondKind,secondTarget,"hold_unrelated"):day(3,"hold","protect_resources",null,null,"hold_unrelated"));
  plan.push(day(4,"scan","measure_progress","scan",null,"verify_progress"));
  // Day 5 and Day 6 are account-wide decisions. Do not pin them to the top hero unless a concrete hero action is actually being prescribed.
  plan.push(day(5,"shop","shop_resources",null,null,"buy_only_if_aligned"));
  plan.push(day(6,"timing","vs_season_timing",null,null,"score_only_when_active"));
  plan.push(day(7,"review","weekly_review",null,null,"recalculate_after_new_data"));
  return {days:plan,top_kind:topKind,top_target:topTarget,generated_at:new Date().toISOString(),policy:"relative-priority-only",exact_quantities:false,rule:"Never invent exact shard/material quantities; spend only against confirmed account data and active timing."};
}

function buildCrossDomain(state,locale,player){
  const vs=buildVsAdvice(state,locale),season=buildSeasonAdvice(state,locale),top=player?.priorities?.[0]||null;
  const tw=top?.timing_window||null;
  const conflict=tw?.status==="hold_if_vs_priority"?"timing_check":tw?.status==="check_payback"?"season_payback_check":null;
  const spendDecision=!top?"insufficient_data":top?.data_freshness?.blocks_paid?"refresh_before_spend":tw?.status==="spend_now"||tw?.status==="now"?"spend_now":tw?.status==="hold_if_vs_priority"?"hold_for_vs":tw?.status==="check_payback"?"validate_payback":"marginal_value_driven";
  return {player_top:top?{kind:top.kind,target:top.target||null,title:top.title,reason:top.reason,resource_family:top.resource_family||resourceFamily(top.kind),timing_window:tw}:null,vs:{confidence:vs.confidence,day:vs.day??null,prep_day:Boolean(vs.prep_day),top:vs.priorities?.[0]?.text||vs.advice},season:{confidence:season.confidence,day:season.day||null,total_days:season.total_days||null,top:season.priorities?.[0]?.text||season.advice},conflict,spend_decision:spendDecision,rule:"Use the highest contextual marginal value; defer scarce spending when VS/Season timing or another detected bottleneck has materially better value."};
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  try{await requireBetaUser(req,{consent:true});}catch(e){return res.status(e?.status||500).json({ok:false,error:e?.code||"beta_access_failed",message:e?.message||"Beta access failed"});}
  const scope=String(req.body?.scope||"player"),s=req.body?.state||{},loc=String(req.body?.locale||"en-GB");
  if(scope==="player"){
    const analysis=buildPlayerAnalysis(s,loc);
    analysis.shop=buildShopAdvice(s,loc,analysis);
    analysis.seven_day_plan=buildSevenDayPlan(s,analysis);
    analysis.cross_context=buildCrossDomain(s,loc,analysis);
    analysis.engine=`warboost-ai-core-v${ENGINE_VERSION}`;
    return res.status(200).json({ok:true,engine:analysis.engine,advice:analysis.summary,analysis});
  }
  if(scope==="alliance"){const role=String(s?.alliance?.role||s?.player?.role||"R1").toUpperCase();if(!["R4","R5"].includes(role))return res.status(403).json({ok:false,error:"manager_role_required",advice:loc.startsWith("fr")?"Plan de guerre réservé aux R5/R4 confirmés.":"War plan is reserved for verified R5/R4."});const a=buildAllianceAdvice(s,loc);return res.status(200).json({ok:true,engine:`warboost-alliance-ai-v${ENGINE_VERSION}`,...a});}
  if(scope==="vs")return res.status(200).json({ok:true,...buildVsAdvice(s,loc)});
  if(scope==="season")return res.status(200).json({ok:true,...buildSeasonAdvice(s,loc)});
  return res.status(400).json({error:"unknown_scope"});
}

export {buildPlayerAnalysis,buildShopAdvice,buildAllianceAdvice,buildVsAdvice,buildSeasonAdvice,buildSevenDayPlan,buildCrossDomain};
