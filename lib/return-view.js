export const RETURN_VIEW_STORAGE_KEY="warboost-return-view-v1";

const DRAWERS=new Set(["account","player","alliance","vs","season","qg35Coach","scan","support"]);
const PRIVATE_DRAWERS=new Set(["player","alliance","vs","season","qg35Coach","scan","support"]);

function safeStorageCall(storage,method,...args){
  try{return storage?.[method]?.(...args)}catch{return null}
}
function scrollValue(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.min(1_000_000,number)):0;
}

export function normalizeReturnView(value={}){
  const drawer=DRAWERS.has(String(value?.drawer||""))?String(value.drawer):null;
  return {drawer,pageX:scrollValue(value?.pageX),pageY:scrollValue(value?.pageY),drawerY:scrollValue(value?.drawerY)};
}

export function createReturnViewController({
  documentRef=globalThis.document,
  windowRef=globalThis.window,
  storage=(()=>{try{return globalThis.sessionStorage}catch{return null}})(),
  openDrawer=()=>{},
  canRestorePrivateData=()=>false,
  persistAcrossReload=true,
  requestFrame=fn=>(globalThis.requestAnimationFrame||setTimeout)(fn)
}={}){
  let sessionView=null;
  if(!persistAcrossReload)safeStorageCall(storage,"removeItem",RETURN_VIEW_STORAGE_KEY);
  function write(view){
    const normalized=normalizeReturnView(view);
    sessionView=normalized;
    if(persistAcrossReload)safeStorageCall(storage,"setItem",RETURN_VIEW_STORAGE_KEY,JSON.stringify(normalized));
    return normalized;
  }
  function remember(drawer=null){
    const node=drawer?documentRef?.getElementById?.(`${drawer}Drawer`):null;
    return write({
      drawer,
      pageX:windowRef?.scrollX,
      pageY:windowRef?.scrollY,
      drawerY:node?.scrollTop
    });
  }
  function capture(){
    const drawers=[...(documentRef?.querySelectorAll?.(".drawer.open")||[])];
    const node=drawers.at(-1)||null;
    const drawer=String(node?.id||"").match(/^(.+)Drawer$/)?.[1]||null;
    return write({
      drawer,
      pageX:windowRef?.scrollX,
      pageY:windowRef?.scrollY,
      drawerY:node?.scrollTop
    });
  }
  function read(){
    if(!persistAcrossReload)return sessionView;
    try{
      const raw=safeStorageCall(storage,"getItem",RETURN_VIEW_STORAGE_KEY);
      return raw?normalizeReturnView(JSON.parse(raw)):null;
    }catch{return null}
  }
  function restore(){
    const view=read();
    if(!view)return {ok:false,reason:"no-saved-view"};
    if(view.drawer&&PRIVATE_DRAWERS.has(view.drawer)&&!canRestorePrivateData())return {ok:false,reason:"private-data-not-ready"};
    if(view.drawer)openDrawer(view.drawer);
    try{windowRef?.scrollTo?.(view.pageX,view.pageY)}catch{}
    requestFrame(()=>{
      if(!view.drawer)return;
      const node=documentRef?.getElementById?.(`${view.drawer}Drawer`);
      if(node)node.scrollTop=view.drawerY;
    });
    safeStorageCall(storage,"removeItem",RETURN_VIEW_STORAGE_KEY);
    return {ok:true,view};
  }
  function clear(){sessionView=null;safeStorageCall(storage,"removeItem",RETURN_VIEW_STORAGE_KEY)}
  return {remember,capture,read,restore,clear};
}