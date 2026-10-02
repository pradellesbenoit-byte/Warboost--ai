const ROLE_LABELS={
  fr:{
    main_attack:"Attaque principale",objective_defense:"Défense objectif",objective_capture:"Capture objectif",
    objective_retake:"Reprise objectif",rapid_intervention:"Intervention rapide",group_support:"Soutien de groupe",
    flexible:"Renfort polyvalent",contributor:"Contribution",
    reinforce_offense:"Renfort offensif",reinforce_defense:"Renfort défensif",mobile_reserve:"Réserve mobile",
    versatile_reserve:"Renfort polyvalent",
    // Saved-plan aliases.
    main:"Ancrage",anchor:"Ancrage",capture:"Capture objectif",mobile:"Intervention rapide",
    defense:"Défense objectif",reserve_power:"Renfort polyvalent"
  },
  en:{
    main_attack:"Main attack",objective_defense:"Objective defense",objective_capture:"Objective capture",
    objective_retake:"Objective retake",rapid_intervention:"Rapid intervention",group_support:"Group support",
    flexible:"Versatile support",contributor:"Contributor",
    reinforce_offense:"Offense reinforcement",reinforce_defense:"Defense reinforcement",mobile_reserve:"Mobile reserve",
    versatile_reserve:"Versatile reserve",
    // Saved-plan aliases.
    main:"Anchor",anchor:"Anchor",capture:"Objective capture",mobile:"Rapid intervention",
    defense:"Objective defense",reserve_power:"Versatile reserve"
  }
};

const TEXT={
  fr:{
    priority:"Priorité",replacement:"Relève",trigger:"Entrée",
    triggers:{
      starter_absent:"si titulaire absent",defense_pressure:"si défense sous pression",
      offensive_push:"si poussée offensive",objective_lost:"si objectif perdu",
      rapid_response:"si réponse rapide nécessaire",coordination_needed:"si coordination nécessaire"
    },
    planB:{
      defend_fewer_objectives:"si la défense cède, tenir moins d’objectifs",
      retake_when_open:"si une occasion s’ouvre, reprendre l’objectif",
      hold_and_reassess:"si la situation change, tenir et réévaluer",
      confirm_objectives:"si les objectifs sont incertains, les confirmer"
    },
    limited:"Données limitées",recent:"Force récente disponible",balanced:"Répartition des forces",
    ready:"Prêt en renfort",suggested:"Affectation proposée",
    starters:"Titulaires",reserves:"Remplaçants",none:"Aucun membre affecté",
    confirmations:"confirmations à vérifier",status:{substitute:"Remplaçant",registered:"Inscrit",present:"Présent confirmé"},
    suggestedReplacement:"Relève proposée",canReplace:"Peut remplacer",roster:"Effectif proposé"
  },
  en:{
    priority:"Priority",replacement:"Cover",trigger:"Entry",
    triggers:{
      starter_absent:"if starter is absent",defense_pressure:"if defense is pressured",
      offensive_push:"if an offensive push is needed",objective_lost:"if an objective is lost",
      rapid_response:"if rapid response is needed",coordination_needed:"if coordination is needed"
    },
    planB:{
      defend_fewer_objectives:"if defense gives way, hold fewer objectives",
      retake_when_open:"if an opening appears, retake the objective",
      hold_and_reassess:"if the situation changes, hold and reassess",
      confirm_objectives:"if objectives are unclear, confirm them"
    },
    limited:"Limited data",recent:"Recent squad strength",balanced:"Balanced coverage",
    ready:"Ready as backup",suggested:"Suggested assignment",
    starters:"Starters",reserves:"Substitutes",none:"No members assigned",
    confirmations:"confirmations to check",status:{substitute:"Substitute",registered:"Registered",present:"Confirmed present"},
    suggestedReplacement:"Suggested cover",canReplace:"Can replace",roster:"Proposed roster"
  }
};

const htmlEscape=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const roleLabel=(role,locale)=>ROLE_LABELS[locale][role]||ROLE_LABELS[locale].versatile_reserve||"";

export function eventStrategyOrders(plan,locale="en"){
  if(!plan)return "";
  const fr=String(locale).startsWith("fr"),labels=TEXT[fr?"fr":"en"];
  const battlefield=["desert_storm","canyon_storm"].includes(plan.event_type);
  const assignments=Array.isArray(plan.assignments)?plan.assignments:[];
  let lead=fr?"Confirmer les objectifs et horaires de cet événement.":"Confirm this event's objectives and schedule.";
  if(battlefield)lead=fr?"A · Coordonner les objectifs et garder une réserve.":"A · Coordinate objectives and keep a reserve.";
  if(plan.event_type==="season")lead=fr?"Confirmer la saison active et ses objectifs. Hors saison : préparer, sans appliquer les anciennes règles.":"Confirm the active season and objectives. Off-season: prepare without applying old rules.";
  if(plan.event_type==="vs")lead=plan.context?.day!==null&&Number(plan.context?.day)===0?
    (fr?"Jour de préparation VS : réserver les ressources.":"VS preparation day: reserve resources."):
    plan.context?.refresh_required?(fr?"Confirmer le VS du jour ; conserver les ressources.":"Confirm today's VS; preserve resources."):
    plan.context?.ended?(fr?"Fenêtre VS terminée : conserver les ressources.":"VS window ended: preserve resources."):
    (fr?"Suivre les tâches visibles qui marquent aujourd’hui, sans imposer de dépenses.":"Follow visible tasks scoring today, without forcing spending.");
  const lines=[lead,...assignments.map(a=>`${a.name}: ${roleLabel(a.role,fr?"fr":"en")||a.role}`)];
  if(battlefield)lines.push(`B · ${labels.planB[plan.plan_b?.mobile_action]||labels.planB.hold_and_reassess}`);
  return lines.join("\n");
}

