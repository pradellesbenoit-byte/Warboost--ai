// Dated community advice, not an official/live battlefield feed.
export const TACTICS_CHECKED_AT="2026-10-03T00:00:00Z";
export const OBJECTIVES={
  desert_storm:{
    nuclear_silo:{fr:"silo nucléaire",en:"Nuclear Silo"},
    oil_refineries:{fr:"raffineries",en:"Oil Refineries"},
    field_hospitals:{fr:"hôpitaux de campagne",en:"Field Hospitals"},
    info_center:{fr:"centre d’information",en:"Info Center"},
    science_hub:{fr:"centre scientifique",en:"Science Hub"}
  },
  vs:{visible_daily_tasks:{fr:"tâches VS visibles du jour",en:"Visible VS daily tasks"},resource_reserve:{fr:"réserve de ressources",en:"Resource reserve"}},
  season:{confirmed_active_season:{fr:"objectifs de la saison confirmée",en:"Confirmed active season objectives"}},
  canyon_storm:{
    virus_lab:{fr:"laboratoire viral",en:"Virus Lab"},
    power_tower:{fr:"tour d’énergie",en:"Power Tower"},
    data_centers:{fr:"centres de données",en:"Data Centers"},
    serum_factories:{fr:"usines de sérum",en:"Serum Factories"}
  }
};
export const CURATED_TACTICS={
  vs:{
    sources:["https://lastwarvault.com/guides/general/vs-guide/","https://www.lastwargame.online/en/game-alliance-duel"],
    priority_roles:["contributor"],objectives:{contributor:"visible_daily_tasks"}
  },
  season:{
    sources:["https://lastwarhub.com/en/seasons","https://lastwarvault.com/guides/seasons/"],
    priority_roles:["contributor"],objectives:{contributor:"confirmed_active_season"}
  },
  desert_storm:{
    sources:["https://www.lastwartutorial.com/desert-storm","https://www.ldshop.gg/blog/last-war-survival/desert-storm.html","https://lastwarsurvival.com/alliance"],
    priority_roles:["objective_defense","objective_capture","objective_retake","rapid_intervention","main_attack","group_support"],
    objectives:{main_attack:"nuclear_silo",objective_defense:"oil_refineries",objective_capture:"info_center",objective_retake:"nuclear_silo",rapid_intervention:"field_hospitals",group_support:"science_hub"}
  },
  canyon_storm:{
    sources:["https://lastwarhandbook.com/guides/canyon-storm-battlefield-guide","https://www.lastcmd.com/docs/canyon-storm","https://lastwarsurvival.com/alliance"],
    priority_roles:["objective_defense","objective_retake","rapid_intervention","objective_capture","group_support","main_attack"],
    objectives:{main_attack:"virus_lab",objective_defense:"power_tower",objective_capture:"data_centers",objective_retake:"virus_lab",rapid_intervention:"virus_lab",group_support:"serum_factories"}
  }
};
export const RESEARCH_DOMAINS=["wiki.lastwar.com","firstfungroup.zendesk.com","lastwarvault.com","lastwartutorial.com","lastwarsurvival.com","lastwarhandbook.com","lastcmd.com","ldshop.gg","reddit.com","lastwargame.online","lastwarhub.com"];
export function sourceDomain(url){
  try{const parsed=new URL(url);if(parsed.protocol!=="https:")return null;
    const host=parsed.hostname.replace(/^www\./,"");
    return RESEARCH_DOMAINS.includes(host)&&!parsed.username&&!parsed.password?host:null;
  }catch{return null}
}
export function canonicalSourceUrl(value){
  try{const url=new URL(value);if(!sourceDomain(value))return null;
    return `https://${url.hostname.replace(/^www\./,"")}${url.pathname.replace(/\/$/,"")||"/"}`;
  }catch{return null}
}
export function eventSource(url,type){
  const normalized=canonicalSourceUrl(url);
  const path=normalized?new URL(normalized).pathname.toLowerCase().replaceAll("_","-"):"";
  if(type==="vs")return /vs-guide|alliance-duel|duel-vs/.test(path);
  if(type==="season")return /seasons|season-|season\//.test(path);
  const marker=type==="desert_storm"?"desert-storm":type==="canyon_storm"?"canyon-storm":null;
  return Boolean(normalized&&marker&&path.includes(marker));
}
const publisher=url=>{
  const host=sourceDomain(url);
  return ["wiki.lastwar.com","firstfungroup.zendesk.com"].includes(host)?"lastwar_official":host;
};
export function usableResearch(raw,type,nowMs=Date.now()){
  const age=nowMs-Date.parse(raw?.checked_at||"");
  if(raw?.status!=="verified"||raw.event_type!==type||!Number.isFinite(age)||age<0||age>864e5)return null;
  const recommendations=(Array.isArray(raw.recommendations)?raw.recommendations:[]).filter(r=>
    CURATED_TACTICS[type]?.priority_roles.includes(r.role)&&OBJECTIVES[type]?.[r.objective_id]&&
    r.classification==="community_advice"&&
    new Set((Array.isArray(r.sources)?r.sources:[]).filter(url=>eventSource(url,type)).map(publisher).filter(Boolean)).size>=2);
  return recommendations.length?{...raw,recommendations}:null;
}
export function reserveTactics(type,{research=null,nowMs=Date.now()}={}){
  const curated=CURATED_TACTICS[type];
  if(!curated)return null;
  const accepted=usableResearch(research,type,nowMs);
  const curatedAge=nowMs-Date.parse(TACTICS_CHECKED_AT);
  if(!accepted&&(!Number.isFinite(curatedAge)||curatedAge<0||curatedAge>60*864e5))return null;
  const objectives={...curated.objectives};
  const assigned=new Set();
  for(const r of accepted?.recommendations||[])if(!assigned.has(r.role)){objectives[r.role]=r.objective_id;assigned.add(r.role)}
  return {priority_roles:accepted?[...new Set([...accepted.recommendations.map(r=>r.role),...curated.priority_roles])]:curated.priority_roles,
    objectives,checked_at:accepted?.checked_at||TACTICS_CHECKED_AT,
    evidence_kind:"community_advice",official_rules:false,live_game_data:false,
    research_status:accepted?"verified":research?.status||"not_requested",
    method:accepted?.method||"dated_community_fallback",
    sources:accepted?[...new Set(accepted.recommendations.flatMap(r=>r.sources))]:curated.sources};
}