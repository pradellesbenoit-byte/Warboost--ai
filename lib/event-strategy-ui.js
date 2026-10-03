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
const roleLabel=(role,locale)=>ROLE_LABELS[locale][role]||"";

const SPECIFIC_COVER_ROLES=new Set([
  "main_attack","objective_defense","objective_capture","objective_retake",
  "rapid_intervention","group_support","reinforce_offense","reinforce_defense",
  "main","anchor","capture","mobile","defense"
]);

const EVENT_LABELS={
  fr:{desert_storm:"Tempête du désert",canyon_storm:"Tempête du canyon",vs:"VS",season:"saison"},
  en:{desert_storm:"Desert Storm",canyon_storm:"Canyon Storm",vs:"VS",season:"season"}
};

const isHumanText=value=>{
  if(typeof value!=="string")return false;
  const text=value.trim();
  return Boolean(text)&&! /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/i.test(text);
};

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
  const lines=[lead];
  if(battlefield){
    assignments.forEach(a=>{
      const role=roleLabel(a.role,fr?"fr":"en");
      if(role&&a.name)lines.push(`${a.name}: ${role}`);
    });
  }
  if(battlefield)lines.push(`B · ${labels.planB[plan.plan_b?.mobile_action]||labels.planB.hold_and_reassess}`);
  return lines.join("\n");
}

const rosterDisclosureState=new Map();
function rosterGroupOpen(key){
  if(rosterDisclosureState.has(key))return rosterDisclosureState.get(key);
  try{return globalThis.sessionStorage?.getItem(`warboost:event-roster-ui:${key}`)==="open"}catch{return false}
}
export function toggleEventStrategyGroup(button){
  const key=button?.dataset?.eventRosterToggle;
  const body=button?.closest?.(".eventStrategyGroup")?.querySelector(".eventStrategyGroupBody");
  if(!key||!body)return false;
  const open=button.getAttribute("aria-expanded")!=="true";
  button.setAttribute("aria-expanded",String(open));
  body.hidden=!open;
  rosterDisclosureState.set(key,open);
  try{globalThis.sessionStorage?.setItem(`warboost:event-roster-ui:${key}`,open?"open":"closed")}catch{}
  return true;
}
export function renderEventStrategy(plan,{locale="en",escapeHtml=htmlEscape,renderMemberControl}={}){
  if(!plan)return "";
  const fr=String(locale).startsWith("fr"),lang=fr?"fr":"en",t=TEXT[lang],e=escapeHtml;
  const starters=Array.isArray(plan.assignments)?plan.assignments:[];
  const reserves=Array.isArray(plan.substitute_assignments)?plan.substitute_assignments:[];
  const suggestions=Array.isArray(plan.replacement_proposals)?plan.replacement_proposals:[];
  const replacementInfo=member=>{
    const suggestion=suggestions.find(item=>item.substitute_member_key===member.member_key);
    const target=member.replacement_for||{};
    const replacementRole=member.covers_role||target.role||suggestion?.role;
    const replacementName=target.name||suggestion?.departed_name||suggestion?.name;
    return {role:replacementRole,name:replacementName};
  };
  const taskFor=member=>{
    const task=member.task&&typeof member.task==="object"?member.task:{};
    const legacy=replacementInfo(member);
    const kind=task.kind||(legacy.name&&legacy.role?"cover_starter":"needs_plan");
    if(kind==="needs_plan")return fr?"Rôle à définir selon le plan":"Role to be defined according to the plan";
    if(kind==="cover_starter"){
      const targetCandidate=typeof task.target_name==="string"&&task.target_name.trim()
        ?task.target_name.trim():legacy.name;
      const targetName=typeof targetCandidate==="string"&&targetCandidate.trim()?targetCandidate.trim():"";
      const role=Object.hasOwn(task,"role")?task.role:legacy.role;
      const localizedRole=SPECIFIC_COVER_ROLES.has(role)?roleLabel(role,lang):"";
      if(targetName){
        const objective=typeof task.objective==="object"?task.objective?.[lang]:task.objective;
        const destination=isHumanText(objective)?` · ${e(objective)}`:"";
        return (fr?`Remplace ${e(targetName)}`:`Replace ${e(targetName)}`)+
          (localizedRole?` · ${e(localizedRole)}`:"")+destination;
      }
      return fr?"Rôle à définir selon le plan":"Role to be defined according to the plan";
    }
    if(kind==="event_objective"&&isHumanText(task.objective)){
      const eventLabel=EVENT_LABELS[lang][task.event_type]||"";
      const objective=e(String(task.objective).trim());
      if(fr)return `${eventLabel?`Sur ${eventLabel} · `:""}Objectif : ${objective}`;
      return `${eventLabel?`For ${eventLabel} · `:""}Objective: ${objective}`;
    }
    return fr?"Rôle à définir selon le plan":"Role to be defined according to the plan";
  };
  const triggerFor=member=>{
    const trigger=member.task?.trigger||member.entry_trigger;
    return t.triggers[trigger]||(fr?"à l’appel":"when called");
  };
  const reserveEntry=(member,index)=>{
    const priority=member.priority===""||member.priority==null?(index+1):member.priority;
    const slot=fr?"place libre":"free slot";
    return `<small class="eventStrategyReserveEntry"><span>${e(t.priority)} ${e(priority)}</span><span>${taskFor(member)} · ${e(triggerFor(member))} · ${e(slot)}</span></small>`;
  };
  const memberRow=(member,isReserve,index)=>{
    const control=typeof renderMemberControl==="function"
      ?renderMemberControl(member,{isReserve,locale:lang}):"";
    return `<li class="eventStrategyMember"><div class="eventStrategyMemberTop"><button type="button" class="eventStrategyMemberName" data-alliance-player-key="${e(member.member_key)}">${e(member.name||"")}</button>${control||""}</div>${isReserve?reserveEntry(member,index):""}</li>`;
  };
  const renderGroup=(title,items,isReserve)=>{
    const key=`${String(plan.event_type||"event").replace(/[^a-z0-9_-]/gi,"")}:${isReserve?"reserves":"starters"}`;
    const id=`event-roster-${key.replace(":","-")}`,open=rosterGroupOpen(key);
    return `<section class="eventStrategyGroup"><button type="button" class="eventStrategyHeading" data-event-roster-toggle="${e(key)}" aria-expanded="${open}" aria-controls="${e(id)}"><span class="eventStrategyGroupTitle">${e(title)} · <span class="eventStrategyGroupCount">${items.length}</span></span><svg class="eventStrategyChevron" aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button><div id="${e(id)}" class="eventStrategyGroupBody"${open?"":" hidden"}>${items.length?`<ol class="eventStrategyRoster">${items.map((member,index)=>memberRow(member,isReserve,index)).join("")}</ol>`:`<p class="eventStrategyEmpty">${e(t.none)}</p>`}</div></section>`;
  };
  const battlefield=["desert_storm","canyon_storm"].includes(plan.event_type);
  const substitutesCapacity=Number(plan.capacity?.substitutes)>0;
  const planB= battlefield&&substitutesCapacity&&plan.plan_b?.mobile_action&&t.planB[plan.plan_b.mobile_action]
    ?`<p class="eventStrategyPlanB"><strong>Plan B</strong> · ${e(t.planB[plan.plan_b.mobile_action])}.</p>`:"";
  return `<section class="eventStrategy" aria-label="${e(t.roster)}">${renderGroup(t.starters,starters,false)}${plan.capacity?.substitutes||reserves.length?renderGroup(t.reserves,reserves,true):""}${planB}</section>`;
}