import {seasonIsActive} from './season-lifecycle.js';
import {canonicalHeroKey,canonicalHeroName,heroType} from './heroes.js';
import {selectPrimarySquad} from './squad-identity.js';
// WarBoost V2.5.15 — curated, dated multi-source meta intelligence.
// This module NEVER claims to browse Last War live at request time. Community signals are
// secondary adjustments only; saved/scanned account data and verified game state stay primary.
export const META_EVIDENCE = [
  {id:'official-drone',kind:'official',date:'2026-08-24',topic:'drone',weight:1.00,title:'Official Drone development guidance',url:'https://firstfungroup.zendesk.com/',claims:['Drone progression provides hero/stat value; Drone Parts remain a durable bottleneck at high levels.']},
  {id:'reddit-ew-s6-a',kind:'community',date:'2026-08-10',topic:'exclusive',weight:.82,title:'S6 exclusive weapon priority discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vkrf7t/exclusive_weapon_priority/',claims:['In S6, multiple EX20 heroes can outperform rushing a single EX30 when Awakening benefits are available.']},
  {id:'reddit-air-ew-2026-08-23',kind:'community',date:'2026-08-23',topic:'exclusive',weight:.86,title:'Recent Air exclusive-weapon progression discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vwjxyi/what_i_should_go_for_first/',claims:['Recent Air-main replies commonly favor DVA/Lucius/Skyler/Morrison progression before Carlie in generic exclusive-weapon ordering, while still recommending account-specific breakpoint decisions.']},
  {id:'reddit-air-post-s6-2026-08-20',kind:'community',date:'2026-08-20',topic:'exclusive',weight:.84,title:'Post-S6 Air-main progression discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1vtyfkf/post_s6_air_main_advice/',claims:['Post-S6 Air-main discussion frequently favors Skyler/Morrison before Carlie once DVA/Lucius are established, and supports avoiding blind equalization.']},
  {id:'reddit-ew-air-2026-06-04',kind:'community',date:'2026-06-04',topic:'exclusive',weight:.72,title:'Air exclusive-weapon breakpoint discussion',url:'https://www.reddit.com/r/LastWarMobileGame/comments/1twakhl/exclusive_weapon_advice/',claims:['Community discussion supports bringing several main Air heroes through meaningful EW breakpoints before committing to a single expensive rush.']},
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
function airMain(state){
  const heroes=mainHeroes(state);
  return heroes.filter(h=>heroType(h?.name)==='aircraft').length>=4;
}
const AIR_EX_META_BONUS=Object.freeze({DVA:4,Lucius:4,Skyler:3,Morrison:3,Carlie:-5});
function L(lang,key,args={}){const x=String(lang||"en").toLowerCase();const k=x.startsWith("fr")?"fr":x.startsWith("es")?"es":x.startsWith("de")?"de":x.startsWith("ja")?"ja":x.startsWith("zh")?"zh":x.startsWith("ar")?"ar":"en";const P={
 en:{ex20:"S6: recent community consensus gives extra weight to reaching EX20 on several main heroes before a premature EX30 rush.",ex30:"S6: several main heroes are still below EX20, so an EX30 rush is temporarily de-prioritized.",gear:"Recent multi-source community evidence supports concentrating scarce gear resources on the main squad.",drone:"Official guidance keeps Drone progression relevant, but it must still beat the account-specific bottleneck on ROI.",airPos:`Dated Aug-2026 Air-main community signal gives ${args.hero||'this hero'} a small +${args.bonus||0} secondary adjustment. Account data, breakpoint cost and timing still decide the rank.`,airNeg:`Dated Aug-2026 Air-main community signal applies a small ${args.bonus||0} secondary adjustment to ${args.hero||'this hero'}; this is not a ban and can be outweighed by a close breakpoint or measured account need.`},
 fr:{ex20:"S6 : le consensus communautaire récent donne plus de poids au passage de plusieurs héros principaux à EX20 avant un rush EX30 prématuré.",ex30:"S6 : plusieurs héros principaux sont encore sous EX20 ; un rush EX30 est donc temporairement dépriorisé.",gear:"Plusieurs sources communautaires récentes soutiennent la concentration des ressources d’équipement rares sur l’escouade principale.",drone:"Les informations officielles maintiennent le Drone comme axe important, mais son ROI doit rester supérieur au goulot propre au compte.",airPos:`Signal communautaire Avion daté d’août 2026 : petit ajustement secondaire de +${args.bonus||0} pour ${args.hero||'ce héros'}. Les données du compte, le coût jusqu’au palier et le timing restent prioritaires.`,airNeg:`Signal communautaire Avion daté d’août 2026 : ajustement secondaire de ${args.bonus||0} pour ${args.hero||'ce héros'}. Ce n’est pas une interdiction : un palier proche ou un besoin mesuré du compte peut l’emporter.`},
 es:{ex20:"S6: el consenso comunitario reciente da más peso a llevar varios héroes principales a EX20 antes de acelerar prematuramente un EX30.",ex30:"S6: varios héroes principales siguen por debajo de EX20, por lo que un EX30 se desprioriza temporalmente.",gear:"Varias fuentes comunitarias recientes apoyan concentrar los recursos de equipo escasos en el escuadrón principal.",drone:"La guía oficial mantiene el Dron como eje relevante, pero su ROI debe superar el cuello de botella específico de la cuenta.",airPos:`Señal comunitaria de Avión fechada en agosto de 2026: ajuste secundario de +${args.bonus||0} para ${args.hero||'este héroe'}. Los datos de la cuenta, el coste al hito y el timing siguen mandando.`,airNeg:`Señal comunitaria de Avión fechada en agosto de 2026: ajuste secundario de ${args.bonus||0} para ${args.hero||'este héroe'}. No es una prohibición; un hito cercano o una necesidad medida puede superarlo.`},
 de:{ex20:"S6: Der aktuelle Community-Konsens gewichtet EX20 auf mehreren Haupthelden höher als einen verfrühten EX30-Rush.",ex30:"S6: Mehrere Haupthelden liegen noch unter EX20; EX30 wird daher vorübergehend niedriger priorisiert.",gear:"Mehrere aktuelle Community-Quellen unterstützen die Konzentration seltener Ausrüstungsressourcen auf den Haupttrupp.",drone:"Offizielle Hinweise bestätigen die Relevanz der Drohne, aber ihr ROI muss den kontospezifischen Engpass übertreffen.",airPos:`Datierter Air-Community-Hinweis (Aug. 2026): kleiner sekundärer Bonus +${args.bonus||0} für ${args.hero||'diesen Helden'}. Kontodaten, Weg zum Meilenstein und Timing bleiben maßgeblich.`,airNeg:`Datierter Air-Community-Hinweis (Aug. 2026): kleiner sekundärer Wert ${args.bonus||0} für ${args.hero||'diesen Helden'}. Das ist kein Verbot; ein naher Meilenstein oder gemessener Kontobedarf kann überwiegen.`},
 ja:{ex20:"S6：最近のコミュニティ傾向では、1人を早急にEX30へ進めるより、主力複数英雄をEX20へ到達させる価値を高く評価します。",ex30:"S6：主力複数英雄がまだEX20未満のため、EX30への急進は一時的に優先度を下げます。",gear:"複数の最近のコミュニティ情報は、希少な装備資源を主力部隊へ集中する方針を支持しています。",drone:"公式情報ではドローン育成は重要ですが、アカウント固有のボトルネックよりROIが高い場合に優先します。",airPos:`2026年8月の航空コミュニティ傾向：${args.hero||'この英雄'}に小さな補正 +${args.bonus||0}。実アカウントデータ、節目までのコスト、タイミングを優先します。`,airNeg:`2026年8月の航空コミュニティ傾向：${args.hero||'この英雄'}に小さな補正 ${args.bonus||0}。禁止ではなく、近い節目や実測ニーズが上回る場合があります。`},
 zh:{ex20:"S6：近期社区共识更重视先让多个主力英雄达到EX20，而不是过早把单个英雄冲到EX30。",ex30:"S6：多个主力英雄仍低于EX20，因此暂时降低EX30冲刺优先级。",gear:"多个近期社区来源支持把稀缺装备资源集中在主力队。",drone:"官方资料确认无人机养成仍然重要，但其ROI必须高于当前账号的主要瓶颈。",airPos:`2026年8月飞机队社区信号：对${args.hero||'该英雄'}给予小幅次要修正 +${args.bonus||0}。账号实测、到节点成本和时机仍优先。`,airNeg:`2026年8月飞机队社区信号：对${args.hero||'该英雄'}给予小幅次要修正 ${args.bonus||0}。这不是禁用；接近节点或账号实测需求可覆盖该修正。`},
 ar:{ex20:"S6: يعطي إجماع المجتمع الحديث وزناً أكبر للوصول بعدة أبطال رئيسيين إلى EX20 قبل التسرع في EX30 لبطل واحد.",ex30:"S6: ما زال عدة أبطال رئيسيين دون EX20، لذلك يتم خفض أولوية التسرع إلى EX30 مؤقتاً.",gear:"تدعم عدة مصادر مجتمعية حديثة تركيز موارد المعدات النادرة على الفريق الرئيسي.",drone:"تؤكد الإرشادات الرسمية أهمية تطوير الدرون، لكن يجب أن يتفوق عائده على عنق الزجاجة الخاص بالحساب.",airPos:`إشارة مجتمع الطيران المؤرخة في أغسطس 2026: تعديل ثانوي صغير +${args.bonus||0} لـ ${args.hero||'هذا البطل'}. تبقى بيانات الحساب وتكلفة العتبة والتوقيت هي الأساس.`,airNeg:`إشارة مجتمع الطيران المؤرخة في أغسطس 2026: تعديل ثانوي صغير ${args.bonus||0} لـ ${args.hero||'هذا البطل'}. ليس حظراً ويمكن أن تتغلب عليه عتبة قريبة أو حاجة مقاسة.`}
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
  if(candidate?.kind==='exclusive'&&airMain(state)){
    const hero=canonicalHeroName(candidate?.hero||candidate?.target);
    const airBonus=Number(AIR_EX_META_BONUS[hero]||0);
    if(airBonus){
      bonus+=airBonus;
      reasons.push(L(lang,airBonus>0?'airPos':'airNeg',{hero,bonus:airBonus}));
      evidence.push('reddit-air-ew-2026-08-23','reddit-air-post-s6-2026-08-20','reddit-ew-air-2026-06-04');
    }
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
  const confidence=Math.min(94,Math.round(55+selected.reduce((a,e)=>a+e.weight*4.2,0)+(sourceKinds.size>=3?6:0)));
  return {knowledge_date:'2026-08-30',season6:s6,air_main:airMain(state),main_heroes_below_ex20:below20,confidence,source_count:selected.length,evidence:selected,policy:'dated-evidence-secondary-to-account-data'};
}
export function metaShopAdjustment(category,needs,state){
  let bonus=0; const evidence=[];
  const ctx=metaContext(state);
  if(category==='exclusive'&&ctx.season6&&ctx.main_heroes_below_ex20>=2){bonus+=7;evidence.push('reddit-ew-s6-a');}
  if(category==='blueprint'&&Number(needs?.gearUrgency||0)>=.6){bonus+=5;evidence.push('reddit-air-gear-a','reddit-gear-general-a','community-guide-gear');}
  if(category==='drone'){bonus+=2;evidence.push('official-drone');}
  return {bonus,evidence:[...new Set(evidence)]};
}