export function renderEventStrategy(plan,{locale="en",escapeHtml=htmlEscape,renderMemberControl}={}){
  if(!plan)return "";
  const fr=String(locale).startsWith("fr"),lang=fr?"fr":"en",t=TEXT[lang],e=escapeHtml;
  const isLimited=member=>member.reason==="limited_data"||member.reason==="power_or_freshness_missing"||
    member.evidence?.limited===true||member.evidence?.power_m==null;
  const statusFor=(member,isReserve)=>{
    if(isReserve||member.attendance_status==="substitute")return t.status.substitute;
    return plan.context?.attendance_basis==="registration_only"?t.status.registered:t.status.present;
  };
  const starters=Array.isArray(plan.assignments)?plan.assignments:[];
  const reserves=Array.isArray(plan.substitute_assignments)?plan.substitute_assignments:[];
  const suggestions=Array.isArray(plan.replacement_proposals)?plan.replacement_proposals:[];
  const roleName=(role,fallback)=>roleLabel(role,lang)||fallback;
  const replacementInfo=member=>{
    const suggestion=suggestions.find(item=>item.substitute_member_key===member.member_key);
    const target=member.replacement_for||{};
    const replacementRole=member.covers_role||target.role||suggestion?.role;
    const replacementName=suggestion?.departed_name||suggestion?.name||target.name||target.member_key||suggestion?.departed_member_key;
    return {role:replacementRole,name:replacementName,proposed:Boolean(suggestion)};
  };
  const reserveEntry=(member,index)=>{
    const info=replacementInfo(member);
    const role=roleName(info.role,fr?"rôle principal":"main role");
    const name=info.name?` (${e(info.name)})`:"";
    const trigger=t.triggers[member.entry_trigger]||(fr?"à l’appel":"when called");
    const priority=member.priority===""||member.priority==null?(index+1):member.priority;
    const limited=isLimited(member);
    const slot=fr?"place libre":"free slot";
    return `<small class="eventStrategyReserveEntry"><span>${e(t.priority)} ${e(priority)}</span><span>${e(info.proposed?t.suggestedReplacement:t.replacement)} ${e(role)}${name}</span><span>${e(trigger)} · ${e(slot)}${limited?` · ${e(t.limited)}`:""}</span></small>`;
  };
  const memberRow=(member,isReserve,index)=>{
    const limited=isReserve&&isLimited(member);
    const role=limited
      ?(member.role==="mobile_reserve"||member.role==="mobile"
        ?(fr?"Réserve mobile":"Mobile reserve"):(fr?"Renfort polyvalent":"Versatile reserve"))
      :roleName(member.role,fr?"Renfort polyvalent":"Versatile reserve");
    const control=typeof renderMemberControl==="function"
      ?renderMemberControl(member,{isReserve,locale:lang}):"";
    const statusHtml=control||`<span class="eventStrategyStatus${isReserve||member.attendance_status==="substitute"?" reserve":""}">${e(statusFor(member,isReserve))}</span>`;
    return `<li class="eventStrategyMember"><div class="eventStrategyMemberTop"><button type="button" class="eventStrategyMemberName" data-alliance-player-key="${e(member.member_key)}">${e(member.name||"")}</button></div><div class="eventStrategyMemberMeta"><span>${e(role)}</span>${statusHtml}</div>${isReserve?reserveEntry(member,index):""}</li>`;
  };
  const renderGroup=(title,items,isReserve)=>`<section class="eventStrategyGroup"><div class="eventStrategyHeading"><h4>${e(title)}</h4><span>${items.length}</span></div>${items.length?`<ol class="eventStrategyRoster">${items.map((member,index)=>memberRow(member,isReserve,index)).join("")}</ol>`:`<p class="eventStrategyEmpty">${e(t.none)}</p>`}</section>`;
  const battlefield=["desert_storm","canyon_storm"].includes(plan.event_type);
  const substitutesCapacity=Number(plan.capacity?.substitutes)>0;
  const planB= battlefield&&substitutesCapacity&&plan.plan_b?.mobile_action&&t.planB[plan.plan_b.mobile_action]
    ?`<p class="eventStrategyPlanB"><strong>Plan B</strong> · ${e(t.planB[plan.plan_b.mobile_action])}.</p>`:"";
  return `<section class="eventStrategy" aria-label="${e(t.roster)}">${renderGroup(t.starters,starters,false)}${plan.capacity?.substitutes||reserves.length?renderGroup(t.reserves,reserves,true):""}${planB}</section>`;
}