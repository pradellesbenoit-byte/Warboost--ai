const FIELD_LABELS={
  level:"level",stars:"stars",power:"power",power_m:"power",exclusive:"exclusive",gear:"gear",
  name:"name",hero_name:"name",weapon_name:"name",personal_name:"name",player_name:"name",
  tag:"tag",our_tag:"tag",opponent_tag:"tag",alliance_tag:"tag",
  rank:"rank",personal_rank:"rank",score:"score",our_score:"our_score",their_score:"their_score",personal_score:"personal_score",
  price:"price",quantity:"quantity",currency:"currency",currency_balance:"balance",discount_pct:"discount",
  time_remaining_text:"time_remaining",time_remaining_seconds:"time_remaining",focus:"focus",progress_pct:"percent",
  our_percent:"our_percent",their_percent:"their_percent",item_name:"item",store_type:"store_type",
  hq_level:"level",vip_level:"level",vip_days_remaining:"vip_days",week:"time",day:"time",
  server_id:"tag",our_server_id:"tag",opponent_server_id:"tag",opponent:"opponent",our_alliance:"our_alliance",
  theme:"focus",profession:"focus",resistance:"resistance",number:"season_number",total_days:"total_days",
  type_mastery_pct:"type_mastery_pct",hero_tech_pct:"hero_tech_pct",siege_to_seize_pct:"siege_to_seize_pct",
  defensive_fortification_pct:"defensive_fortification_pct",tactical_weapon_pct:"tactical_weapon_pct",
  sold:"sold",contents:"contents",offer_kind:"offer_kind",category:"category",rarity:"rarity",
  price_confidence:"price_confidence",currency_confidence:"currency_confidence",
  coordinates:"coordinates",limit:"offer_limit",content_verified:"content_verified",contents_verified:"contents_verified",
  cost_gain_verified:"cost_gain_verified",lifecycle:"lifecycle",crystal_event_eligible:"crystal_event_eligible",
  hero_hp_bonus:"hero_hp_bonus",hero_atk_bonus:"hero_atk_bonus",hero_def_bonus:"hero_def_bonus",
  all_damage_resistance_pct:"all_damage_resistance_pct",max_skill_level:"max_skill_level",power_raw:"power_raw",
  unlocked:"unlocked",skill_level:"skill_level",named_shards:"named_shards",universal_shards:"universal_shards",
  trial_complete:"trial_complete",in_base:"in_base",reshape_stage:"reshape_stage",reshape_value:"reshape_value"
};
const RARITIES=["red","orange","gold","purple","blue","green"];
const RARITY_ALIASES={rouge:"red",golden:"gold",or:"gold",violet:"purple",violette:"purple",bleu:"blue",bleue:"blue",vert:"green",verte:"green"};

function labelFor(row,t){
  if(row.path?.[0]==="drone"&&row.field==="level")
    return `${t(row.path.includes("boostCombat")?"scan_review_group_boostCombat":"scan_review_group_drone")} — ${t("scan_review_label_level")}`;
  if(row.path?.[0]==="drone"&&row.field==="power_m")
    return `${t("scan_review_group_drone")} — ${t("scan_review_label_power")}`;
  if(row.field==="server_id"||row.field==="our_server_id"||row.field==="opponent_server_id")return t("server");
  if(row.field==="hq_level")return t("hq");
  if(row.field==="role")return t("scan_review_label_rank");
  if(row.field==="week")return t("week");
  if(row.field==="day")return t("day_label");
  return t(`scan_review_label_${FIELD_LABELS[row.field]||"unknown"}`);
}

function groupHeading(group,t){
  if(["squad","hero","offer","member","progress"].includes(group.kind))
    return t(`scan_review_${group.kind}_heading`,{number:group.number});
  return t(`scan_review_group_${group.kind}`);
}

function combinedGroups(groups){
  const combined=[];
  for(const group of groups){
    const previous=combined.at(-1);
    if(group.number===undefined&&previous?.kind===group.kind&&previous.number===undefined)previous.rows.push(...group.rows);
    else combined.push({...group,rows:[...group.rows]});
  }
  return combined;
}

function badge(row,t,esc){
  const status=row.status==="missing"?"missing":"pending",text=t(`scan_review_status_${status}`);
  return `<span class="scanReviewBadge" data-status="${status}" title="${esc(text)}" aria-label="${esc(text)}">${esc(text)}</span>`;
}

function rarityName(rarity,t){
  const key=RARITY_ALIASES[String(rarity||"").toLowerCase()]||String(rarity||"").toLowerCase();
  return RARITIES.includes(key)?t(`scan_review_rarity_${key}`):"";
}

