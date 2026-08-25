// WarBoost V2.3.4 — reliable hero decoration for the full hero catalog.
// Decorative/contextual only: does not alter gameplay data or AI scoring.
import {heroKey,heroPresentation,catalogHeroName,HERO_CATALOG} from './lib/heroes.js';

function heroFromName(name=''){return heroPresentation(name)}
function heroFromHeading(card){
  // V2.3.4 audited rule: explicit AI/data identity always wins.
  const explicit=heroFromName(card?.dataset?.hero||'');
  if(explicit)return explicit;
  // Legacy fallback is deliberately restricted to the title itself, never reason/comparison text.
  const title=card?.querySelector('.decisionTitle b,.decisionHead b,h4,h3,.proSubTitle')?.textContent||'';
  for(const name of [...HERO_CATALOG].sort((a,b)=>b.length-a.length)){
    const canonical=catalogHeroName(name);
    if(canonical&&new RegExp(`(^|[^A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^A-Za-z0-9]|$)`,'i').test(title))return heroFromName(canonical);
  }
  return null;
}
function heroImg(hit,index=0){
  const img=document.createElement('img');img.className='wbHeroAvatar'+(index===0?' wbTopHero':'');img.src=hit.src;img.alt=`${hit.name} — WarBoost demo visual`;img.loading='lazy';return img
}
function decorateCard(card,index=0){
  if(!card)return;const hit=heroFromHeading(card);
  const existing=card.querySelector(':scope > .wbHeroInline, .decisionHead > .wbHeroInline, .shopHead > .wbHeroInline');
  if(!hit){if(existing)existing.remove();delete card.dataset.wbHeroKey;return}
  const hk=heroKey(hit.name);if(card.dataset.wbHeroKey===hk&&existing)return;
  if(existing)existing.remove();card.dataset.wbHeroKey=hk;card.classList.add('wbHeroDecorated','wbHeroFadeIn');
  const img=heroImg(hit,index),target=card.querySelector('h4,h3,.proSubTitle,.decisionHead b,.shopHead b,strong,b')||card.firstElementChild;
  if(target){const wrap=document.createElement('span');wrap.className='wbHeroInline';target.parentNode.insertBefore(wrap,target);wrap.append(img,target);if(index===0){const badge=document.createElement('span');badge.className='wbHeroBadge';badge.innerHTML='✦ <strong>Priorité IA</strong>';wrap.appendChild(badge)}}else card.prepend(img)
}
function decorateList(root){if(!root)return;[...root.children].forEach((c,i)=>decorateCard(c,i))}
function decorateSquads(){
  const root=document.querySelector('#squadList');if(!root)return;
  [...root.children].forEach(squad=>{
    const hits=[];const add=h=>{if(h&&!hits.some(x=>heroKey(x.name)===heroKey(h.name)))hits.push(h)};
    [...squad.querySelectorAll('[data-hero]')].map(x=>x.dataset.hero).filter(Boolean).forEach(n=>add(heroFromName(n)));
    let rail=squad.querySelector(':scope > .wbHeroSquadRail');if(!hits.length){if(rail)rail.remove();return}
    if(!rail){rail=document.createElement('div');rail.className='wbHeroInline wbHeroSquadRail wbHeroFadeIn';rail.style.marginTop='8px';squad.appendChild(rail)}
    rail.innerHTML='';hits.slice(0,5).forEach(h=>rail.appendChild(heroImg(h)))
  })
}
function refresh(){decorateList(document.querySelector('#proPriorityList'));decorateSquads()}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
  const obs=new MutationObserver(()=>requestAnimationFrame(refresh));
  ['#proPriorityList','#squadList'].forEach(sel=>{const n=document.querySelector(sel);if(n)obs.observe(n,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-hero']})});
  if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',refresh);setTimeout(refresh,300);setTimeout(refresh,1000)
}
export {heroKey,heroFromName,heroFromHeading};
