import {buildTechnologyAdvice} from "./technology-advisor.js";
import {confirmedCompositionForSquad,savedSquadCompositionCandidate} from "./squad-identity.js";
import {canonicalHeroName,heroType} from "./heroes.js";
import {TECHNOLOGY_KEYS} from "./technology-manual.js";
import {technologyManualCopy} from "./technology-manual-copy.js";
import {technologyAdvisorCopy} from "./technology-advisor-copy.js";
import {normalizeTechnologyBranches} from "./technology-scan.js";

const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const safeSquadId=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=4?Number(value):1;

function confirmedHeroesForSquad(squad,id){
  if(!squad||squad.needs_rescan===true)return null;
  const names=confirmedCompositionForSquad(squad,id);
  if(!Array.isArray(names)||names.length!==5)return null;
  const canonical=names.map(name=>canonicalHeroName(name));
  if(canonical.some(name=>!name)||new Set(canonical.map(name=>name.toLowerCase())).size!==5)return null;
  return canonical;
}

export function technologyAdvisorSquad(state={},requestedSquadId=1){
  const requested=safeSquadId(requestedSquadId),rows=Array.isArray(state?.squads)?state.squads:[];
  const squadAt=id=>rows.find(row=>Number(row?.id)===id)||rows[id-1]||null;
  const candidate=squadAt(requested),candidateHeroes=confirmedHeroesForSquad(candidate,requested);
  const id=requested!==1&&candidateHeroes?requested:1,squad=squadAt(id),heroes=confirmedHeroesForSquad(squad,id);
  const savedNames=savedSquadCompositionCandidate(squad,id);
  const typed=(heroes||[]).map(name=>({name,type:heroType(name)}));
  const counts={tank:0,aircraft:0,missile:0};
  for(const hero of typed)if(hero.type in counts)counts[hero.type]++;
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const majority=ranked[0]?.[1]>=3&&ranked[0][1]>ranked[1]?.[1];
  return {
    id,heroes:heroes||[],identitiesConfirmed:Boolean(heroes),complete:Boolean(heroes&&typed.every(hero=>hero.type)),
    savedNames:savedNames||[],canConfirmSavedHeroes:Boolean(savedNames&&(!heroes||squad?.needs_rescan===true)),
    type:heroes&&typed.every(hero=>hero.type)&&majority?ranked[0][0]:null,
    typeCount:majority?ranked[0][1]:0,
    typedCount:typed.filter(hero=>hero.type).length
  };
}

export function buildPersonalTechnologyAdvice(state={},{
  requestedSquadId=state?.diagnostic_squad_id||1,now=new Date()
}={}){
  const formation=technologyAdvisorSquad(state,requestedSquadId);
  const branches=normalizeTechnologyBranches(state?.technology?.branches||{});
  const advisorState={...state,technology:{...(state?.technology||{}),branches}};
  const advice=buildTechnologyAdvice(advisorState,{mainType:formation.type,now});
  const confirmedEntries=Object.entries(branches).filter(([,item])=>["percent","max","locked"].includes(item?.state));
  return {
    owner:String(state?.player_id||""),squadId:formation.id,formation,
    hasBranches:confirmedEntries.length>0,advice,
    maxBranches:confirmedEntries.filter(([,item])=>item?.state==="max").map(([key,item])=>({key,name:String(item.name||key)})),
    lockedBranches:confirmedEntries.filter(([,item])=>item?.state==="locked").map(([key,item])=>({key,name:String(item.name||key),prerequisite:String(item.prerequisite||"")}))
  };
}

function branchName(branch,locale,providedName){
  const index=TECHNOLOGY_KEYS.indexOf(branch.key);
  const localized=technologyManualCopy(locale).names[index];
  return localized||branch.name||branch.key;
}

function recommendationCard(branch,rank,model,{locale,t,copy,formationLabel}){
  const name=branchName(branch,locale);
  const value=branch.state==="percent"?`${new Intl.NumberFormat(locale||"en").format(branch.percent)} %`:t("technology_advice_no_action");
  const formationReason=["tank_specialization","aircraft_specialization","missile_specialization"].includes(branch.key)&&model.formation.type
    ?copy.formation.replace("{count}",String(model.formation.typeCount)).replace("{type}",copy.types[model.formation.type])
    :"";
  const reason=t(branch.reason_key||"technology_advice_reason_general");
  const action=copy.next.replace("{branch}",name);
  return `<article class="technologyAdvisorCard" data-technology-branch="${escape(branch.key)}">
    <div class="technologyAdvisorCardHead"><b>${escape(name)}</b><span>${escape(t("technology_advice_priority"))} ${rank} · ${escape(value)}</span></div>
    <p>${escape(reason)}</p>${formationReason?`<p class="technologyAdvisorFormation">${escape(formationReason)}</p>`:""}
    <p class="technologyAdvisorAction">${escape(action)}</p>
  </article>`;
}