function gearMarkup(row,id,t,esc){
  const parsed=Array.isArray(row.value)&&row.value.length?row.value:[{count:"",levels:[],rarity:""}];
  const summary=row.status==="missing"
    ?`<p class="scanReviewGearSummary">${esc(t("scan_review_gear_edit_help"))}</p>`
    :`<div class="scanReviewGearSummary">${parsed.map(segment=>{
      const count=Number(segment.count),levels=Array.isArray(segment.levels)?segment.levels:[];
      const title=Number.isInteger(count)&&count>0?t(count===1?"scan_review_gear_one":"scan_review_gear_many",{count}):"";
      const levelLine=levels.length?t(levels.length===1?"scan_review_gear_level_summary":"scan_review_gear_levels_summary",{level:levels[0],levels:levels.join(" / ")}):"";
      return [title,levelLine].filter(Boolean).map(line=>`<span>${esc(line)}</span>`).join("");
    }).join("")}</div>`;
  const segments=parsed.map((segment,index)=>{
    const count=segment.count===""?"":String(segment.count),levels=Array.isArray(segment.levels)?segment.levels.join(" / "):"";
    const selected=new Set(String(segment.rarity||"").toLowerCase().split(",").map(value=>RARITY_ALIASES[value.trim()]||value.trim()).filter(Boolean));
    const countLabel=t("scan_review_label_gear_count"),levelsLabel=t("scan_review_label_gear_levels"),rarityLabel=t("scan_review_label_gear_rarity");
    const rarityNames=[...selected].map(key=>rarityName(key,t)).filter(Boolean).join(" / ");
    const options=RARITIES.map(key=>`<label><input type="checkbox" value="${key}" data-scan-gear-rarity="${id}" data-scan-gear-part="${index}"${selected.has(key)?" checked":""} />${esc(t(`scan_review_rarity_${key}`))}</label>`).join("");
    return `<div class="scanReviewGearSegment" data-scan-gear-segment="${index}"><div class="scanReviewGearFields">
      <label>${esc(countLabel)}<input type="number" min="1" max="4" inputmode="numeric" data-scan-gear-count="${id}" data-scan-gear-part="${index}" value="${esc(count)}" aria-label="${esc(countLabel)}" title="${esc(countLabel)}" /></label>
      <label>${esc(levelsLabel)}<input type="text" inputmode="numeric" data-scan-gear-levels="${id}" data-scan-gear-part="${index}" value="${esc(levels)}" placeholder="${esc(t("scan_review_status_missing"))}" aria-label="${esc(levelsLabel)}" title="${esc(levelsLabel)}" /></label>
      <details class="scanReviewRarity"><summary data-scan-gear-rarity-summary="${id}" data-scan-gear-part="${index}">${esc(rarityLabel)} : ${esc(rarityNames||t("scan_review_status_missing"))}</summary><div class="scanReviewRarityOptions">${options}</div></details>
    </div></div>`;
  }).join("");
  return summary+segments;
}

function rowMarkup(row,id,t,esc){
  const label=labelFor(row,t),status=badge(row,t,esc),inputId=`scanReviewField${id}`;
  const heading=`<div class="scanReviewRowHead">${row.kind==="gear"?`<span class="scanReviewFieldLabel">${esc(label)}</span>`:`<label for="${inputId}">${esc(label)}</label>`}${status}</div>`;
  if(row.kind==="gear"){
    return `<div class="scanReviewRow scanReviewGear">${heading}${gearMarkup(row,id,t,esc)}</div>`;
  }
  const exclusiveNote=row.exclusiveNotVisible?`<p class="scanReviewExclusiveNote">${esc(t("scan_review_exclusive_not_visible"))}</p>`:"";
  const dronePowerNote=row.kind==="dronePower"&&row.status==="missing"
    ?`<p class="scanReviewExclusiveNote">${esc(t("scan_review_drone_power_missing"))}</p>`:"";
  const value=row.status==="missing"?"":String(row.value??"");
  const numeric=row.kind==="number"||["power","level","stars"].includes(row.field)&&row.path.includes("heroes")||row.field==="power"&&row.path[0]==="squads";
  const lifecycle=row.field==="lifecycle"&&["active","ended","interseason"].includes(value);
  const input=lifecycle
    ?`<select id="${inputId}" data-scan-review-id="${id}" aria-label="${esc(label)}" title="${esc(label)}">${["active","ended","interseason"].map(option=>`<option value="${option}"${value===option?" selected":""}>${esc(t(`scan_review_lifecycle_${option}`))}</option>`).join("")}</select>`
    :row.kind==="boolean"
    ?`<select id="${inputId}" data-scan-review-id="${id}" aria-label="${esc(label)}" title="${esc(label)}"><option value="true"${row.value===true?" selected":""}>${esc(t("scan_review_true"))}</option><option value="false"${row.value===false?" selected":""}>${esc(t("scan_review_false"))}</option></select>`
    :`<input id="${inputId}" type="${numeric?"number":"text"}" data-scan-review-id="${id}" value="${esc(value)}" placeholder="${esc(t(row.kind==="dronePower"?"scan_review_drone_power_missing":"scan_review_status_missing"))}" aria-label="${esc(label)}" title="${esc(label)}"${numeric?' min="0" step="any" inputmode="decimal"':row.kind==="dronePower"?' inputmode="numeric"':""} />`;
  return `<div class="scanReviewRow">${heading}${exclusiveNote}${dronePowerNote}${input}</div>`;
}

export function renderScanReviewMarkup(groups,t,esc){
  const rows=[];
  const html=combinedGroups(groups).map(group=>{
    const heading=groupHeading(group,t);
    const content=group.rows.map(row=>rowMarkup(row,rows.push(row)-1,t,esc)).join("");
    return `<section class="scanReviewGroup" aria-label="${esc(heading)}"><h4 class="scanReviewGroupTitle">${esc(heading)}</h4><div class="scanReviewGroupRows">${content}</div></section>`;
  }).join("");
  return {html,rows};
}