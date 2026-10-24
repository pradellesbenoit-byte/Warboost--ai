// WarBoost V2.3.6 — hero visuals reliability layer.
// HF8.6.28 reliability patch: also repairs stale contradictory identity-pending state
// without changing canonical roster names, ranks or valid links.
import {heroKey,heroPresentation} from './lib/heroes.js';
import {normalizeUnlinkedAccounts} from './lib/alliance-identity.js';

const CORE_STATE_KEY='warboost_v1_core_state';
const BACKUP_STATE_KEY='warboost_last_good_state';
const ACCOUNT_STATE_PREFIX='warboost_account_state:';
const IDENTITY_REPAIR_RELOAD_KEY='warboost_hf8628_identity_repair_reload';

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

function repairContradictoryPendingState(state){
  if(!state||typeof state!=='object'||!state.alliance||typeof state.alliance!=='object')return {state,changed:false};
  const members=Array.isArray(state.alliance.members)?state.alliance.members:[];
  const pending=Array.isArray(state.alliance.unlinked_accounts)?state.alliance.unlinked_accounts:[];
  if(!pending.length||!members.length)return {state,changed:false};
  const next=normalizeUnlinkedAccounts(pending,members,{serverId:state.alliance.server_id||state.player?.server_id,allianceTag:state.alliance.tag,currentPlayerId:state.player_id,currentPlayerName:state.player?.name,identityLinkStatus:state.alliance.identity_link_status});
  if(next.length===pending.length)return {state,changed:false};
  return {state:{...state,alliance:{...state.alliance,unlinked_accounts:next}},changed:true};
}
function repairStoredJson(key,{nestedState=false}={}){
  try{
    const raw=localStorage.getItem(key);if(!raw)return false;
    const parsed=JSON.parse(raw);
    if(nestedState){
      const fixed=repairContradictoryPendingState(parsed?.state);
      if(!fixed.changed)return false;
      localStorage.setItem(key,JSON.stringify({...parsed,state:fixed.state}));
      return true;
    }
    const fixed=repairContradictoryPendingState(parsed);
    if(!fixed.changed)return false;
    localStorage.setItem(key,JSON.stringify(fixed.state));
    return true;
  }catch{return false}
}
function repairStoredIdentityState(){
  let changed=repairStoredJson(CORE_STATE_KEY);
  changed=repairStoredJson(BACKUP_STATE_KEY,{nestedState:true})||changed;
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(key?.startsWith(ACCOUNT_STATE_PREFIX))changed=repairStoredJson(key)||changed;
    }
  }catch{}
  return changed;
}
let identityRepairQueued=false;
function repairIdentityAndReloadIfNeeded(){
  if(identityRepairQueued)return;
  identityRepairQueued=true;
  setTimeout(()=>{
    identityRepairQueued=false;
    const changed=repairStoredIdentityState();
    if(!changed){try{sessionStorage.removeItem(IDENTITY_REPAIR_RELOAD_KEY)}catch{};return}
    // app.js keeps state in module memory; a single controlled reload is the safest way to make
    // the corrected durable state authoritative without reaching into private module internals.
    try{
      if(sessionStorage.getItem(IDENTITY_REPAIR_RELOAD_KEY)!=='1'){
        sessionStorage.setItem(IDENTITY_REPAIR_RELOAD_KEY,'1');
        location.reload();
      }
    }catch{location.reload()}
  },40);
}
function observeIdentityPanel(){
  const root=document.querySelector('#unlinkedWarBoostAccounts');if(!root)return;
  const obs=new MutationObserver(repairIdentityAndReloadIfNeeded);
  obs.observe(root,{childList:true,subtree:true});
}
function refresh(){decorateSquads()}
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
  // Repair stale data left by the old empty-array merge behavior before it can survive another session.
  repairIdentityAndReloadIfNeeded();
  const root=document.querySelector('#squadList');
  if(root){
    let queued=false;
    const obs=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh()})});
    obs.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-hero']});
  }
  observeIdentityPanel();
  if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{refresh();observeIdentityPanel();repairIdentityAndReloadIfNeeded()});
  setTimeout(refresh,300);
  setTimeout(refresh,1000);
  setTimeout(repairIdentityAndReloadIfNeeded,1200);
}
export {heroKey,heroFromName,repairContradictoryPendingState};
