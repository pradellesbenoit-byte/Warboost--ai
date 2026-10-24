const STORAGE_KEY="warboost:diagnostic-disclosures";
const SELECTOR="details[data-pro-disclosure]";

/** Only presentation preferences; never profile or diagnostic data. */
export function createDiagnosticDisclosures({root,storage}={}){
  const state={diagnostic:true,shop:false};
  const getStorage=()=>{
    try{return storage===undefined?root?.defaultView?.sessionStorage:storage}catch{return null}
  };
  try{
    const saved=JSON.parse(getStorage()?.getItem(STORAGE_KEY)||"null");
    for(const key of Object.keys(state))if(typeof saved?.[key]==="boolean")state[key]=saved[key];
  }catch{/* Disclosure controls must also work with storage disabled. */}
  const persist=()=>{try{getStorage()?.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}};
  const nodes=scope=>Array.from((scope||root)?.querySelectorAll?.(SELECTOR)||[]);
  const keyFor=element=>element?.getAttribute?.("data-pro-disclosure");
  const capture=(scope=root)=>{
    for(const element of nodes(scope)){
      const key=keyFor(element);
      if(Object.hasOwn(state,key))state[key]=Boolean(element.open);
    }
    persist();
  };
  const restore=(scope=root)=>{
    for(const element of nodes(scope)){
      const key=keyFor(element);
      if(Object.hasOwn(state,key))element.open=state[key];
    }
  };
  // Native toggle does not bubble: capture also handles newly rendered shop details.
  const onToggle=event=>{
    const element=event.target,key=keyFor(element);
    if(!Object.hasOwn(state,key)||root?.contains&&!root.contains(element))return;
    state[key]=Boolean(element.open);persist();
  };
  root?.addEventListener?.("toggle",onToggle,true);
  restore();
  return {capture,restore,destroy(){root?.removeEventListener?.("toggle",onToggle,true)}};
}