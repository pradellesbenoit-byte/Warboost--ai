// WarBoost — reliability guard for player PRO diagnostics. Pure, no side effects.
// This does not claim exact gains, costs or live official gameplay verification.
const APPROVED_TYPES = new Set(['aircraft','tank','missile']);
const MAIN_FIELDS = Object.freeze({
  hero_tech_pct:'heroes',
  siege_to_seize_pct:'siege_to_seize',
  defensive_fortification_pct:'defensive_fortification',
  tactical_weapon_pct:'tactical_weapon'
});
const EXCLUDED_REVIEW_STATES = new Set(['pending','draft','unreviewed','needs_review','rejected','conflict']);
const validDate = x => typeof x==='string' && x.trim()!=='' && Number.isFinite(Date.parse(x));
const validPct = x => x!==null && x!==undefined && x!=='' && Number.isFinite(Number(x)) && Number(x)>=0 && Number(x)<=100;

// A confirmed scan's canonical named branch is preserved by the existing review
// workflow as technology.branches[canonicalKey], with observed name/state/time.
// Flattened legacy percent summaries alone must never become a buyable upgrade.
export function verifiedNamedTechnologyValues(technology={}, mainType=null) {
  if(!technology||technology.needs_confirmation===true||EXCLUDED_REVIEW_STATES.has(String(technology.review_state||'').toLowerCase()))return [];
  const branches=technology.branches;
  if(!branches||typeof branches!=='object'||Array.isArray(branches))return [];
  const byField={...MAIN_FIELDS};
  if(APPROVED_TYPES.has(mainType))byField.type_mastery_pct=mainType+'_specialization';
  return Object.entries(byField).flatMap(([field,key])=>{
    const row=branches[key];
    if(!row||typeof row!=='object'||row.state!=='percent'||!validPct(row.percent)||Number(row.percent)>=100||
       !validDate(row.updated_at)||!String(row.name||'').trim()||row.needs_confirmation===true||
       row.confirmed===false||EXCLUDED_REVIEW_STATES.has(String(row.review_state||'').toLowerCase()))return [];
    return [{key:field,value:Number(row.percent),branch_key:key,
      source_updated_at:row.updated_at,source_kind:'persisted_named_technology_observation'}];
  });
}

// A computed ROI/impact score, completeness percentage and number of community
// links never establish a certain real-world/gameplay improvement.
export function safeRecommendationCertainty(candidate={},context={}) {
  if(candidate.kind==='scan')return 'certain'; // Certainty of the NEED TO VERIFY only.
  if(candidate.data_freshness?.blocks_paid===true||['stale','unknown'].includes(candidate.data_freshness?.status))return 'speculative';
  const current=candidate.current;
  const hasDirect= current!==null&&current!==undefined&&current!==''&&Number.isFinite(Number(current));
  if(candidate.kind==='technology'&&candidate.technology_evidence!=='named_reviewed_branch')return 'speculative';
  if(hasDirect&&Number(context.confidence)>=52)return 'probable';
  return 'speculative';
}

export function recommendationEvidence(candidate={},context={}) {
  const certainty=safeRecommendationCertainty(candidate,context);
  return {
    certainty,
    data_confidence: candidate.kind==='technology'
      ?(candidate.technology_evidence==='named_reviewed_branch'?'persisted_named_observation':'unconfirmed')
      :(candidate.kind==='scan'?'verification_required':candidate.current==null?'unknown':'observed_value_needs_cost_check'),
    ranking_method:'heuristic_comparison_not_confirmed_roi',
    exact_gain_confirmed:false,
    exact_cost_confirmed:false,
    spend_policy:'verify_current_cost_resources_and_availability_before_spend'
  };
}

