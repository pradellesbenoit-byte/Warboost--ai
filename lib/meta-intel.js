import {seasonIsActive} from './season-lifecycle.js';
import {canonicalHeroKey,canonicalHeroName,heroType} from './heroes.js';
import {selectPrimarySquad} from './squad-identity.js';
// WarBoost V2.5.18 — auditable, topic-scoped multi-source meta intelligence.
// This module NEVER claims to browse Last War live at request time. Community signals are
// explanatory context only; saved/scanned account data and verified game state drive numeric scores.
export const META_EVIDENCE = [
  {id:'official-drone-chests',kind:'official',date:'2025-03-24',observed_at:'2026-08-30',topic:'drone',weight:1.00,publisher:'Last War Support',verified:true,title:"I’ve never seen Level 6 or Level 7 Drone Chests. How can I earn points?",url:'https://firstfungroup.zendesk.com/hc/en-us/articles/39667733120915-I-ve-never-seen-Level-6-or-Level-7-Drone-Chests-How-can-I-earn-points',claims:['Level 6 and Level 7 Drone Component Chests are only available during special events.']},
  {id:'reddit-ew-s6-a',kind:'community',date:'2026-08-29',observed_at:'2026-08-30',topic:'exclusive',weight:.82,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Exclusive weapon priority',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vkrf7t/exclusive_weapon_priority/',claims:['A recent S6 reply recommends bringing multiple main heroes to EW20 before pushing one hero to EW30 because of Awakening-related squad value.']},
  {id:'reddit-air-post-s6',kind:'community',date:'2026-08-30',observed_at:'2026-08-30',topic:'exclusive',weight:.76,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Post S6 - Air Main Advice',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vtyfkf/post_s6_air_main_advice/',claims:['In one post-S6 Air-main account, a reply recommends Schuyler as the next EW30 after DVA and Lucius are already EW30 and the remaining Air heroes are EW20. This is account-specific evidence, not a universal ranking.']},
  {id:'reddit-ew-air-advice',kind:'community',date:'~2026-05',observed_at:'2026-08-30',topic:'exclusive',weight:.70,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Exclusive Weapon Advice',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1twakhl/exclusive_weapon_advice/',claims:['Several replies favor bringing a main Air squad to EW20 before pushing another hero to EW30; other replies emphasize Lucius EW30. The discussion shows context-dependent tradeoffs rather than a single universal hero order.']},
  {id:'reddit-air-gear',kind:'community',date:'2026-08-30',observed_at:'2026-08-30',topic:'gear',weight:.80,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Air Squad gear priority',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vkqile/air_squad_gear_priority/',claims:['Replies commonly prioritize Radar and Armor for survivability, with DVA/Morrison weapon investment and account-specific ordering.']},
  {id:'reddit-gear-general',kind:'community',date:'2026-08-25',observed_at:'2026-08-30',topic:'gear',weight:.78,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Gear priority',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vinpa5/gear_priority/',claims:['Multiple replies favor Radar and Armor before broader offensive upgrades and advise against scattering scarce prints.']},
  {id:'reddit-gear-advice',kind:'community',date:'~2026-04',observed_at:'2026-08-30',topic:'gear',weight:.68,publisher:'Reddit · r/LastWarMobileGame',verified:true,title:'Gear advice',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1swsp7o/gear_advice/',claims:['Multiple replies prioritize Radar, then Armor, and emphasize lineup-specific blueprint allocation.']}
];

function seasonNumber(state){
  const n=Number(state?.season?.number); if(Number.isFinite(n)) return n;
  const m=String(state?.season?.name||'').match(/\d+/); return m?Number(m[0]):null;
}
function mainHeroes(state){
  const selected=selectPrimarySquad(state);
  return (selected?.s?.heroes||[]).filter(Boolean);
}
function exLevel(h,state){
  const name=canonicalHeroKey(h?.name);
  const ext=(state?.exclusive_weapons||[]).find(w=>canonicalHeroKey(w?.hero_name)===name);
  const raw=ext?.level ?? String(h?.exclusive||'').match(/\d+(?:\.\d+)?/)?.[0];
  const n=Number(raw); return Number.isFinite(n)?n:null;
}
function airMain(state){
  const heroes=mainHeroes(state);
  return heroes.filter(h=>heroType(h?.name)==='aircraft').length>=4;
}
const AIR_EX_META_SIGNAL=Object.freeze({DVA:'strong',Lucius:'strong',Skyler:'supportive',Morrison:'supportive',Carlie:'mixed'});
const AIR_EX_META_EVIDENCE=Object.freeze({DVA:['reddit-ew-air-advice'],Lucius:['reddit-ew-air-advice'],Skyler:['reddit-air-post-s6','reddit-ew-air-advice'],Morrison:['reddit-ew-air-advice'],Carlie:['reddit-ew-air-advice']});
function L(lang,key,args={}){const x=String(lang||"en").toLowerCase();const k=x.startsWith("fr")?"fr":x.startsWith("es")?"es":x.startsWith("de")?"de":x.startsWith("ja")?"ja":x.startsWith("zh")?"zh":x.startsWith("ar")?"ar":"en";const P={
 en:{ex20:"S6 community discussions often favor reaching EX20 on several main heroes before a premature EX30 rush. This is context only and does not add score points.",ex30:"S6 community discussions caution against a premature EX30 rush while several main heroes are below EX20. This is context only and does not subtract score points.",gear:"Recent multi-source community evidence supports concentrating scarce gear resources on the main squad.",drone:"Official Last War support confirms that some high-level Drone Component Chests are event-limited. Availability alone does not make Drone the top priority; account ROI still decides.",airPos:`Dated Air-main community discussions mention ${args.hero||'this hero'} as a relevant progression option. This is explanatory context only: account data, breakpoint cost and timing decide the numeric rank.`,airNeg:`Dated Air-main community discussions are mixed on ${args.hero||'this hero'} in generic ordering. This is not a penalty or ban: account data, a close breakpoint and measured need decide the numeric rank.`},
 fr:{ex20:"S6 : plusieurs discussions communautaires favorisent le passage de plusieurs héros principaux à EX20 avant un rush EX30 prématuré. C’est un contexte explicatif uniquement, sans bonus de score.",ex30:"S6 : plusieurs discussions communautaires déconseillent un rush EX30 prématuré tant que plusieurs héros principaux sont sous EX20. C’est un contexte explicatif uniquement, sans malus de score.",gear:"Plusieurs sources communautaires récentes soutiennent la concentration des ressources d’équipement rares sur l’escouade principale.",drone:"Le support officiel Last War confirme que certains coffres de composants Drone de haut niveau sont limités à des événements. La disponibilité ne suffit pas à rendre le Drone prioritaire : le ROI du compte décide.",airPos:`Des discussions communautaires Avion datées mentionnent ${args.hero||'ce héros'} comme option de progression pertinente. C’est un contexte explicatif uniquement : les données du compte, le coût jusqu’au palier et le timing décident du classement chiffré.`,airNeg:`Les discussions communautaires Avion datées sont partagées sur la place de ${args.hero||'ce héros'} dans un ordre générique. Il n’y a ni malus ni interdiction : les données du compte, un palier proche et le besoin mesuré décident du classement chiffré.`},
 es:{ex20:"S6: varias discusiones comunitarias favorecen llevar varios héroes principales a EX20 antes de acelerar un EX30. Es solo contexto y no añade puntos al score.",ex30:"S6: varias discusiones comunitarias desaconsejan acelerar un EX30 mientras varios héroes principales sigan por debajo de EX20. Es solo contexto y no resta puntos al score.",gear:"Varias fuentes comunitarias recientes apoyan concentrar los recursos de equipo escasos en el escuadrón principal.",drone:"El soporte oficial de Last War confirma que algunos cofres de componentes de Dron de alto nivel están limitados a eventos. La disponibilidad no determina la prioridad; manda el ROI de la cuenta.",airPos:`Discusiones comunitarias fechadas de Avión mencionan a ${args.hero||'este héroe'} como opción de progreso relevante. Es contexto explicativo únicamente; los datos de la cuenta, el coste al hito y el timing deciden el ranking numérico.`,airNeg:`Las discusiones comunitarias fechadas de Avión son mixtas sobre ${args.hero||'este héroe'} en un orden genérico. No hay penalización ni prohibición; los datos de la cuenta y los hitos deciden el ranking numérico.`},
 de:{ex20:"S6: Mehrere Community-Diskussionen bevorzugen EX20 auf mehreren Haupthelden vor einem verfrühten EX30-Rush. Das ist nur Kontext und gibt keine Score-Punkte.",ex30:"S6: Community-Diskussionen warnen vor einem verfrühten EX30-Rush, solange mehrere Haupthelden unter EX20 liegen. Das ist nur Kontext und zieht keine Score-Punkte ab.",gear:"Mehrere aktuelle Community-Quellen unterstützen die Konzentration seltener Ausrüstungsressourcen auf den Haupttrupp.",drone:"Der offizielle Last-War-Support bestätigt, dass einige hochstufige Drohnen-Komponentenkisten eventgebunden sind. Verfügbarkeit allein bestimmt keine Priorität; der Konto-ROI entscheidet.",airPos:`Datierte Air-Community-Diskussionen nennen ${args.hero||'diesen Helden'} als relevante Fortschrittsoption. Das ist nur erklärender Kontext; Kontodaten, Meilensteinkosten und Timing bestimmen den numerischen Rang.`,airNeg:`Datierte Air-Community-Diskussionen sind bei ${args.hero||'diesem Helden'} in einer allgemeinen Reihenfolge gemischt. Es gibt keinen Malus und kein Verbot; Kontodaten und Meilensteine bestimmen den numerischen Rang.`},
 ja:{ex20:"S6：複数のコミュニティ議論では、1人を早急にEX30へ進める前に主力複数英雄をEX20へ到達させる案が支持されています。これは説明用の文脈のみで、スコア加点はしません。",ex30:"S6：複数のコミュニティ議論では、主力複数英雄がEX20未満の間の早すぎるEX30を慎重に見る意見があります。これは説明用の文脈のみで、スコア減点はしません。",gear:"複数の最近のコミュニティ情報は、希少な装備資源を主力部隊へ集中する方針を支持しています。",drone:"Last War公式サポートでは、一部の高レベルドローン部品箱がイベント限定であることを確認できます。在庫だけで優先度は決まらず、アカウントROIを優先します。",airPos:`日付付きの航空コミュニティ議論では、${args.hero||'この英雄'}が有力な育成候補として言及されています。これは説明用の文脈のみで、数値順位は実アカウントデータ、節目コスト、タイミングで決まります。`,airNeg:`日付付きの航空コミュニティ議論では、${args.hero||'この英雄'}の一般的な順番について意見が分かれています。減点や禁止ではなく、数値順位は実アカウントデータと節目で決まります。`},
 zh:{ex20:"S6：多条社区讨论倾向于先让多个主力英雄达到EX20，再考虑过早冲单个EX30。这只是解释性背景，不会直接加分。",ex30:"S6：多条社区讨论提醒，当多个主力英雄仍低于EX20时应谨慎过早冲EX30。这只是解释性背景，不会直接扣分。",gear:"多个近期社区来源支持把稀缺装备资源集中在主力队。",drone:"Last War官方支持确认部分高等级无人机组件箱仅在特定活动中出现。可用性本身不决定优先级，仍以账号ROI为准。",airPos:`带日期的飞机队社区讨论会提到${args.hero||'该英雄'}作为相关养成选项。这只是解释性背景；数值排名由账号实测、节点成本和时机决定。`,airNeg:`带日期的飞机队社区讨论对${args.hero||'该英雄'}的一般顺序存在分歧。不存在扣分或禁用；数值排名由账号实测和节点决定。`},
 ar:{ex20:"S6: تميل عدة نقاشات مجتمعية إلى رفع عدة أبطال رئيسيين إلى EX20 قبل التسرع في EX30 لبطل واحد. هذا سياق تفسيري فقط ولا يضيف نقاطاً للترتيب.",ex30:"S6: تحذر عدة نقاشات مجتمعية من التسرع في EX30 بينما لا يزال عدة أبطال رئيسيين دون EX20. هذا سياق تفسيري فقط ولا يخصم نقاطاً.",gear:"تدعم عدة مصادر مجتمعية حديثة تركيز موارد المعدات النادرة على الفريق الرئيسي.",drone:"يؤكد دعم Last War الرسمي أن بعض صناديق مكونات الدرون عالية المستوى مرتبطة بالأحداث. التوفر وحده لا يحدد الأولوية؛ عائد الحساب هو الأساس.",airPos:`تذكر نقاشات مجتمع الطيران المؤرخة ${args.hero||'هذا البطل'} كخيار تطوير ذي صلة. هذا سياق تفسيري فقط؛ الترتيب الرقمي تحدده بيانات الحساب وتكلفة العتبة والتوقيت.`,airNeg:`تختلف نقاشات مجتمع الطيران المؤرخة حول ترتيب ${args.hero||'هذا البطل'} بشكل عام. لا توجد عقوبة أو حظر؛ بيانات الحساب والعتبات تحدد الترتيب الرقمي.`}
};return P[k][key];}
export function metaAdjustment(candidate,state,lang){
  // V2.5.18 source-integrity rule: community/guide evidence may explain context,
  // but it must not directly add opaque score points. Saved/scanned account data,
  // known breakpoints, measured role fit and timing decide the numeric rank.
  let bonus=0; const reasons=[]; const evidence=[];
  const s6=seasonNumber(state)===6&&seasonIsActive(state?.season||{});
  const heroes=mainHeroes(state);
  const below20=heroes.filter(h=>{const n=exLevel(h,state); return n!==null&&n<20}).length;
  if(candidate?.kind==='exclusive'&&s6){
    const target=Number(candidate?.breakpoint);
    if(target===20 && below20>=2){reasons.push(L(lang,'ex20'));evidence.push('reddit-ew-s6-a','reddit-ew-air-advice');}
    if(target===30 && below20>=2){reasons.push(L(lang,'ex30'));evidence.push('reddit-ew-s6-a','reddit-ew-air-advice');}
  }
  if(candidate?.kind==='exclusive'&&airMain(state)){
    const hero=canonicalHeroName(candidate?.hero||candidate?.target);
    const signal=AIR_EX_META_SIGNAL[hero];
    if(signal){
      const key=signal==='mixed'?'airNeg':'airPos';
      reasons.push(L(lang,key,{hero,bonus:0}));
      evidence.push(...(AIR_EX_META_EVIDENCE[hero]||[]));
    }
  }
  if(candidate?.kind==='gear'){
    reasons.push(L(lang,'gear'));
    evidence.push('reddit-air-gear','reddit-gear-general','reddit-gear-advice');
  }
  if(candidate?.kind==='drone'){
    reasons.push(L(lang,'drone')); evidence.push('official-drone-chests');
  }
  return {bonus,reasons,evidence:[...new Set(evidence)]};
}
export function metaContext(state,options={}){
  const s6=seasonNumber(state)===6&&seasonIsActive(state?.season||{});
  const heroes=mainHeroes(state); const below20=heroes.filter(h=>{const n=exLevel(h,state);return n!==null&&n<20}).length;
  const allowedTopics=['exclusive','gear','drone'];
  const topicFilterProvided=Array.isArray(options?.topics);
  const requestedTopics=[...new Set((options?.topics||[]).map(x=>String(x||'').trim().toLowerCase()).filter(x=>allowedTopics.includes(x)))];
  const allVerified=META_EVIDENCE.filter(e=>e.verified===true&&e.url&&allowedTopics.includes(e.topic));
  // V2.5.18: when a diagnostic supplies a topic scope, only evidence relevant to that
  // current decision is returned. This prevents Drone/Gear sources from inflating an EX panel.
  const selected=topicFilterProvided?allVerified.filter(e=>requestedTopics.includes(e.topic)):allVerified;
  const officialCount=selected.filter(e=>e.kind==='official').length;
  const communityCount=selected.filter(e=>e.kind==='community').length;
  // Confidence describes traceability within the filtered evidence set, not universal truth.
  const confidence=selected.length?Math.min(82,Math.round(48+officialCount*8+Math.min(communityCount,6)*4)):0;
  return {knowledge_date:'2026-08-30',season6:s6,air_main:airMain(state),main_heroes_below_ex20:below20,confidence,source_count:selected.length,all_source_count:allVerified.length,topics:requestedTopics,evidence:selected,policy:'verified-links-visible; topic-filtered-to-current-diagnostic; community-evidence-explanatory-only; account-data-drives-score'};
}
export function metaShopAdjustment(category,needs,state){
  const evidence=[];
  // Community evidence is visible context only in V2.5.18; it cannot manufacture a shop score bonus.
  if(category==='exclusive')evidence.push('reddit-ew-s6-a','reddit-ew-air-advice');
  if(category==='blueprint'&&Number(needs?.gearUrgency||0)>=.6)evidence.push('reddit-air-gear','reddit-gear-general','reddit-gear-advice');
  if(category==='drone')evidence.push('official-drone-chests');
  return {bonus:0,evidence:[...new Set(evidence)]};
}
