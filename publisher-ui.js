// WarBoost V2.3.6 — hero visuals reliability layer.
// Diagnostic PRO portraits are rendered directly by app.js from explicit AI hero identity.
// This module only maintains the squad portrait rail and never mutates Diagnostic cards.
import {heroKey,heroPresentation} from './lib/heroes.js';

function heroFromName(name=''){return heroPresentation(name)}
function heroImg(hit){
  const img=document.createElement('img');
  img.className='wbHeroAvatar';
  img.src=hit.src;
  img.alt=`${hit.name} — WarBoost demo visual`;
  img.loading='lazy';
  return img;
}
function decorateSquads(){
  const root=document.querySelector('#squadList');if(!root)return;
  [...root.children].forEach(squad=>{
    const hits=[];
    const add=h=>{if(h&&!hits.some(x=>heroKey(x.name)===heroKey(h.name)))hits.push(h)};
    [...squad.querySelectorAll('[data-hero]')].map(x=>x.dataset.hero).filter(Boolean).forEach(n=>add(heroFromName(n)));
    let rail=squad.querySelector(':scope > .wbHeroSquadRail');
    if(!hits.length){if(rail)rail.remove();return}
    if(!rail){rail=document.createElement('div');rail.className='wbHeroInline wbHeroSquadRail wbHeroFadeIn';rail.style.marginTop='8px';squad.appendChild(rail)}
    const signature=hits.slice(0,5).map(h=>heroKey(h.name)).join('|');
    if(rail.dataset.heroSignature===signature)return;
    rail.dataset.heroSignature=signature;
    rail.replaceChildren(...hits.slice(0,5).map(heroImg));
  })
}
function refresh(){decorateSquads()}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
  const root=document.querySelector('#squadList');
  if(root){
    let queued=false;
    const obs=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})});
    obs.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-hero']});
  }
  if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',refresh);
  setTimeout(refresh,300);
  setTimeout(refresh,1000);
}
export {heroKey,heroFromName};


// V2.5.21 Publisher Demo RC controls. No cloud/account mutation is performed here.
function initPublisherRcControls(){
  document.body.classList.add('publisherDemoRc');
  const reset=document.getElementById('publisherResetBtn'),status=document.getElementById('publisherResetStatus');
  if(reset)reset.addEventListener('click',()=>{try{window.__WARBOOST_PUBLISHER_DEMO__?.reset?.();if(status){status.className='notice';status.textContent='Publisher demo data reset to the anonymized sample fixture.'}}catch{if(status){status.className='notice warn';status.textContent='Reset unavailable. Reload the page to restore the sample fixture.'}}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPublisherRcControls,{once:true});else initPublisherRcControls();