export function observedCombatRole(hero={}) {
  const raw=String(hero.combat_role||'').trim().toLowerCase();
  if(['frontline','front','tank','defender'].includes(raw))return 'frontline';
  if(['dps','damage','attacker','offense'].includes(raw))return 'dps';
  if(['support','healer','buffer'].includes(raw))return 'support';
  return null;
}
const COPY={
  fr:{frontline:['Vérifie d’abord les pièces de protection adaptées à la première ligne ; le coût et le gain réels ne sont pas connus.','Comparer armure et radar disponibles, puis vérifier le coût avant de dépenser.'],dps:['Pour un héros offensif, examine l’arme et les pièces offensives avant d’équilibrer tous les équipements.','Comparer les pièces offensives et leur coût dans le jeu avant de dépenser.'],support:['Pour un soutien, privilégie les équipements qui servent ses compétences et sa survie ; aucun bonus n’est supposé.','Vérifier le rôle, les compétences et les pièces disponibles avant de dépenser.'],unknown:['Le rôle de ce héros n’est pas confirmé : un simple écart de niveau ne prouve pas la bonne dépense.','Vérifier son rôle et ses pièces d’équipement avant toute dépense.']},
  en:{frontline:['Check frontline protection pieces first; actual cost and gain are not known.','Compare available armor and radar, then verify cost before spending.'],dps:['For a damage dealer, compare weapon and offensive pieces before leveling every gear item equally.','Compare offensive items and actual cost in game before spending.'],support:['For support, prioritize items that fit their skills and survival, without assuming a bonus.','Verify the role, skills and available pieces before spending.'],unknown:['This hero’s role is unconfirmed: a gear-level gap alone does not prove an upgrade is best.','Verify the role and equipment pieces before spending.']},
  es:{frontline:['Comprueba primero la protección de la primera línea; coste y mejora sin confirmar.','Compara armadura y radar antes de gastar.'],dps:['Para daño, compara primero arma y piezas ofensivas.','Comprueba piezas ofensivas y su coste antes de gastar.'],support:['Para apoyo, comprueba equipo acorde a habilidades y supervivencia.','Verifica rol, habilidades y coste.'],unknown:['El rol no está confirmado; la diferencia de nivel no demuestra una buena compra.','Comprueba rol y piezas antes de gastar.']},
  de:{frontline:['Prüfe zuerst den Schutz der Frontlinie; Kosten und Nutzen sind unbekannt.','Vergleiche Panzerung und Radar vor Ausgaben.'],dps:['Prüfe für Schadenshelden zuerst Waffe und Angriffsausrüstung.','Vergleiche offensive Ausrüstung und Kosten.'],support:['Prüfe Ausrüstung passend zu Fähigkeiten und Überleben.','Prüfe Rolle, Fertigkeiten und Kosten.'],unknown:['Die Rolle ist unbestätigt; ein Stufenabstand rechtfertigt keinen Kauf.','Prüfe Rolle und Ausrüstung vor Ausgaben.']},
  ja:{frontline:['前衛の防御装備を先に確認。正確な費用や効果は未確認です。','装甲やレーダーと費用を確認してから投資。'],dps:['攻撃役は武器などの攻撃装備を先に比較。','装備と費用を確認してから投資。'],support:['支援役はスキルと生存に合う装備を確認。','役割と費用を確認してから投資。'],unknown:['役割未確認のため装備レベル差だけで投資は判断できません。','役割と装備を確認してください。']},
  zh:{frontline:['优先核对前排防御装备；实际成本和收益未知。','比较护甲和雷达及其成本后再投入。'],dps:['输出英雄先比较武器及攻击装备。','先核实攻击装备与成本。'],support:['辅助英雄应核实技能及生存相关装备。','核实角色、技能与成本。'],unknown:['角色定位未确认，装备等级差不能证明投资划算。','先核实定位与装备。']},
  ar:{frontline:['راجع تجهيزات حماية الخط الأمامي أولاً؛ التكلفة والفائدة غير مؤكدتين.','قارن الدرع والرادار والتكلفة قبل الإنفاق.'],dps:['لضرر الهجوم قارن السلاح والتجهيزات الهجومية أولاً.','تحقق من المعدات الهجومية وتكلفتها.'],support:['للدعم تحقق من ملاءمة المعدات للمهارات والبقاء.','تحقق من الدور والمهارات والتكلفة.'],unknown:['الدور غير مؤكد ولا يكفي فرق مستوى المعدات لتبرير الإنفاق.','تحقق من الدور والمعدات قبل الإنفاق.']}
};
export function roleAwareGearAdvice(hero={},language='fr') {
  const code=String(language||'en').toLowerCase().split(/[-_]/)[0];
  const role=observedCombatRole(hero);
  const [reason,action]=(COPY[code]||COPY.en)[role||'unknown'];
  return {role,reason,action,focus:role==='frontline'?'survival':role==='dps'?'offense':role==='support'?'skill_fit':'verify_role',cost_confirmed:false,gain_confirmed:false};
}
