import {HERO_DEFINITIONS,heroKey} from "./heroes.js";

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
const reviewedVariants=[];
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
