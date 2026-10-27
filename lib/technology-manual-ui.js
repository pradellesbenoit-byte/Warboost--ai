import {TECHNOLOGY_KEYS,applyManualTechnology,technologyFingerprint,technologyEntry} from "./technology-manual.js";
import {technologyManualCopy} from "./technology-manual-copy.js";

const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
// Delegation is bound once. Background repaints do not replace a focused input.
// Unsaved changes stay in this controller only and are discarded on account switch.
export function createTechnologyManualUI({root,getState,getLocale,save,getCloudStatus}){
 let owner=null,drafts=new Map(),displayed=new Map(),message=null,lastLocale=null;
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
   if(switched){owner=state.player_id;drafts.clear();displayed.clear();message=null;}
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
     return `<fieldset data-tech-key="${key}"><legend>${escape(copy.names[index])}</legend>
       ${saved?.source==="manual"?`<small>${escape(copy.manual)} · ${escape(saved.confirmed_at)}</small>`:""}
       <label for="${id}">${escape(copy.names[index])}</label>
       <select id="${id}" data-tech-field="state">${["unknown","percent","max","locked"].map((status,i)=>`<option value="${status}"${item.state===status?" selected":""}>${escape(text[i+1])}</option>`).join("")}</select>
       <label for="${id}-percent"${item.state!=="percent"?" hidden":""}>${escape(text[2])} (%)</label>
       <input id="${id}-percent" data-tech-field="percent" type="number" inputmode="decimal" min="0" max="100" step="any" value="${escape(item.percent)}"${item.state!=="percent"?" hidden":""}>
       <label for="${id}-prerequisite"${item.state!=="locked"?" hidden":""}>${escape(text[5])}</label>
       <input id="${id}-prerequisite" data-tech-field="prerequisite" maxlength="180" value="${escape(item.prerequisite)}"${item.state!=="locked"?" hidden":""}>
       <div class="buttonRow"><button type="button" data-tech-action="save">${escape(text[6])}</button><button type="button" data-tech-action="cancel">${escape(text[7])}</button></div></fieldset>`;
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
   begin(key)[field]=event.target.value;message=null;
 });
 root.addEventListener("change",event=>{
   if(event.target.dataset?.techField!=="state")return;
   const key=event.target.closest("[data-tech-key]")?.dataset.techKey;
   if(!key)return;
   begin(key).state=event.target.value;
   // Blur only the state selector to expose its newly applicable fields.
   event.target.blur();render();
 });
 root.addEventListener("click",event=>{
   const action=event.target.closest("[data-tech-action]")?.dataset.techAction;
   const key=event.target.closest("[data-tech-key]")?.dataset.techKey;
   if(!action||!key)return;
   if(action==="cancel"){drafts.delete(key);message=null;event.target.blur();render();return;}
   try{
     const next=applyManualTechnology(getState(),{owner,key,...begin(key)});
     if(!save(next,owner)){message=13;}
     else {drafts.delete(key);message=null;}
   }catch(error){message=error.message==="invalid"?11:12;}
   event.target.blur();render();
 });
 return {render,reset(){owner=null;drafts.clear();displayed.clear();message=null;lastLocale=null;}};
}
