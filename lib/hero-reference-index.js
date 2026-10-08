import {HERO_DEFINITIONS,heroKey} from "./heroes.js";

// Equipment ownership is NOT evidence of a different hero appearance.
export const HERO_EXCLUSIVE_WEAPON_OWNERS=Object.freeze([
  "Kimberly","DVA","Tesla","Murphy","Carlie","Swift","Marshall","Skyler",
  "McGregor","Lucius","Adam","Williams","Stetmann","Morrison","Fiona"
]);

// Named-source portraits, visually reviewed against the original game thumbnails.
// These records attest source identity, NOT recognition accuracy or a usage licence.
// Original images and the complete provenance manifest remain server-side.
const official=new Set(["DVA","Carlie","Violet","Marshall","McGregor"]);
const community=new Set(["Adam","Carlie","DVA","Fiona","Kimberly","Lucius","Marshall","McGregor","Morrison","Murphy","Skyler","Stetmann","Swift","Tesla","Violet","Williams"]);
// Deliberate reviewed allowlist: adding a roster entry must not manufacture a
// verified reference for an image that has never been sourced or reviewed.
const reviewedThumbnails=new Set([
  "Kimberly","Marshall","Williams","Murphy","Stetmann","Mason","Violet","Scarlett","Monica","Richard","Farhad","Gump","Loki",
  "DVA","Morrison","Carlie","Lucius","Skyler","Sarah","Cage","Ambolt","Maxwell",
  "Tesla","Fiona","Swift","Adam","McGregor","Venom","Elsa","Kane","Braz"
]);
// Add an attested variant record here only after its source/image review.
const reviewedVariants=[
  ["Kimberly","awakening","hero-awakening"],
  ["DVA","awakening","season-6-dva-awakening"],
  ["Tesla","awakening","season-6-tesla-awakening"],
  ["Sarah","ssr_to_ur","season-4-sarah-ur-promotion"],
  ["Venom","ssr_to_ur","season-5-venom-ur-promotion"],
  ["Braz","ssr_to_ur","season-6-braz-ur-promotion"]
].map(([name,variant,page])=>Object.freeze({
  id:`${heroKey(name)}.${variant==="ssr_to_ur"?"ssrtour":variant}.cpthedgehog`,
  canonicalName:name,displayName:name,variant,status:"verified",
  imageRole:name==="DVA"?"new_appearance_preview":variant==="ssr_to_ur"?"promotion_preview":"hero_illustration",
  sourcePage:`https://cpt-hedge.com/guides/${page}`
}));
export const HERO_REFERENCE_INDEX=Object.freeze([...HERO_DEFINITIONS.filter(hero=>reviewedThumbnails.has(hero.name)).flatMap(hero=>{
  const sources=[...(official.has(hero.name)?["official"]:[]),...(community.has(hero.name)?["lastwarwiki"]:[]),"fandom"];
  return sources.map(source=>Object.freeze({
    id:`${heroKey(hero.name)}.normal.${source}`,canonicalName:hero.name,
    displayName:hero.displayName||hero.name,variant:"normal",status:"verified",
    sourcePage:source==="official"?"https://www.lastwar.com/en/home.html":
      source==="fandom"?"https://last-war-survival.fandom.com/wiki/Heroes":
      `https://lastwar.wiki/heroes/${(hero.displayName||hero.name).toLowerCase()}/`
  }));
}),...reviewedVariants]);
