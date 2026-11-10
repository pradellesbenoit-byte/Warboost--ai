// Transient UI only: never read or write profile, authentication or storage.
export function analysisFailureMessage(error,translate){
  // Provider details can contain English diagnostics or echoed user data.
  // Review validation still presents its precise field errors separately.
  return translate(error?.code==="SCAN_REQUEST_TIMEOUT"?"scan_timeout":"scan_error");
}
export function createAnalysisIndicator({inlineTarget=()=>null}={}){
  const active=new Map(),marked=new Map();
  const attr=(node,key)=>node.getAttribute?.(key)??null;
  function restore(node,key,value){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value)}
  function render(){
    const wanted=new Set();
    for(const work of active.values()){
      const targets=work.targets??inlineTarget(work.kind);
      for(const node of (Array.isArray(targets)?targets:[targets]).filter(Boolean)){
        wanted.add(node);
        if(!marked.has(node))marked.set(node,{busy:attr(node,"aria-busy"),live:attr(node,"aria-live")});
        node.setAttribute("data-wb-analysis-active","true");
        node.setAttribute("aria-busy","true");
        node.setAttribute("aria-live","polite");
        // Labels are opt-in. Existing handlers keep ownership of their status copy.
        if(work.label)node.textContent=work.label();
      }
    }
    for(const [node,previous] of marked)if(!wanted.has(node)){
      node.removeAttribute("data-wb-analysis-active");
      restore(node,"aria-busy",previous.busy);restore(node,"aria-live",previous.live);
      marked.delete(node);
    }
  }
  return {
    begin(kind="analysis",options={}){
      const token=Symbol(kind);active.set(token,{kind,...options});render();
      let done=false;
      return ()=>{if(done)return;done=true;active.delete(token);render()};
    },
    cancel(kind){for(const [token,work] of active)if(!kind||work.kind===kind)active.delete(token);render()},
    has(kind){return [...active.values()].some(work=>work.kind===kind)},
    refresh:render,
    get pending(){return active.size}
  };
}

// Used only around an actual asynchronous operation, never around validation/local calculations.
const buttonOwners=new WeakMap();
export function beginLoadingButton(indicator,button,{kind,label,idleLabel}={}){
  if(!button)return indicator.begin(kind);
  const previous=buttonOwners.get(button);
  const disabled=previous?.disabled??button.disabled,original=previous?.original??button.textContent;
  const owner={disabled,original};buttonOwners.set(button,owner);
  button.disabled=true;
  const finish=indicator.begin(kind,{targets:button,label});
  let done=false;
  return ()=>{if(done)return;done=true;finish();if(buttonOwners.get(button)!==owner)return;
    buttonOwners.delete(button);button.disabled=disabled;button.textContent=idleLabel?.()??original};
}
