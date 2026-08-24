
// WarBoost V2.1 — Hero Live UI
// Decorative/contextual only: does not alter gameplay data or AI scoring.
const HEROES = {
  kimberly: '/kimberly.svg', kim: '/kimberly.svg',
  murphy: '/murphy.svg', williams: '/williams.svg', dva: '/dva.svg',
  lucius: '/lucius.svg', carlie: '/carlie.svg', morrison: '/morrison.svg',
  skyler: '/skyler.svg', schuyler: '/skyler.svg'
};

function heroFromText(text=''){
  const s=text.toLowerCase();
  const names=Object.keys(HEROES).sort((a,b)=>b.length-a.length);
  for(const n of names){ if(s.includes(n)) return {name:n==='kim'?'Kimberly':n==='schuyler'?'Skyler':n[0].toUpperCase()+n.slice(1), src:HEROES[n]}; }
  return null;
}

function decorateCard(card,index=0){
  if(!card || card.dataset.wbHeroDecorated==='1') return;
  const hit=heroFromText(card.textContent||'');
  if(!hit) return;
  card.dataset.wbHeroDecorated='1';
  card.classList.add('wbHeroDecorated','wbHeroFadeIn');
  const img=document.createElement('img');
  img.className='wbHeroAvatar'+(index===0?' wbTopHero':'');
  img.src=hit.src; img.alt=`${hit.name} — visual demo`; img.loading='lazy';
  const target=card.querySelector('h4,h3,.proSubTitle,strong,b') || card.firstElementChild;
  if(target){
    const wrap=document.createElement('span'); wrap.className='wbHeroInline';
    target.parentNode.insertBefore(wrap,target); wrap.append(img,target);
    if(index===0){ const badge=document.createElement('span'); badge.className='wbHeroBadge'; badge.innerHTML='✦ <strong>Priorité IA</strong>'; wrap.appendChild(badge); }
  } else card.prepend(img);
}

function decorateList(root){
  if(!root) return;
  const cards=[...root.children];
  cards.forEach((c,i)=>decorateCard(c,i));
}

function decorateSquads(){
  const root=document.querySelector('#squadList'); if(!root) return;
  [...root.children].forEach((squad)=>{
    if(squad.dataset.wbSquadHeroes==='1') return;
    const text=squad.textContent||'';
    const found=[];
    for(const [n,src] of Object.entries(HEROES)){
      if(text.toLowerCase().includes(n) && !found.some(x=>x.src===src)) found.push({n,src});
    }
    if(!found.length) return;
    squad.dataset.wbSquadHeroes='1';
    const rail=document.createElement('div'); rail.className='wbHeroInline wbHeroFadeIn'; rail.style.marginTop='8px';
    found.slice(0,5).forEach((h)=>{const img=document.createElement('img');img.className='wbHeroAvatar';img.src=h.src;img.alt=`${h.n} demo`;img.loading='lazy';rail.appendChild(img)});
    squad.appendChild(rail);
  });
}

function refresh(){
  decorateList(document.querySelector('#proPriorityList'));
  decorateList(document.querySelector('#proShopList'));
  decorateSquads();
}

const obs=new MutationObserver(()=>requestAnimationFrame(refresh));
['#proPriorityList','#proShopList','#squadList'].forEach(sel=>{const n=document.querySelector(sel); if(n) obs.observe(n,{childList:true,subtree:true,characterData:true});});
window.addEventListener('DOMContentLoaded',refresh);
setTimeout(refresh,400); setTimeout(refresh,1200);