export function renderPersonalTechnologyAdvice(model,{locale="en",t=key=>key,objectiveLabel=value=>value,open=false}={}){
  const copy=technologyAdvisorCopy(locale),manual=technologyManualCopy(locale),advice=model.advice;
  const goal=objectiveLabel(advice.context?.objective||"auto");
  const priority=advice.main?recommendationCard(advice.main,1,model,{locale,t,copy}):"";
  const next=(advice.next||[]).map((branch,index)=>recommendationCard(branch,index+2,model,{locale,t,copy})).join("");
  const formationNote=model.formation.type
    ?`<p class="technologyAdvisorFormation">${escape(copy.formation.replace("{count}",String(model.formation.typeCount)).replace("{type}",copy.types[model.formation.type]))}</p>`
    :`<p class="technologyAdvisorNotice">${escape(model.formation.identitiesConfirmed?t("technology_advice_main_type_unknown"):copy.confirmHeroes)}</p>`;
  const confirmHeroesAction=model.formation.canConfirmSavedHeroes
    ?`<button class="secondaryBtn technologyAdvisorConfirmHeroes" type="button" data-technology-confirm-squad="${model.squadId}">${escape(t("hero_confirm_action"))}</button>`:"";
  const locked=model.lockedBranches.length?`<div class="technologyAdvisorLocked"><h4>${escape(t("technology_advice_locked"))}</h4><ul>${model.lockedBranches.map(item=>`<li><b>${escape(branchName(item,locale))}</b> — ${escape(item.prerequisite?t("technology_advice_locked_requirement",{requirement:item.prerequisite}):t("technology_advice_locked_unknown"))}</li>`).join("")}</ul></div>`:"";
  const max=model.maxBranches.length?`<div class="technologyAdvisorMax"><b>${escape(copy.max)}</b><ul>${model.maxBranches.map(item=>`<li>${escape(branchName(item,locale))}</li>`).join("")}</ul></div>`:"";
  const notices=[];
  if(!model.hasBranches)notices.push(`<p class="technologyAdvisorNotice">${escape(copy.noBranches)}</p>`);
  if(advice.status==="separate_path")notices.push(`<p class="technologyAdvisorNotice">${escape(t(advice.path_key||"technology_advice_t11_route"))}</p>`);
  else if(advice.status==="no_action")notices.push(`<p class="technologyAdvisorNotice">${escape(t("technology_advice_no_action"))}</p>`);
  return `<details class="technologyAdvisorDisclosure" dir="${manual.dir}"${open?" open":""}>
    <summary><span>🧠 ${escape(copy.title)} · ${escape(t("squad"))} ${model.squadId}</span><span class="technologyAdvisorChevron" aria-hidden="true">⌄</span></summary>
    <div class="technologyAdvisorContent">
      <div class="technologyAdvisorContext"><span class="pill">${escape(goal)}</span>${advice.context?.hq_level!==null&&advice.context?.hq_level!==undefined?`<span class="pill">${escape(t("hq"))} ${escape(advice.context.hq_level)}</span>`:`<span class="pill">${escape(t("hq"))} · ${escape(t("to_fill"))}</span>`}</div>
      <p class="technologyAdvisorIntro">${escape(copy.intro)}</p>${formationNote}${confirmHeroesAction}${notices.join("")}
      ${priority?`<h4>${escape(t("technology_advice_priority"))}</h4>${priority}`:""}
      ${next?`<h4>${escape(t("technology_advice_next"))}</h4><div class="technologyAdvisorNext">${next}</div>`:""}
      ${locked}${max}
      <p class="technologyAdvisorDisclaimer">${escape(t("technology_advice_source"))} ${escape(t("technology_advice_rank_note"))}</p>
    </div>
  </details>`;
}

export function createTechnologyAdvisorUI({root,getState,getLocale,getPrivateVisible,getSelectedSquadId,getTranslate,getObjectiveLabel}){
  let owner=null,open=false;
  return {
    render(){
      if(!getPrivateVisible?.()){root.replaceChildren();owner=null;open=false;return}
      const state=getState(),currentOwner=String(state?.player_id||"");
      if(!currentOwner){root.replaceChildren();owner=null;open=false;return}
      const switched=owner!==currentOwner;
      if(switched){owner=currentOwner;open=false}
      else open=root.querySelector("details")?.open??open;
      const locale=getLocale(),model=buildPersonalTechnologyAdvice(state,{requestedSquadId:getSelectedSquadId?.()||1});
      root.innerHTML=renderPersonalTechnologyAdvice(model,{
        locale,t:getTranslate,objectiveLabel:getObjectiveLabel,open
      });
    },
    reset(){root.replaceChildren();owner=null;open=false}
  };
}
