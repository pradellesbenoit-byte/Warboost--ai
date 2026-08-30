import {seasonIsActive} from './season-lifecycle.js';
import {canonicalHeroKey} from './heroes.js';
import {selectPrimarySquad} from './squad-identity.js';
// WarBoost V1.6.3 — curated multi-source meta intelligence.
// This module never pretends to live-browse at request time. It applies dated evidence
// bundled from official/community research and can later be replaced/augmented by an approved feed.
export const META_EVIDENCE = [
  {id:'official-drone',kind:'official',date:'2026-08-24',topic:'drone',weight:1.00,title:'Official Drone development guidance',url:'https://firstfungroup.zendesk.com/',claims:['Drone progression provides hero/stat value; Drone Parts remain a durable bottleneck at high levels.']},
  {id:'reddit-ew-s6-a',kind:'community',date:'2026-08-10',topic:'exclusive',weight:.82,title:'S6 exclusive weapon priority discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vkrf7t/exclusive_weapon_priority/',claims:['In S6, multiple EX20 heroes can outperform rushing a single EX30 when Awakening benefits are available.']},
  {id:'reddit-air-gear-a',kind:'community',date:'2026-08-10',topic:'gear',weight:.80,title:'Air squad gear priority discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vkqile/air_squad_gear_priority/',claims:['Recent Air discussions repeatedly favor defensive Radar/Armor investment on frontline/defenders and main-squad concentration.']},
  {id:'reddit-gear-general-a',kind:'community',date:'2026-08-08',topic:'gear',weight:.82,title:'Recent general gear priority discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vinpa5/gear_priority/',claims:['Recent consensus signal: Radar then Armor is frequently prioritized for PvP durability; avoid scattering blueprints.']},
  {id:'reddit-gear-general-b',kind:'community',date:'2026-04-27',topic:'gear',weight:.72,title:'Gear advice discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1swsp7o/gear_advice/',claims:['Multiple replies prioritize Radar/Armor and discourage spreading scarce prints across too many pieces.']},
  {id:'community-guide-gear',kind:'guide',date:'2026-07-01',topic:'gear',weight:.66,title:'2026 gear progression guide',url:'https://lastwarsurvival.com/guides/gear-equipment-progression-guide',claims:['Community guide reinforces concentrating legendary gear and scarce blueprints on core heroes rather than broad spreading.']}
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
function L(lang,key){const x=String(lang||"en").toLowerCase();const k=x.startsWith("fr")?"fr":x.startsWith("es")?"es":x.startsWith("de")?"de":x.startsWith("ja")?"ja":x.startsWith("zh")?"zh":x.startsWith("ar")?"ar":"en";const P={
 en:{ex20:"S6: recent community consensus gives extra weight to reaching EX20 on several main heroes before a premature EX30 rush.",ex30:"S6: several main heroes are still below EX20, so an EX30 rush is temporarily de-prioritized.",gear:"Recent multi-source community evidence supports concentrating scarce gear resources on the main squad.",drone:"Official guidance keeps Drone progression relevant, but it must still beat the account-specific bottleneck on ROI."},
 fr:{ex20:"S6 : le consensus communautaire récent donne plus de poids au passage de plusieurs héros principaux à EX20 avant un rush EX30 prématuré.",ex30:"S6 : plusieurs héros principaux sont encore sous EX20 ; un rush EX30 est donc temporairement dépriorisé.",gear:"Plusieurs sources communautaires récentes soutiennent la concentration des ressources d’équipement rares sur l’escouade principale.",drone:"Les informations officielles maintiennent le Drone comme axe important, mais son ROI doit rester supérieur au goulot propre au compte."},
 es:{ex20:"S6: el consenso comunitario reciente da más peso a llevar varios héroes principales a EX20 antes de acelerar prematuramente un EX30.",ex30:"S6: varios héroes principales siguen por debajo de EX20, por lo que un EX30 se desprioriza temporalmente.",gear:"Varias fuentes comunitarias recientes apoyan concentrar los recursos de equipo escasos en el escuadrón principal.",drone:"La guía oficial mantiene el Dron como eje relevante, pero su ROI debe superar el cuello de botella específico de la cuenta."},
 de:{ex20:"S6: Der aktuelle Community-Konsens gewichtet EX20 auf mehreren Haupthelden höher als einen verfrühten EX30-Rush.",ex30:"S6: Mehrere Haupthelden liegen noch unter EX20; EX30 wird daher vorübergehend niedriger priorisiert.",gear:"Mehrere aktuelle Community-Quellen unterstützen die Konzentration seltener Ausrüstungsressourcen auf den Haupttrupp.",drone:"Offizielle Hinweise bestätigen die Relevanz der Drohne, aber ihr ROI muss den kontospezifischen Engpass übertreffen."},
 ja:{ex20:"S6：最近のコミュニティ傾向では、1人を早急にEX30へ進めるより、主力複数英雄をEX20へ到達させる価値を高く評価します。",ex30:"S6：主力複数英雄がまだEX20未満のため、EX30への急進は一時的に優先度を下げます。",gear:"複数の最近のコミュニティ情報は、希少な装備資源を主力部隊へ集中する方針を支持しています。",drone:"公式情報ではドローン育成は重要ですが、アカウント固有のボトルネックよりROIが高い場合に優先します。"},
 zh:{ex20:"S6：近期社区共识更重视先让多个主力英雄达到EX20，而不是过早把单个英雄冲到EX30。",ex30:"S6：多个主力英雄仍低于EX20，因此暂时降低EX30冲刺优先级。",gear:"多个近期社区来源支持把稀缺装备资源集中在主力队。",drone:"官方资料确认无人机养成仍然重要，但其ROI必须高于当前账号的主要瓶颈。"},
 ar:{ex20:"S6: يعطي إجماع المجتمع الحديث وزناً أكبر للوصول بعدة أبطال رئيسيين إلى EX20 قبل التسرع في EX30 لبطل واحد.",ex30:"S6: ما زال عدة أبطال رئيسيين دون EX20، لذلك يتم خفض أولوية التسرع إلى EX30 مؤقتاً.",gear:"تدعم عدة مصادر مجتمعية حديثة تركيز موارد المعدات النادرة على الفريق الرئيسي.",drone:"تؤكد الإرشادات الرسمية أهمية تطوير الدرون، لكن يجب أن يتفوق عائده على عنق الزجاجة الخاص بالحساب."}
};return P[k][key];}
export function metaAdjustment(candidate,state,lang){
  let bonus=0; const reasons=[]; const evidence=[];
  const s6=seasonNumber(state)===6&&seasonIsActive(state?.season||{});
  const heroes=mainHeroes(state);
  const below20=heroes.filter(h=>{const n=exLevel(h,state); return n!==null&&n<20}).length;
  if(candidate?.kind==='exclusive'&&s6){
    const target=Number(candidate?.breakpoint);
    if(target===20 && below20>=2){bonus+=8;reasons.push(L(lang,'ex20'));evidence.push('reddit-ew-s6-a');}
    if(target===30 && below20>=2){bonus-=7;reasons.push(L(lang,'ex30'));evidence.push('reddit-ew-s6-a');}
  }
  if(candidate?.kind==='gear'){
    bonus+=3; reasons.push(L(lang,'gear'));
    evidence.push('reddit-air-gear-a','reddit-gear-general-a','reddit-gear-general-b','community-guide-gear');
  }
  if(candidate?.kind==='drone'){
    bonus+=2; reasons.push(L(lang,'drone')); evidence.push('official-drone');
  }
  return {bonus,reasons,evidence:[...new Set(evidence)]};
}
export function metaContext(state){
  const s6=seasonNumber(state)===6&&seasonIsActive(state?.season||{});
  const heroes=mainHeroes(state); const below20=heroes.filter(h=>{const n=exLevel(h,state);return n!==null&&n<20}).length;
  const selected=META_EVIDENCE.filter(e=>e.kind==='official'||['exclusive','gear','drone'].includes(e.topic));
  const sourceKinds=new Set(selected.map(e=>e.kind));
  const confidence=Math.min(94,Math.round(55+selected.reduce((a,e)=>a+e.weight*5,0)+(sourceKinds.size>=3?6:0)));
  return {knowledge_date:'2026-08-24',season6:s6,main_heroes_below_ex20:below20,confidence,source_count:selected.length,evidence:selected};
}
export function metaShopAdjustment(category,needs,state){
  let bonus=0; const evidence=[];
  const ctx=metaContext(state);
  if(category==='exclusive'&&ctx.season6&&ctx.main_heroes_below_ex20>=2){bonus+=7;evidence.push('reddit-ew-s6-a');}
  if(category==='blueprint'&&Number(needs?.gearUrgency||0)>=.6){bonus+=5;evidence.push('reddit-air-gear-a','reddit-gear-general-a','community-guide-gear');}
  if(category==='drone'){bonus+=2;evidence.push('official-drone');}
  return {bonus,evidence:[...new Set(evidence)]};
}
