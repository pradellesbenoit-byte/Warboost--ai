function cleanLabel(value,fallback){const text=String(value??"").trim();return text||fallback}

export function desertStormMissionLabel(code,{groupIndex=0,translate}={}){
  const label=key=>cleanLabel(typeof translate==="function"?translate(key):key,key);
  const refinery1=`${label("refinery")} 1`,refinery2=`${label("refinery")} 2`,hospital1=`${label("hospital")} 1`,hospital2=`${label("hospital")} 2`;
  const hospitalForGroup=groupIndex>=3?hospital2:hospital1,refineryForGroup=groupIndex===1?refinery2:refinery1;
  const labels={
    refinery_science:`${refinery1} + ${label("science")}`,
    refinery_info:`${refinery2} + ${label("info")}`,
    hospital_pair:hospitalForGroup,
    mobile_capture:`${label("mobile")} · ${label("free_capture")}`,
    compact_opening:`${refinery1} + ${label("science")} / ${refinery2} + ${label("info")}`,
    refinery_info_hospital:`${refinery2} + ${label("info")} + ${hospital1} + ${hospital2}`,
    hospitals_mobile:`${hospital1} + ${hospital2} + ${label("mobile")}`,
    silo_anchor:`${label("silo")} · ${label("anchor")}`,
    silo_support:`${label("silo")} · ${label("support")}`,
    arsenal:label("arsenal"),
    mercenary_factory:label("mercenary"),
    silo_mobile:`${label("silo")} / ${label("mobile")}`,
    buff_or_silo_support:`${label("central_buff")} / ${label("silo")}`,
    buffs_then_silo:`${label("central_buffs")} → ${label("silo")}`,
    hold_silo:`${label("hold")} ${label("silo")}`,
    hold_refinery:`${label("hold")} ${refineryForGroup}`,
    support_silo:`${label("support")} ${label("silo")}`,
    support_weak_side:`${label("support")} · ${label("weak_side")}`,
    oil_wells_if_stable:`${label("wells")} · ${label("if_stable")}`,
    hold_best_objectives:`${label("hold")} · ${label("best_objectives")}`,
    mobile_support:`${label("mobile")} · ${label("support")}`
  };
  return labels[code]||String(code||"—").replaceAll("_"," ");
}