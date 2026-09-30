export const LOADING_ARTWORK_PATH="/assets/warboost-loading-scene.webp";
export const LOADING_MIN_VISIBLE_MS=0;

const MODE_KEYS={
  open:"loading_open_title",
  resume:"loading_resume_title",
  update:"loading_update_title"
};
const STAGE_KEYS={
  profile:"loading_stage_profile",
  session:"loading_stage_session",
  cloud:"loading_stage_cloud",
  alliance:"loading_stage_alliance",
  scans:"loading_stage_scans",
  version:"loading_stage_version",
  offline:"loading_stage_error",
  expired:"loading_stage_expired"
};

export function createLoadingScreenController({
  documentRef=globalThis.document,
  windowRef=globalThis.window,
  translate=key=>key,
  now=()=>Date.now(),
  setTimeoutFn=(fn,delay)=>setTimeout(fn,delay),
  minVisibleMs=LOADING_MIN_VISIBLE_MS
}={}){
  const screen=documentRef?.getElementById?.("loadingScreen")||null;
  const app=documentRef?.getElementById?.("appContent")||null;
  const title=documentRef?.getElementById?.("loadingTitle")||null;
  const context=documentRef?.getElementById?.("loadingContext")||null;
  const stageLabel=documentRef?.getElementById?.("loadingStage")||null;
  const retry=documentRef?.getElementById?.("loadingRetry")||null;
  const backgroundElements=[app,...(documentRef?.querySelectorAll?.(".drawer")||[]),documentRef?.getElementById?.("backdrop")].filter(Boolean);
  const backgroundState=new Map();
  let visible=Boolean(screen&&!screen.classList?.contains?.("hidden"));
  let visibleSince=visible?now():null;
  let generation=0,mode="open",stage="profile",retryVisible=false,previousFocus=null,pageScrollPosition=null;

  function focusLoadingScreen(){
    const active=documentRef?.activeElement;
    if(active&&active!==screen&&!screen?.contains?.(active))previousFocus=active;
    try{screen?.focus?.({preventScroll:true})}catch{try{screen?.focus?.()}catch{}}
  }
  function restoreFocus(){
    const target=previousFocus;previousFocus=null;
    if(!target||target.isConnected===false||target.disabled)return;
    try{target.focus?.({preventScroll:true})}catch{try{target.focus?.()}catch{}}
  }

  function render(){
    if(title)title.textContent=translate(MODE_KEYS[mode]||MODE_KEYS.open);
    if(context)context.textContent=translate("loading_context");
    if(stageLabel)stageLabel.textContent=translate(STAGE_KEYS[stage]||STAGE_KEYS.profile);
    if(screen){
      screen.dataset.loadingMode=mode;
      screen.dataset.loadingStage=stage;
      screen.setAttribute("aria-label",translate(MODE_KEYS[mode]||MODE_KEYS.open));
    }
    if(retry){
      retry.textContent=translate(stage==="expired"?"loading_sign_in":"loading_continue");
      retry.classList.toggle("hidden",!retryVisible);
    }
  }

  function setVisible(next){
    if(next&&backgroundState.size===0)pageScrollPosition={x:windowRef?.scrollX||0,y:windowRef?.scrollY||0};
    if(screen){
      screen.classList.toggle("hidden",!next);
      screen.setAttribute("aria-hidden",String(!next));
    }
    documentRef?.body?.classList?.toggle?.("loading-active",next);
    if(next){
      for(const element of backgroundElements){
        if(!backgroundState.has(element))backgroundState.set(element,{
          inert:element.hasAttribute("inert")?element.getAttribute("inert"):null,
          ariaHidden:element.hasAttribute("aria-hidden")?element.getAttribute("aria-hidden"):null
        });
        element.setAttribute("inert","");element.setAttribute("aria-hidden","true");
      }
    }else{
      for(const [element,previous] of backgroundState){
        if(previous.inert===null)element.removeAttribute("inert");else element.setAttribute("inert",previous.inert);
        if(previous.ariaHidden===null)element.removeAttribute("aria-hidden");else element.setAttribute("aria-hidden",previous.ariaHidden);
      }
      backgroundState.clear();
      if(pageScrollPosition){
        try{windowRef?.scrollTo?.(pageScrollPosition.x,pageScrollPosition.y)}catch{}
        pageScrollPosition=null;
      }
    }
  }

  function show(nextMode="open",nextStage="profile"){
    if(!visible)visibleSince=now();
    visible=true;generation++;
    mode=Object.hasOwn(MODE_KEYS,nextMode)?nextMode:"open";
    stage=Object.hasOwn(STAGE_KEYS,nextStage)?nextStage:"profile";
    retryVisible=false;
    setVisible(true);focusLoadingScreen();render();
    return true;
  }

  function setMode(nextMode){
    mode=Object.hasOwn(MODE_KEYS,nextMode)?nextMode:"open";
    render();
  }

  function setStage(nextStage){
    stage=Object.hasOwn(STAGE_KEYS,nextStage)?nextStage:"profile";
    if(stage!=="offline"&&stage!=="expired")retryVisible=false;
    render();
  }

  function setRetryVisible(next=true){
    retryVisible=Boolean(next);render();
  }

  async function hide(){
    if(!visible)return false;
    const currentGeneration=generation;
    const remaining=Math.max(0,minVisibleMs-(now()-(visibleSince??now())));
    if(remaining)await new Promise(resolve=>setTimeoutFn(resolve,remaining));
    if(generation!==currentGeneration||!visible)return false;
    visible=false;visibleSince=null;retryVisible=false;
    setVisible(false);restoreFocus();render();
    return true;
  }

  if(visible){setVisible(true);focusLoadingScreen()}
  render();
  return {show,setMode,setStage,setRetryVisible,hide,isVisible:()=>visible,getState:()=>({visible,mode,stage,retryVisible})};
}

export async function revealExactLoadingArtwork({
  imageElement,
  fetchImpl=globalThis.fetch,
  path=LOADING_ARTWORK_PATH
}={}){
  if(!imageElement||typeof fetchImpl!=="function")return false;
  imageElement.hidden=true;
  imageElement.removeAttribute?.("src");
  try{
    const response=await fetchImpl(path,{method:"HEAD",cache:"force-cache"});
    const contentType=String(response?.headers?.get?.("content-type")||"").toLowerCase();
    if(!response?.ok||!contentType.startsWith("image/"))return false;
    imageElement.src=path;
    if(typeof imageElement.decode==="function")await imageElement.decode();
    imageElement.hidden=false;
    return true;
  }catch{
    imageElement.hidden=true;
    imageElement.removeAttribute?.("src");
    return false;
  }
}