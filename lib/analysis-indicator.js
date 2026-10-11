// Transient UI only: never read or write profile, authentication or storage.
export function analysisFailureMessage(error,translate){
  // Provider details can contain English diagnostics or echoed user data.
  // Review validation still presents its precise field errors separately.
  return translate(error?.code==="SCAN_REQUEST_TIMEOUT"?"scan_timeout":"scan_error");
}
export function createAnalysisIndicator({document:doc=globalThis.document,message=()=>"WarBoost is analysing…",inlineTarget=()=>null}={}){
  const active=new Map();
  let element,text,previousInline;
  function render(){
    if(!doc?.body)return;
    const target=inlineTarget(),scanActive=[...active.values()].includes("scan");
    if(previousInline&&previousInline!==target)previousInline.removeAttribute("data-wb-analysis-active");
    if(target){
      if(scanActive)target.setAttribute("data-wb-analysis-active","true");
      else target.removeAttribute("data-wb-analysis-active");
    }
    previousInline=target;
    if(!element){
      element=doc.createElement("div");element.className="wb-analysis-indicator";
      element.setAttribute("role","status");element.setAttribute("aria-live","polite");
      element.setAttribute("aria-atomic","true");
      const mark=doc.createElement("span");mark.className="wb-analysis-mark";
      mark.textContent="W";mark.setAttribute("aria-hidden","true");
      text=doc.createElement("span");text.className="wb-analysis-message";
      element.append(mark,text);doc.body.append(element);
    }
    element.hidden=active.size===0||Boolean(scanActive&&target);
    text.textContent=active.size?message():"";
  }
  return {
    begin(kind="analysis"){
      const token=Symbol(kind);active.set(token,kind);render();
      let done=false;
      return ()=>{if(done)return;done=true;active.delete(token);render()};
    },
    cancel(kind){for(const [token,value] of active)if(!kind||value===kind)active.delete(token);render()},
    refresh:render,
    get pending(){return active.size}
  };
}
