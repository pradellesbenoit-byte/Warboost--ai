import {TECHNOLOGY_KEYS,applyManualTechnology,technologyFingerprint,technologyEntry} from "./technology-manual.js";
import {technologyManualCopy} from "./technology-manual-copy.js";

const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
export function technologyDisplayDate(entry,locale,timeZone){
 const raw=[entry?.updated_at,entry?.confirmed_at].find(value=>typeof value==="string"&&value.trim()&&Number.isFinite(Date.parse(value)));
 if(typeof raw!=="string"||!raw.trim()||!Number.isFinite(Date.parse(raw)))return "";
 try{
   const lang=String(locale||"en").replaceAll("_","-"),zone=timeZone?{timeZone}:{},date=new Date(raw);
   if(/^fr(?:-|$)/i.test(lang))return `${new Intl.DateTimeFormat(lang,{dateStyle:"short",...zone}).format(date)} à ${new Intl.DateTimeFormat(lang,{timeStyle:"short",...zone}).format(date)}`;
   return new Intl.DateTimeFormat(lang,{dateStyle:"short",timeStyle:"short",...zone}).format(date);
 }catch{return "";}
}
// Delegation is bound once. Background repaints do not replace a focused input.
// Drafts are tab-private, never synced, and removed on account switch/reset.
export function createTechnologyManualUI({root,getState,getLocale,save,getCloudStatus}){
 let owner=null,drafts=new Map(),displayed=new Map(),message=null,lastLocale=null,active=null;
 const view=root.ownerDocument?.defaultView;
 let storage;try{storage=view?.sessionStorage;}catch{/* Browser will warn before unloading. */}
 const storageKey=id=>`warboost:technology-ui-draft:v1:${id}`;
 function persistDrafts(){
   if(!owner)return;
   try{
     if(drafts.size)storage?.setItem(storageKey(owner),JSON.stringify({drafts:[...drafts],active}));
     else storage?.removeItem(storageKey(owner));
   }catch{/* Keep in memory and warn before unloading if browser storage is unavailable. */}
 }
 function restoreDrafts(){
   try{
     const saved=JSON.parse(storage?.getItem(storageKey(owner))||"null");
     for(const [key,value] of saved?.drafts||[]){
       if(TECHNOLOGY_KEYS.includes(key)&&value&&["unknown","percent","max","locked"].includes(value.state)&&typeof value.baseline==="string")
         drafts.set(key,{state:value.state,percent:String(value.percent??"").slice(0,80),prerequisite:String(value.prerequisite||"").slice(0,180),baseline:value.baseline});
     }
     if(TECHNOLOGY_KEYS.includes(saved?.active))active=saved.active;
   }catch{/* An invalid draft is not a saved gameplay value. */}
 }
 view?.addEventListener("beforeunload",event=>{
   if(drafts.size){event.preventDefault();event.returnValue="";}
 });
 const begin=key=>{
   if(!drafts.has(key)){
     const value=displayed.get(key);
     drafts.set(key,{state:value?.state||"unknown",percent:value?.percent??"",prerequisite:value?.prerequisite||"",baseline:technologyFingerprint(value)});
   }
   return drafts.get(key);
 };
 function render(){
   const state=getState(),locale=getLocale(),copy=technologyManualCopy(locale),text=copy.text;
   const switched=owner!==state.player_id;
   if(switched){
     if(owner)try{storage?.removeItem(storageKey(owner));}catch{}
     owner=state.player_id;drafts.clear();displayed.clear();message=null;active=null;restoreDrafts();
   }
   const focused=root.contains(root.ownerDocument?.activeElement);
   if(!switched&&focused&&lastLocale===locale){status();return;}
   const open=!switched&&root.querySelector("details")?.open||false;
   lastLocale=locale;
   root.setAttribute("aria-label",text[0]);
   root.innerHTML=`<details${open?" open":""} dir="${copy.dir}"><summary>🔬 ${escape(text[0])}</summary>
   <div class="technologyManualGrid">${TECHNOLOGY_KEYS.map((key,index)=>{
     const saved=technologyEntry(state,key),draft=drafts.get(key);
     displayed.set(key,saved?{...saved}:undefined);
     const item=draft||{state:saved?.state||"unknown",percent:saved?.percent??"",prerequisite:saved?.prerequisite||""};
     const id=`technology-manual-${key}`;
     const expanded=active===key,date=technologyDisplayDate(saved,locale);
     const value=saved?.state==="percent"?`${new Intl.NumberFormat(locale.replaceAll("_","-")).format(saved.percent)} %`:text[{max:3,locked:4}[saved?.state]||1];
     const source=saved?.source==="manual"?copy.manual:["scan","ocr","vision"].includes(saved?.source)?copy.scan:"";
     return `<div class="technologyManualRow" data-tech-key="${key}">
       <button type="button" class="technologyManualSummary" data-tech-action="toggle" aria-expanded="${expanded}" aria-controls="${id}-editor">
         <span class="technologyManualName">${escape(copy.names[index])}</span><span>${escape(value)}</span>
         ${date?`<small>${escape(source?`${source} · ${date}`:date)}</small>`:""}
         ${draft?`<small class="technologyManualDraft">${escape(copy.draft)}</small>`:""}
         <span class="technologyManualChevron" aria-hidden="true">${expanded?"⌃":"⌄"}</span>
       </button>
       ${expanded?`<fieldset id="${id}-editor" aria-label="${escape(copy.names[index])}">
       <select aria-label="${escape(text[0])}" id="${id}" data-tech-field="state">${["unknown","percent","max","locked"].map((status,i)=>`<option value="${status}"${item.state===status?" selected":""}>${escape(text[i+1])}</option>`).join("")}</select>
       <label for="${id}-percent"${item.state!=="percent"?" hidden":""}>${escape(text[2])} (%)</label>
       <input id="${id}-percent" data-tech-field="percent" type="number" inputmode="decimal" min="0" max="100" step="any" value="${escape(item.percent)}"${item.state!=="percent"?" hidden":""}>
       <label for="${id}-prerequisite"${item.state!=="locked"?" hidden":""}>${escape(text[5])}</label>
       <input id="${id}-prerequisite" data-tech-field="prerequisite" maxlength="180" value="${escape(item.prerequisite)}"${item.state!=="locked"?" hidden":""}>
       <div class="buttonRow"><button type="button" data-tech-action="save">${escape(text[6])}</button><button type="button" data-tech-action="cancel">${escape(text[7])}</button></div></fieldset>`:""}</div>`;
   }).join("")}</div><p role="status" aria-live="polite" data-tech-status></p></details>`;
   status();
 }
 function status(){
   const node=root.querySelector("[data-tech-status]");if(!node)return;
   const text=technologyManualCopy(getLocale()).text;
   const sync=getCloudStatus();
   const hasSaved=TECHNOLOGY_KEYS.some(key=>technologyEntry(getState(),key));
   node.textContent=message!==null?text[message]:!hasSaved?"":sync==="confirmed"?text[9]:`${text[8]} · ${text[10]}`;
 }
 root.addEventListener("input",event=>{
   const field=event.target.dataset?.techField,key=event.target.closest("[data-tech-key]")?.dataset.techKey;
   if(!field||!key)return;
   begin(key)[field]=event.target.value;active=key;message=null;persistDrafts();
 });
 root.addEventListener("change",event=>{
   if(event.target.dataset?.techField!=="state")return;
   const key=event.target.closest("[data-tech-key]")?.dataset.techKey;
   if(!key)return;
   begin(key).state=event.target.value;
   active=key;persistDrafts();
   // Blur only the state selector to expose its newly applicable fields.
   event.target.blur();render();
 });
 root.addEventListener("click",event=>{
   const action=event.target.closest("[data-tech-action]")?.dataset.techAction;
   const key=event.target.closest("[data-tech-key]")?.dataset.techKey;
   if(!action||!key)return;
   if(action==="toggle"){
     active=active===key?null:key;persistDrafts();event.target.blur();render();
     root.querySelector(`[data-tech-key="${key}"] [data-tech-action="toggle"]`)?.focus?.();return;
   }
   if(action==="cancel"){drafts.delete(key);active=null;persistDrafts();message=null;event.target.blur();render();return;}
   if(action!=="save")return;
   try{
     const next=applyManualTechnology(getState(),{owner,key,...begin(key)});
     if(!save(next,owner)){message=13;}
     else {drafts.delete(key);active=null;persistDrafts();message=null;}
   }catch(error){message=error.message==="invalid"?11:12;}
   event.target.blur();render();
 });
 return {render,reset(){if(owner)try{storage?.removeItem(storageKey(owner));}catch{}owner=null;drafts.clear();displayed.clear();message=null;lastLocale=null;active=null;}};
}
