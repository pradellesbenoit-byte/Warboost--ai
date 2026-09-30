export const PLAYER_SCAN_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({value:"profile",labelKey:"scan_profile"}),
  Object.freeze({value:"squad1",labelKey:"squad",suffix:" 1"}),
  Object.freeze({value:"squad2",labelKey:"squad",suffix:" 2"}),
  Object.freeze({value:"squad3",labelKey:"squad",suffix:" 3"}),
  Object.freeze({value:"squad4",labelKey:"squad",suffix:" 4"}),
  Object.freeze({value:"drone",labelKey:"scan_drone"}),
  Object.freeze({value:"exclusive",labelKey:"scan_exclusive"}),
  Object.freeze({value:"awakening",labelKey:"scan_awakening"}),
  Object.freeze({value:"shop",labelKey:"scan_shop"}),
  Object.freeze({value:"vs",labelKey:"scan_vs"}),
  Object.freeze({value:"season",labelKey:"scan_season"}),
  Object.freeze({value:"technology",labelKey:"scan_technology"})
]);

const INTERNAL_LABEL=/^(?:scan_[a-z0-9_]+|[a-z0-9]+(?:_[a-z0-9]+)+|(?:api|lib|scripts)(?:\/|$)|(?:debug|internal|test)(?:\b|[_ -]))/i;
const FORBIDDEN_PLAYER_LABEL=/secret[\s_-]+mobile[\s_-]+squad/i;

export function buildPlayerScanOptions(translate){
  if(typeof translate!=="function")throw new TypeError("A scan-label translator is required");
  return PLAYER_SCAN_TYPE_DEFINITIONS.flatMap(definition=>{
    const translated=String(translate(definition.labelKey)||"").trim();
    if(!translated||translated===definition.labelKey||INTERNAL_LABEL.test(translated)||FORBIDDEN_PLAYER_LABEL.test(translated))return [];
    return [{...definition,label:`${translated}${definition.suffix||""}`}];
  });
}

export function normalizePlayerScanType(value,options=PLAYER_SCAN_TYPE_DEFINITIONS){
  const scanType=String(value||"");
  return options.some(option=>option.value===scanType)?scanType:"profile";
}