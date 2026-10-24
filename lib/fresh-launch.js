// A navigation/reload is a new UI session; visibility/focus alone is not.
// In particular, switching to the camera/gallery must not discard its result.
export function createFreshLaunchController({
  windowRef=globalThis.window,documentRef=globalThis.document,
  resetTemporary=()=>{},closeTemporary=()=>{},clearReturnView=()=>{},
  clearCaptures=()=>{},clearLegacyCaptures=async()=>true
}={}){
  let started=false;
  function reset(){
    clearReturnView();
    clearCaptures();
    resetTemporary();
    closeTemporary();
    for(const input of documentRef?.querySelectorAll?.('input[type="file"]')||[])try{input.value=""}catch{}
    for(const dialog of documentRef?.querySelectorAll?.("dialog[open]")||[])try{dialog.close()}catch{}
    try{windowRef?.scrollTo?.(0,0)}catch{}
  }
  function start(){
    if(started)return;
    started=true;
    try{if(windowRef?.history)windowRef.history.scrollRestoration="manual"}catch{}
    reset();
    // Cleanup is best-effort and cannot block startup; old captures are never read.
    void Promise.resolve(clearLegacyCaptures()).catch(()=>{});
    windowRef?.addEventListener?.("pagehide",reset);
    windowRef?.addEventListener?.("pageshow",reset);
  }
  function stop(){
    windowRef?.removeEventListener?.("pagehide",reset);
    windowRef?.removeEventListener?.("pageshow",reset);
    started=false;
  }
  return {start,stop,reset};
}
