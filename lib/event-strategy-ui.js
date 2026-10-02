const LABELS={
  fr:{title:"Stratégie proposée",data:"Couverture des données",rules:"Règles et sources",unknown:"Adversaire non renseigné : plans conditionnels, aucune puissance inventée.",guard:"Proposition, pas une probabilité de victoire. Vérifier les règles visibles du jeu avant validation.",confirm:"À confirmer",overflow:"Hors capacité (pas remplaçants automatiques)",roles:{anchor:"Ancrage",capture:"Capture",mobile:"Réaction mobile",defense:"Défense",flexible:"Rôle à confirmer",contributor:"Contribution"},reasons:{power_or_freshness_missing:"Puissance d’escouade absente ou ancienne ; aucune faiblesse déduite.",highest_fresh_squad_evidence:"Meilleure puissance d’escouade récente disponible ; chef proposé, pas grade supposé.",balanced_objective_coverage:"Répartir les forces connues entre les objectifs."},a:"A · Coordonner les groupes sur les objectifs visibles ; garder une réserve.",b:"B · Si l’adversaire est plus fort ou un objectif est perdu : concentrer sur moins d’objectifs défendables.",c:"C · Si retard en fin de bataille ou joueurs manquants : réaffecter les présents, comparer le score réel et éviter les attaques isolées.",scoring:"Suivre uniquement les tâches visibles qui marquent aujourd’hui ; coordonner sans imposer de dépenses.",season:"Confirmer la saison active, la résistance et les objectifs visibles avant engagement. Hors saison : préparer, sans appliquer les anciennes règles.",other:"Confirmer les objectifs et horaires de cet événement ; aucun mécanisme spécifique supposé.",copy:"Ordres à copier",source:{official:"Officiel (extrait de recherche uniquement)",community:"Communautaire",in_game_observed:"Observation en jeu conservée"}},
  en:{title:"Proposed strategy",data:"Data coverage",rules:"Rules and sources",unknown:"Opponent unknown: conditional plans; no invented power.",guard:"Proposal, not a win probability. Check visible in-game rules before validation.",confirm:"To confirm",overflow:"Over capacity (not automatic substitutes)",roles:{anchor:"Anchor",capture:"Capture",mobile:"Mobile response",defense:"Defense",flexible:"Role to confirm",contributor:"Contributor"},reasons:{power_or_freshness_missing:"Squad power missing or stale; no weakness inferred.",highest_fresh_squad_evidence:"Highest available fresh squad power; proposed lead, no assumed rank.",balanced_objective_coverage:"Distribute known strength across objectives."},a:"A · Coordinate groups on visible objectives; keep a reserve.",b:"B · If the opponent is stronger or an objective is lost: concentrate on fewer defendable objectives.",c:"C · If behind late or players are missing: reassign confirmed players, compare the actual score and avoid solo attacks.",scoring:"Use only visible tasks that score today; coordinate without forcing spending.",season:"Confirm the active season, resistance and visible objectives before committing. Off-season: prepare without applying old rules.",other:"Confirm this event's objectives and schedule; assume no specific mechanics.",copy:"Copyable orders",source:{official:"Official (search excerpt only)",community:"Community",in_game_observed:"Preserved in-game observation"}}
};
export function eventStrategyOrders(plan,locale="en"){
  const p=String(locale).startsWith("fr")?LABELS.fr:LABELS.en;
  const battlefield=["desert_storm","canyon_storm"].includes(plan.event_type);
  const guardedVs=plan.context?.day!==null&&Number(plan.context?.day)===0?(String(locale).startsWith("fr")?"Jour de préparation VS : réserver les ressources pour les tâches confirmées de la prochaine fenêtre.":"VS preparation day: reserve resources for confirmed tasks in the next window."):
    plan.context?.refresh_required?(String(locale).startsWith("fr")?"Confirmer le VS du jour avant décision ; conserver les ressources.":"Confirm today's VS before deciding; preserve resources."):
    plan.context?.ended?(String(locale).startsWith("fr")?"Fenêtre VS terminée : conserver les ressources.":"VS window ended: preserve resources."):p.scoring;
  return [battlefield?p.a:plan.event_type==="vs"?guardedVs:plan.event_type==="season"?p.season:p.other,
    ...plan.assignments.map(a=>`${a.name}: ${p.roles[a.role]||a.role}`),
    battlefield?p.b:"",battlefield?p.c:""].filter(Boolean).join("\n");
}
const htmlEscape=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
export function renderEventStrategy(plan,{locale="en",escapeHtml=htmlEscape,renderMemberControl}={}){
  if(!plan)return "";
  const fr=String(locale).startsWith("fr"),e=escapeHtml;
  const roles=fr?{
    main:"Ancrage",anchor:"Ancrage",capture:"Capture",mobile:"Réaction mobile",defense:"Défense",
    flexible:"Renfort polyvalent",contributor:"Contribution",
    reserve_power:"Réserve puissance",reinforce_offense:"Renfort attaque",reinforce_defense:"Renfort défense",
    mobile_reserve:"Réserve mobile",objective_defense:"Défense objectif",objective_capture:"Capture objectif",
    group_support:"Soutien de groupe",versatile_reserve:"Renfort polyvalent"
  }:{
    main:"Anchor",anchor:"Anchor",capture:"Capture",mobile:"Mobile response",defense:"Defense",
    flexible:"Flexible support",contributor:"Contributor",
    reserve_power:"Power reserve",reinforce_offense:"Offense support",reinforce_defense:"Defense support",
    mobile_reserve:"Mobile reserve",objective_defense:"Objective defense",objective_capture:"Objective capture",
    group_support:"Group support",versatile_reserve:"Flexible support"
  };
  const reasonFor=(member,isReserve)=>{
    const limited=member.reason==="limited_data"||member.reason==="power_or_freshness_missing"||
      member.evidence?.limited===true||member.evidence?.power_m==null;
    if(limited)return fr?"Données limitées":"Limited data";
    if(member.reason==="highest_fresh_squad_evidence")return fr?"Force récente disponible":"Recent squad strength";
    if(member.reason==="balanced_objective_coverage")return fr?"Répartition des forces":"Balanced coverage";
    return isReserve?(fr?"Prêt en renfort":"Ready as backup"):(fr?"Affectation proposée":"Suggested assignment");
  };
  const priorityFor=(value)=>{
    if(value===null||value===undefined||value==="")return "";
    const valueLabel=typeof value==="number"?String(value):String(value);
    return `<span class="eventStrategyPriority">${fr?"Priorité":"Priority"} ${e(valueLabel)}</span>`;
  };
  const statusFor=(member,isReserve)=>{
    if(isReserve||member.attendance_status==="substitute")return fr?"Remplaçant":"Substitute";
    if(plan.context?.attendance_basis==="registration_only")return fr?"Inscrit":"Registered";
    return fr?"Présent confirmé":"Confirmed present";
  };
  const starters=Array.isArray(plan.assignments)?plan.assignments:[];
  const reserves=Array.isArray(plan.substitute_assignments)?plan.substitute_assignments:[];
  const suggestions=Array.isArray(plan.replacement_proposals)?plan.replacement_proposals:[];
  const replacementLine=(member)=>{
    const suggested=suggestions.find(item=>item.substitute_member_key===member.member_key);
    const proposal=suggested||
      (member.replacement_for?{
        departed_name:member.replacement_for.name,
        departed_member_key:member.replacement_for.member_key,
        role:member.replacement_for.role
      }:null);
    if(!proposal)return "";
    const target=proposal.departed_name||proposal.departed_member_key;
    if(!target)return "";
    return `<small class="eventStrategyReplacement">${suggested?(fr?"Relève proposée pour":"Suggested replacement for"):(fr?"Peut remplacer":"Can replace")} ${e(target)}</small>`;
  };
  const memberRow=(member,isReserve,index)=>{
    const limited=isReserve&&(member.reason==="limited_data"||member.reason==="power_or_freshness_missing"||
      member.evidence?.limited===true||member.evidence?.power_m==null);
    const role=limited
      ?(member.role==="mobile_reserve"?(fr?"Réserve mobile":"Mobile reserve"):(fr?"Renfort polyvalent":"Flexible support"))
      :(roles[member.role]||(fr?"Renfort polyvalent":"Flexible support"));
    const reason=reasonFor(member,isReserve);
    const control=typeof renderMemberControl==="function"?renderMemberControl(member,{isReserve,locale:fr?"fr":"en"}):"";
    const statusHtml=control||`<span class="eventStrategyStatus${isReserve||member.attendance_status==="substitute"?" reserve":""}">${e(statusFor(member,isReserve))}</span>`;
    return `<li class="eventStrategyMember"><div class="eventStrategyMemberTop"><button type="button" class="eventStrategyMemberName" data-alliance-player-key="${e(member.member_key)}">${e(member.name||"")}</button>${isReserve?priorityFor(member.priority??(index+1)):""}</div><div class="eventStrategyMemberMeta"><span>${e(role)}</span>${statusHtml}</div><small class="eventStrategyReason">${e(reason)}</small>${isReserve?replacementLine(member):""}</li>`;
  };
  const unknownCount=Array.isArray(plan.confirmation)?plan.confirmation.length:0;
  const renderGroup=(title,items,isReserve)=>`<section class="eventStrategyGroup"><div class="eventStrategyHeading"><h4>${e(title)}</h4><span>${items.length}</span></div>${items.length?`<ol class="eventStrategyRoster">${items.map((member,index)=>memberRow(member,isReserve,index)).join("")}</ol>`:`<p class="eventStrategyEmpty">${fr?"Aucun membre affecté":"No members assigned"}</p>`}</section>`;
  return `<section class="eventStrategy" aria-label="${fr?"Effectif proposé":"Proposed roster"}">${unknownCount?`<p class="eventStrategyConfirmCount">${unknownCount} ${fr?"confirmations à vérifier":"confirmations to check"}</p>`:""}${renderGroup(fr?"Titulaires":"Starters",starters,false)}${plan.capacity?.substitutes||reserves.length?renderGroup(fr?"Remplaçants":"Substitutes",reserves,true):""}</section>`;
}