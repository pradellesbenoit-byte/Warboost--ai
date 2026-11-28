import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {LANGUAGES,translator} from "../i18n.js";
import {normalizeState} from "../lib/normalize.js";
import {
  PROFILE_AVATAR_DATA_URL_MAX_LENGTH,
  PROFILE_AVATAR_CROP_MIN_SIDE,
  mergeProfileAvatar,
  normalizeProfileAvatarDataUrl,
  profileStateWithoutAvatar,
  removeProfileAvatar,
  squareAvatarSelection,
  validateProfileAvatarSelection
} from "../lib/profile-avatar.js";
import {createProfileAvatarCropper} from "../lib/profile-avatar-cropper.js";

let passed=0;
function check(name,run){run();passed++;console.log(`PASS ${name}`)}
const photo=`data:image/jpeg;base64,/9j/${"A".repeat(96)}`;
const oldAt="2026-11-27T10:00:00.000Z",newAt="2026-11-28T10:00:00.000Z";

check("accept bounded JPEG data URI",()=>assert.equal(normalizeProfileAvatarDataUrl(photo),photo));
check("reject image formats other than JPEG",()=>assert.equal(normalizeProfileAvatarDataUrl("data:image/png;base64,iVBORw0KGgo="),null));
check("reject non-JPEG bytes labelled JPEG",()=>assert.equal(normalizeProfileAvatarDataUrl("data:image/jpeg;base64,AAAA"),null));
check("reject malformed base64",()=>assert.equal(normalizeProfileAvatarDataUrl("data:image/jpeg;base64,/9j/abc!"),null));
check("reject avatar above 24,000 characters",()=>assert.equal(normalizeProfileAvatarDataUrl(`data:image/jpeg;base64,/9j/${"A".repeat(PROFILE_AVATAR_DATA_URL_MAX_LENGTH)}`),null));
check("reject empty avatar",()=>assert.equal(normalizeProfileAvatarDataUrl(""),null));

check("create a square crop within bounds",()=>{
  const crop=squareAvatarSelection(10,20,90,110,150,180);
  assert.deepEqual(crop,{x:10,y:20,size:80});assert.equal(crop.size,Math.abs(crop.size));
});
check("support reverse drag direction",()=>{
  const crop=squareAvatarSelection(120,140,40,60,160,180);
  assert.deepEqual(crop,{x:40,y:60,size:80});
});
check("clamp drag endpoint to capture edges",()=>{
  const crop=squareAvatarSelection(95,95,180,180,120,120);
  assert.deepEqual(crop,{x:95,y:95,size:25});
});
check("reject crop smaller than minimum",()=>assert.equal(squareAvatarSelection(2,2,18,18,200,200),null));
check("reject invalid capture dimensions",()=>assert.equal(squareAvatarSelection(0,0,50,50,0,100),null));

check("newer explicit removal beats stale cloud photo",()=>{
  const merged=mergeProfileAvatar({profile_avatar_data_url:null,profile_avatar_updated_at:newAt},
    {profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt});
  assert.equal(merged.profile_avatar_data_url,null);assert.equal(merged.profile_avatar_updated_at,newAt);
});
check("newer confirmed photo beats older removal",()=>{
  assert.equal(mergeProfileAvatar({profile_avatar_data_url:null,profile_avatar_updated_at:oldAt},
    {profile_avatar_data_url:photo,profile_avatar_updated_at:newAt}).profile_avatar_data_url,photo);
});
check("newer removal is retained through same-account restore",()=>{
  assert.equal(mergeProfileAvatar({profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt},
    {profile_avatar_data_url:null,profile_avatar_updated_at:newAt}).profile_avatar_data_url,null);
});
check("untimestamped null cannot erase a saved photo",()=>{
  assert.equal(mergeProfileAvatar({profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt},
    {profile_avatar_data_url:null,profile_avatar_updated_at:null}).profile_avatar_data_url,photo);
});
check("removal writes a dated null tombstone",()=>{
  const removed=removeProfileAvatar({name:"Player",profile_avatar_data_url:photo},newAt);
  assert.equal(removed.profile_avatar_data_url,null);assert.equal(removed.profile_avatar_updated_at,newAt);
  assert.equal(removed.updated_at,newAt);assert.equal(removed.name,"Player");
});

check("strip avatar bytes from snapshots without mutating profile",()=>{
  const source={player:{name:"Player",profile_avatar_data_url:photo,profile_avatar_updated_at:newAt}};
  const stripped=profileStateWithoutAvatar(source);
  assert.equal(stripped.player.profile_avatar_data_url,undefined);
  assert.equal(stripped.player.profile_avatar_updated_at,newAt);
  assert.equal(source.player.profile_avatar_data_url,photo);
});
check("normalize and restore avatar in the authenticated profile JSON",()=>{
  const normalized=normalizeState({player_id:"account-a",player:{name:"Player",profile_avatar_data_url:photo,profile_avatar_updated_at:newAt}});
  const restored=normalizeState(JSON.parse(JSON.stringify(normalized)));
  assert.equal(restored.player_id,"account-a");assert.equal(restored.player.profile_avatar_data_url,photo);
});
check("discard invalid avatar during profile normalization",()=>{
  const normalized=normalizeState({player:{profile_avatar_data_url:"https://example.test/photo.jpg"}});
  assert.equal(normalized.player.profile_avatar_data_url,null);
});

const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const markup=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const apiState=fs.readFileSync(new URL("../api/state.js",import.meta.url),"utf8");
const cropper=fs.readFileSync(new URL("../lib/profile-avatar-cropper.js",import.meta.url),"utf8");
check("only profile scan offers manual crop of selected capture",()=>{
  assert.match(app,/draft\.type==="profile"&&scanImageData&&draft\.owner===pendingScanOwner\(\)/);
  assert.match(app,/profileAvatarCropper\?\.setCapture\(scanImageData,draft\.owner,draft\.request\?\.revision\)/);
  assert.match(markup,/id="profileAvatarCropCanvas"/);
  assert.match(cropper,/target\.width=128;target\.height=128/);
  assert.match(cropper,/target\.toDataURL\("image\/jpeg",quality\)/);
});
check("separate photo consent and scan confirmation are both required",()=>{
  assert.match(app,/onUse:\s*selection\s*=>/);
  assert.match(app,/validateProfileAvatarSelection\(\{selection,draft,userId,stateOwnerId:state\?\.player_id,requestIsCurrent\}\)/);
  assert.match(app,/pendingProfileAvatar=result\.pending;\s*return \{ok:true\}/);
  assert.match(app,/pendingProfileAvatar\.revision===draft\.request\?\.revision/);
  assert.match(cropper,/result===true\|\|result\?\.ok===true/);
  assert.match(app,/reviewed\.player=\{\.\.\.\(reviewed\.player\|\|\{\}\),profile_avatar_data_url:avatar/);
  assert.match(markup,/id="profileAvatarUseBtn"[^>]*disabled/);
});
check("profile avatar is rendered only for the authenticated profile owner",()=>{
  assert.match(app,/String\(state\?\.player_id\|\|"\"\)===owner/);
  assert.match(app,/profile_avatar_data_url\):null/);
  assert.match(markup,/id="playerHomeAvatarFallback"[^>]*>👤/);
});
check("remove action is owner-scoped and saves a timestamped tombstone",()=>{
  assert.match(app,/#playerAvatarRemoveBtn"\)\?\.addEventListener\("click",async\(\)=>/);
  assert.match(app,/String\(state\?\.player_id\|\|"\"\)!==userId/);
  assert.match(app,/state\.player=removeProfileAvatar\(state\.player,removedAt\)/);
  assert.match(app,/saveState\(\);\s*const result=await pushServerState\(\{userRequested:true\}\)/);
});
check("logout and account changes clear avatar memory and visible private metadata",()=>{
  assert.match(app,/function clearActiveProfileAvatarFromMemory\(\)[\s\S]*?state\.player\.profile_avatar_data_url=null/);
  assert.match(app,/if\(previousUserId!==nextUserId\)\{[\s\S]*?clearActiveProfileAvatarFromMemory\(\)/);
  assert.match(app,/rememberAccountState\(signedOutUserId,state\);\s*clearActiveProfileAvatarFromMemory\(\)/);
  assert.match(app,/clearActiveProfileAvatarFromMemory\(\);\s*clearSignedOutAuthUi\(\)/);
});
check("same-account local cache merges avatar by owner and timestamp",()=>{
  assert.match(app,/cached=readAccountState\(id\)/);
  assert.match(app,/Object\.assign\(chosen\.player,mergeProfileAvatar\(current\.player,cached\.player\)\)/);
  assert.match(app,/return parsed&&String\(parsed\.player_id\|\|""\)===String\(userId\)\?parsed:null/);
});
check("API requires authenticated consent and keeps snapshots avatar-free",()=>{
  assert.match(apiState,/requireProductUser\(req,\{consent:true,trace\}\)/);
  assert.match(apiState,/snapshotOwn=\(state,source\)=>\{const safeState=profileStateWithoutAvatar\(state\)/);
});
check("home alliance uses only this profile's name, real tag fallback, or confirmation",()=>{
  const render=app.slice(app.indexOf("function renderHomeAllianceMeta("),app.indexOf("function renderPlayerCoreSummary("));
  assert.match(render,/a\?\.name/);assert.match(render,/a\?\.tag/);assert.match(render,/name\.textContent=displayName\|\|"🛡️"/);
  assert.match(render,/el\.textContent=displayName\?normalizedRole\(p\?\.role\):t\("alliance_needs_confirmation"\)/);
  assert.match(markup,/data-open="alliance"/);
  assert.match(markup,/id="allianceHomeName"/);
  assert.match(fs.readFileSync(new URL("../warboost-color-theme.css",import.meta.url),"utf8"),/-webkit-line-clamp:2/);
});
check("alliance tile dynamically shows name or tag and preserves rank",()=>{
  const begin=app.indexOf("function renderHomeAllianceMeta("),end=app.indexOf("\nfunction renderPlayerCoreSummary(",begin);
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",title:"",attrs:{},setAttribute(key,value){this.attrs[key]=value}});return nodes.get(id)};
  const context=vm.createContext({$:selector=>node(selector),t:key=>key,normalizedRole:role=>String(role||"R1")});
  vm.runInContext(app.slice(begin,end),context);
  context.renderHomeAllianceMeta({role:"R4"},{name:"ALL FOR 1",tag:"AF1"});
  assert.equal(node("#allianceHomeName").textContent,"ALL FOR 1");assert.equal(node("#allianceHomeIcon").title,"ALL FOR 1");
  assert.equal(node("#allianceMeta").textContent,"R4");
  context.renderHomeAllianceMeta({role:"R5"},{name:"",tag:"AF1"});
  assert.equal(node("#allianceHomeName").textContent,"AF1");assert.equal(node("#allianceMeta").textContent,"R5");
  context.renderHomeAllianceMeta({role:"R4"},{name:"",tag:""});
  assert.equal(node("#allianceHomeName").textContent,"🛡️");assert.equal(node("#allianceMeta").textContent,"alliance_needs_confirmation");
});
check("logout masks the alliance name and restores the neutral icon",()=>{
  const begin=app.indexOf("function maskHomePrivateMeta("),end=app.indexOf("\nfunction render(){",begin);
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"private",title:"private",attrs:{},classList:{add(){},remove(){}},removeAttribute(){},setAttribute(key,value){this.attrs[key]=value}});return nodes.get(id)};
  const context=vm.createContext({$:selector=>node(selector),t:key=>key,clearHomePlayerAvatar(){}});
  vm.runInContext(app.slice(begin,end),context);context.maskHomePrivateMeta();
  assert.equal(node("#allianceHomeName").textContent,"🛡️");
  assert.equal(node("#allianceHomeIcon").title,"");
  assert.equal(node("#allianceHomeIcon").attrs["aria-label"],"alliance_needs_confirmation");
  assert.equal(node("#allianceMeta").textContent,"—");
});
check("authenticated owner sees the saved avatar and signout masks private home data",()=>{
  const begin=app.indexOf("function clearHomePlayerAvatar("),end=app.indexOf("\nfunction renderHomeAllianceMeta(",begin);
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:"",title:"",src:"",attrs:{},classList:{values:new Set(),add(value){this.values.add(value)},remove(value){this.values.delete(value)},toggle(value,on){on?this.values.add(value):this.values.delete(value)}},removeAttribute(key){delete this.attrs[key];if(key==="src")this.src=""},getAttribute(key){return key==="src"?(this.src||null):this.attrs[key]||null},setAttribute(key,value){this.attrs[key]=value}});
    return nodes.get(id);
  };
  const context=vm.createContext({$:selector=>node(selector),t:key=>key,normalizeProfileAvatarDataUrl,
    state:{player_id:"account-a"},cloudSession:{user:{id:"account-a"}}});
  vm.runInContext(app.slice(begin,end),context);
  context.renderHomePlayerMeta({name:"les gladiateurs81",hq_level:31,profile_avatar_data_url:photo});
  assert.equal(node("#playerHomeAvatar").src,photo);assert.equal(node("#playerHomeName").textContent,"les gladiateurs81");
  context.cloudSession={user:{id:"account-b"}};
  context.renderHomePlayerMeta({name:"les gladiateurs81",profile_avatar_data_url:photo});
  assert.equal(node("#playerHomeAvatar").src,"");
  const maskBegin=app.indexOf("function maskHomePrivateMeta("),maskEnd=app.indexOf("\nfunction render(){",maskBegin);
  vm.runInContext(app.slice(maskBegin,maskEnd),context);context.maskHomePrivateMeta();
  assert.equal(node("#playerHomeAvatar").src,"");assert.equal(node("#playerHomeName").textContent,"");
  assert.equal(node("#playerMeta").textContent,"to_connect");
});
check("all avatar and alliance labels exist in every supported language",()=>{
  const keys=["profile_avatar_offer","profile_avatar_capture_hint","profile_avatar_instructions","profile_avatar_preview","profile_avatar_use","profile_avatar_remove","profile_avatar_size_error","profile_avatar_panel_label","profile_avatar_canvas_label","profile_avatar_ready","profile_avatar_unavailable","profile_avatar_removal_synced","profile_avatar_removal_pending","alliance_needs_confirmation"];
  const languages=LANGUAGES.filter(([code])=>code!=="auto").map(([code])=>code);
  assert.equal(languages.length,23);
  for(const code of languages){const t=translator(code);for(const key of keys)assert.notEqual(t(key),key,`${code}:${key}`)}
});

async function asyncCheck(name,run){await run();passed++;console.log(`PASS ${name}`)}
await asyncCheck("remove button persists only for its authenticated owner and confirms cloud result",async()=>{
  const begin=app.indexOf('$("#playerAvatarRemoveBtn")?.addEventListener("click",async()=>{');
  const end=app.indexOf('\n$("#logoutBtn")',begin);
  assert.ok(begin>=0&&end>begin);
  const nodes=new Map(),saved={called:false},sync={called:false,userRequested:false};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",className:"",hidden:true,classList:{add(){},remove(){}},addEventListener(_event,callback){this.callback=callback}});return nodes.get(id)};
  const context=vm.createContext({
    state:{player_id:"owner-a",player:{name:"A",profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}},
    cloudSession:{user:{id:"owner-a"}},normalizeProfileAvatarDataUrl,removeProfileAvatar,
    $:selector=>node(selector),t:key=>key,
    saveState(){saved.called=true;return true},
    async pushServerState(options){sync.called=true;sync.userRequested=options.userRequested;return {ok:true}}
  });
  vm.runInContext(app.slice(begin,end),context);
  await node("#playerAvatarRemoveBtn").callback();
  assert.equal(context.state.player.profile_avatar_data_url,null);
  assert.equal(context.state.player.profile_avatar_updated_at>oldAt,true);
  assert.equal(saved.called,true);assert.equal(sync.called,true);assert.equal(sync.userRequested,true);
  assert.match(node("#playerAvatarRemovalStatus").textContent,/profile_avatar_removal_synced/);
});
await asyncCheck("failed cloud removal stays a local tombstone and reports pending sync",async()=>{
  const begin=app.indexOf('$("#playerAvatarRemoveBtn")?.addEventListener("click",async()=>{');
  const end=app.indexOf('\n$("#logoutBtn")',begin);
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",className:"",classList:{add(){},remove(){}},addEventListener(_event,callback){this.callback=callback}});return nodes.get(id)};
  const context=vm.createContext({
    state:{player_id:"owner-a",player:{profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}},
    cloudSession:{user:{id:"owner-a"}},normalizeProfileAvatarDataUrl,removeProfileAvatar,$:selector=>node(selector),t:key=>key,
    saveState:()=>true,async pushServerState(){return {ok:false,error:"network"}}
  });
  vm.runInContext(app.slice(begin,end),context);await node("#playerAvatarRemoveBtn").callback();
  assert.equal(context.state.player.profile_avatar_data_url,null);
  assert.match(node("#playerAvatarRemovalStatus").textContent,/profile_avatar_removal_pending/);
});
await asyncCheck("another account cannot remove or receive the previous account avatar",async()=>{
  const begin=app.indexOf('$("#playerAvatarRemoveBtn")?.addEventListener("click",async()=>{');
  const end=app.indexOf('\n$("#logoutBtn")',begin);
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:"",className:"",classList:{add(){},remove(){}},addEventListener(_event,callback){this.callback=callback}});return nodes.get(id)};
  let saved=false,network=false;
  const context=vm.createContext({
    state:{player_id:"owner-b",player:{profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}},
    cloudSession:{user:{id:"owner-a"}},normalizeProfileAvatarDataUrl,removeProfileAvatar,$:selector=>node(selector),t:key=>key,
    saveState:()=>{saved=true},async pushServerState(){network=true;return {ok:true}}
  });
  vm.runInContext(app.slice(begin,end),context);await node("#playerAvatarRemoveBtn").callback();
  assert.equal(context.state.player.profile_avatar_data_url,photo);assert.equal(saved,false);assert.equal(network,false);
});
await asyncCheck("re-auth restores cached photo for the same owner but not another owner",async()=>{
  const begin=app.indexOf("function safestLoginSeed("),end=app.indexOf("\nfunction readLegacyJson(",begin);
  const cache=new Map([
    ["owner-a",{player_id:"owner-a",updated_at:oldAt,player:{profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}}],
    ["owner-b",{player_id:"owner-b",updated_at:oldAt,player:{name:"B",profile_avatar_data_url:null,profile_avatar_updated_at:null}}]
  ]);
  const context=vm.createContext({safeClone:value=>structuredClone(value),clientId:()=>"device",
    readAccountState:id=>cache.get(id)||null,stateTimestamp:value=>Date.parse(value?.updated_at||"")||0,
    mergePlayerHqFields:()=>({}),mergeProfileAvatar});
  vm.runInContext(app.slice(begin,end),context);
  const signedOutCurrent={player_id:"owner-a",updated_at:oldAt,player:{profile_avatar_data_url:null,profile_avatar_updated_at:oldAt}};
  assert.equal(context.safestLoginSeed("owner-a",signedOutCurrent).player.profile_avatar_data_url,photo);
  const otherAccountCurrent={player_id:"owner-a",updated_at:oldAt,player:{profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}};
  const userB=context.safestLoginSeed("owner-b",otherAccountCurrent);
  assert.equal(userB.player_id,"owner-b");assert.equal(userB.player.profile_avatar_data_url,null);
});
await asyncCheck("actual memory cleanup clears data but keeps the account-scoped cache separate",async()=>{
  const begin=app.indexOf("function clearActiveProfileAvatarFromMemory(){"),end=app.indexOf("\nfunction firstLoadingTarget",begin);
  const state={player:{profile_avatar_data_url:photo,profile_avatar_updated_at:oldAt}};
  const context=vm.createContext({state,clearPendingProfileAvatarDraft(){},$(){return {classList:{add(){}}}},maskHomePrivateMeta(){context.masked=true}});
  vm.runInContext(app.slice(begin,end),context);context.clearActiveProfileAvatarFromMemory();
  assert.equal(state.player.profile_avatar_data_url,null);assert.equal(state.player.profile_avatar_updated_at,oldAt);
  assert.equal(context.masked,true);
});

class AvatarFakeClassList{
  constructor(){this.values=new Set()}
  add(value){this.values.add(value)}
  remove(value){this.values.delete(value)}
  contains(value){return this.values.has(value)}
  toggle(value,force){if(force===undefined)force=!this.values.has(value);force?this.add(value):this.remove(value);return force}
}
class AvatarFakeElement{
  constructor(rect={left:0,top:0,width:0,height:0}){this.rect=rect;this.listeners={};this.classList=new AvatarFakeClassList();this.dataset={};this.attrs={};this.textContent="";this.disabled=false;this.value=""}
  addEventListener(type,callback){(this.listeners[type]??=[]).push(callback)}
  dispatch(type,event={}){if(type==="click"&&this.disabled)return;for(const callback of this.listeners[type]||[])callback({target:this,currentTarget:this,preventDefault(){},...event})}
  getBoundingClientRect(){return this.rect}
  setAttribute(key,value){this.attrs[key]=String(value)}
  getAttribute(key){return this.attrs[key]??null}
  removeAttribute(key){delete this.attrs[key];if(key==="src")this.src=""}
  setPointerCapture(pointer){this.capturedPointer=pointer}
  append(node){this.textContent+=node?.textContent||""}
}
function createAvatarDomHarness({viewportWidth=390,decode="ok",canvasError=""}={}){
  const createdCanvases=[],imageInstances=[];
  const panel=new AvatarFakeElement(),status=new AvatarFakeElement(),preview=new AvatarFakeElement(),
    useButton=new AvatarFakeElement(),canvas=new AvatarFakeElement();
  const displayWidth=Math.min(180,viewportWidth-32),displayHeight=displayWidth*2;
  canvas.rect={left:0,top:0,width:displayWidth,height:displayHeight};
  const contextFor=(isOutput=false)=>{
    const ctx={draws:[],clearRect(){},fillRect(){},save(){},restore(){},beginPath(){},rect(){},fill(){},strokeRect(){},
      drawImage(...args){if(isOutput&&canvasError==="draw")throw new Error("draw failed");this.draws.push(args)}};
    return ctx;
  };
  const screenContext=contextFor(false);
  canvas.getContext=()=>screenContext;
  class FakeTargetCanvas extends AvatarFakeElement{
    constructor(){super();this.width=0;this.height=0;this.context=contextFor(true);createdCanvases.push(this)}
    getContext(){return this.context}
    toDataURL(){if(canvasError==="encode")throw new Error("encode failed");return photo}
  }
  class FakeImage{
    constructor(){this.naturalWidth=640;this.naturalHeight=1280;imageInstances.push(this)}
    set src(value){this._src=value;queueMicrotask(()=>decode==="error"?this.onerror?.(new Error("decode failed")):this.onload?.())}
    get src(){return this._src}
  }
  const nodes=new Map([
    ["profileAvatarCropPanel",panel],["profileAvatarCropCanvas",canvas],
    ["profileAvatarCropPreview",preview],["profileAvatarCropStatus",status],["profileAvatarUseBtn",useButton]
  ]);
  useButton.disabled=true;
  const root={
    getElementById:id=>nodes.get(id)||null,
    createElement:tag=>tag==="canvas"?new FakeTargetCanvas():new AvatarFakeElement(),
    addEventListener(type,callback){(this.listeners??={})[type]??=[];this.listeners[type].push(callback)},
    listeners:{},defaultView:{Image:FakeImage}
  };
  return {root,panel,status,preview,useButton,canvas,screenContext,createdCanvases,imageInstances,dispatchRoot(type,event){for(const callback of root.listeners[type]||[])callback(event)}};
}
const pointer=(pointerId,clientX,clientY,pointerType="touch")=>({pointerId,clientX,clientY,pointerType,isPrimary:true});
async function waitForAvatarImage(){await new Promise(resolve=>setImmediate(resolve))}
function dragAvatar(harness,{start=[18,18],end=[64,64],pointerId=7}={}){
  harness.canvas.dispatch("pointerdown",pointer(pointerId,...start));
  harness.canvas.dispatch("pointermove",pointer(pointerId,...end));
  return harness;
}

check("selection acceptance reports explicit owner, revision, and JPEG failures",()=>{
  const draft={type:"profile",owner:"user:account-a",request:{revision:4}};
  const accepted=validateProfileAvatarSelection({selection:{dataUrl:photo,owner:"user:account-a",revision:4},draft,userId:"account-a",stateOwnerId:"account-a",requestIsCurrent:true});
  assert.equal(accepted.ok,true);assert.equal(accepted.pending.dataUrl,photo);
  assert.deepEqual(validateProfileAvatarSelection({selection:{dataUrl:photo,owner:"user:account-a",revision:4},draft,userId:"",stateOwnerId:"account-a",requestIsCurrent:true}),{ok:false,messageKey:"profile_avatar_signin_required"});
  assert.deepEqual(validateProfileAvatarSelection({selection:{dataUrl:photo,owner:"user:account-a",revision:4},draft,userId:"account-a",stateOwnerId:"account-a",requestIsCurrent:false}),{ok:false,messageKey:"profile_avatar_scan_stale"});
  assert.deepEqual(validateProfileAvatarSelection({selection:{dataUrl:"data:image/png;base64,AA==",owner:"user:account-a",revision:4},draft,userId:"account-a",stateOwnerId:"account-a",requestIsCurrent:true}),{ok:false,messageKey:"profile_avatar_crop_failed"});
});

await asyncCheck("pointer loading, tap without crop, and valid touch drag drive visible button states",async()=>{
  for(const viewportWidth of [360,390,430]){
    let accepted=null,calls=0;
    const harness=createAvatarDomHarness({viewportWidth});
    const cropper=createProfileAvatarCropper({root:harness.root,text:key=>key,onUse:value=>{calls++;accepted=value;return {ok:true}}});
    assert.equal(cropper.setCapture("data:image/jpeg;base64,/9j/AA==","user:account-a",4),true);
    assert.equal(harness.useButton.disabled,true);assert.equal(harness.status.textContent,"profile_avatar_loading");
    harness.useButton.dispatch("click");
    assert.equal(calls,0,"a loading-button tap cannot select or save a photo");
    await waitForAvatarImage();
    assert.equal(harness.useButton.disabled,true);assert.equal(harness.status.textContent,"profile_avatar_select_first");
    harness.useButton.dispatch("click");
    assert.equal(calls,0,"a tap without a crop is safely ignored while the reason remains visible");
    dragAvatar(harness,{start:[18,18],end:[64,64]});
    assert.equal(harness.canvas.capturedPointer,7);
    assert.equal(harness.preview.classList.contains("hidden"),false,"preview updates while the finger is dragging");
    harness.canvas.dispatch("pointerup",pointer(7,64,64));
    assert.equal(harness.useButton.disabled,false);assert.equal(harness.useButton.getAttribute("aria-disabled"),"false");
    assert.equal(harness.status.textContent,"profile_avatar_crop_ready");
    assert.equal(harness.createdCanvases.at(-1).width,128);assert.equal(harness.createdCanvases.at(-1).height,128);
    assert.equal(harness.createdCanvases.at(-1).context.draws[0][0],harness.imageInstances[0],"crop output is drawn from the clean source image");
    harness.useButton.dispatch("click");
    assert.equal(calls,1);assert.equal(accepted.owner,"user:account-a");assert.equal(accepted.revision,4);
    assert.equal(accepted.dataUrl,photo);assert.equal(harness.status.textContent,"profile_avatar_ready");
  }
});

await asyncCheck("tiny crop, pointer cancellation, decode failure and canvas errors remain explicit",async()=>{
  const small=createAvatarDomHarness({viewportWidth:360});
  const smallCropper=createProfileAvatarCropper({root:small.root});
  smallCropper.setCapture("data:image/jpeg;base64,/9j/AA==","user:account-a",1);await waitForAvatarImage();
  dragAvatar(small,{start:[12,12],end:[15,15]});small.canvas.dispatch("pointerup",pointer(7,15,15));
  assert.equal(small.useButton.disabled,true);assert.equal(small.status.textContent,"profile_avatar_size_error");

  dragAvatar(small,{start:[18,18],end:[64,64]});
  small.canvas.dispatch("pointercancel",pointer(7,64,64));
  assert.equal(small.useButton.disabled,true);assert.equal(small.status.textContent,"profile_avatar_selection_cancelled");
  dragAvatar(small,{start:[18,18],end:[64,64]});small.canvas.dispatch("pointerup",pointer(7,64,64));
  assert.equal(small.useButton.disabled,false,"a cancelled selection can be retried without losing the scan");

  const badImage=createAvatarDomHarness({decode:"error"});
  const badCropper=createProfileAvatarCropper({root:badImage.root});
  badCropper.setCapture("data:image/jpeg;base64,/9j/AA==","user:account-a",1);await waitForAvatarImage();
  assert.equal(badImage.status.textContent,"profile_avatar_unavailable");assert.equal(badImage.useButton.disabled,true);

  for(const canvasError of ["draw","encode"]){
    const broken=createAvatarDomHarness({canvasError});
    const brokenCropper=createProfileAvatarCropper({root:broken.root});
    brokenCropper.setCapture("data:image/jpeg;base64,/9j/AA==","user:account-a",1);await waitForAvatarImage();
    dragAvatar(broken,{start:[18,18],end:[64,64]});broken.canvas.dispatch("pointerup",pointer(7,64,64));
    assert.equal(broken.useButton.disabled,true);assert.equal(broken.status.textContent,"profile_avatar_crop_failed");
  }
});

await asyncCheck("callback refusal never displays success and stale account cannot receive crop",async()=>{
  const denied=createAvatarDomHarness({viewportWidth:390});
  const cropper=createProfileAvatarCropper({root:denied.root,onUse:()=>({ok:false,messageKey:"profile_avatar_scan_stale"})});
  cropper.setCapture("data:image/jpeg;base64,/9j/AA==","user:account-a",4);await waitForAvatarImage();
  dragAvatar(denied);denied.canvas.dispatch("pointerup",pointer(7,64,64));denied.useButton.dispatch("click");
  assert.equal(denied.status.textContent,"profile_avatar_scan_stale");assert.equal(denied.useButton.disabled,true);
  assert.notEqual(denied.status.textContent,"profile_avatar_ready");
  const crossAccount=validateProfileAvatarSelection({selection:{dataUrl:photo,owner:"user:account-a",revision:4},draft:{type:"profile",owner:"user:account-a",request:{revision:4}},userId:"account-b",stateOwnerId:"account-b",requestIsCurrent:true});
  assert.equal(crossAccount.ok,false);assert.equal(crossAccount.messageKey,"profile_avatar_signin_required");
});

await asyncCheck("confirmation persists the JPEG only for its matching owner and renders Player avatar",async()=>{
  const confirmStart=app.indexOf("function confirmScanReview(){"),confirmEnd=app.indexOf('\n$("#confirmScanReviewBtn")',confirmStart);
  const renderStart=app.indexOf("function clearHomePlayerAvatar(){"),renderEnd=app.indexOf("\nfunction renderHomeAllianceMeta(",renderStart);
  assert.ok(confirmStart>=0&&confirmEnd>confirmStart&&renderStart>=0&&renderEnd>renderStart);
  const nodes=new Map(),node=id=>{
    if(!nodes.has(id)){
      const el=new AvatarFakeElement();el.className="notice";el.append=AvatarFakeElement.prototype.append;
      el.src="";el.onerror=null;
      nodes.set(id,el);
    }
    return nodes.get(id);
  };
  const state={player_id:"account-a",player:{name:"Player",profile_avatar_data_url:null},sync:{status:"ok",pending_cloud_save:false,sources:{}}};
  const context=vm.createContext({
    state,cloudSession:{user:{id:"account-a"}},cloudDirty:false,pendingScanReview:{owner:"user:account-a",type:"profile",request:{revision:4}},
    pendingProfileAvatar:{dataUrl:photo,owner:"user:account-a",revision:4},profileAvatarCropper:{clear(){}},
    $:selector=>node(selector),t:key=>key,normalizeProfileAvatarDataUrl,betaPrivateDataVisible:()=>true,
    scanSquadId:()=>null,pendingScanOwner:()=>"user:account-a",requireScanSquadTarget:()=>true,scanRequestIsCurrent:()=>true,
    scanReviewFormEdits:()=>({edits:[]}),applyOwnedScanReview:()=>({patch:{player:{name:"Player"}},errors:[]}),
    stampConfirmedRecord:value=>value,safeClone:value=>structuredClone(value),recordProgressionSnapshot(){},
    mergeStateProtected(base,incoming){return {...base,...incoming,player:{...base.player,...incoming.player},sync:{...base.sync,...incoming.sync}}},
    repairLegacySquadIdentity:value=>({state:value}),updateSquadCaptureHelp(){},discardScanReviewDraft(){context.pendingScanReview=null},
    invalidatePlayerAdvice(){},showConfirmedScanStatus(status,key){status.textContent=key},setScanReviewError(){},
    document:{createTextNode:text=>({textContent:text})},saveState(){return true}
  });
  vm.runInContext(app.slice(renderStart,renderEnd),context);
  context.saveState=()=>{context.renderHomePlayerMeta(context.state.player);return true};
  vm.runInContext(app.slice(confirmStart,confirmEnd),context);
  assert.equal(context.state.player.profile_avatar_data_url,null,"the first photo action remains a draft until values are confirmed");
  context.confirmScanReview();
  assert.equal(context.state.player.profile_avatar_data_url,photo);
  assert.equal(context.state.sync.pending_cloud_save,true);
  assert.equal(node("#playerHomeAvatar").src,photo,"the authenticated Player card updates immediately after saveState renders");
  assert.equal(node("#playerAvatarSyncStatus").textContent,"profile_avatar_cloud_pending");
  assert.match(node("#scanStatus").textContent,/profile_avatar_saved/);

  context.state.sync={status:"ok",pending_cloud_save:false};context.cloudDirty=false;
  context.renderProfileAvatarSyncStatus();
  assert.equal(node("#playerAvatarSyncStatus").textContent,"profile_avatar_cloud_synced");

  const otherState={player_id:"account-b",player:{name:"B",profile_avatar_data_url:null},sync:{status:"ok",pending_cloud_save:false,sources:{}}};
  const otherContext=vm.createContext({...context,state:otherState,cloudSession:{user:{id:"account-b"}},
    pendingScanReview:{owner:"user:account-b",type:"profile",request:{revision:5}},
    pendingProfileAvatar:{dataUrl:photo,owner:"user:account-a",revision:4},pendingScanOwner:()=>"user:account-b"});
  vm.runInContext(app.slice(renderStart,renderEnd),otherContext);
  otherContext.saveState=()=>{otherContext.renderHomePlayerMeta(otherContext.state.player);return true};
  vm.runInContext(app.slice(confirmStart,confirmEnd),otherContext);otherContext.confirmScanReview();
  assert.equal(otherContext.state.player.profile_avatar_data_url,null,"a different owner's draft is never attached to this profile");
  assert.equal(node("#playerHomeAvatar").src,"","account B cannot render account A's avatar");
});

check("new mobile feedback and two-step cloud messages are translated for supported locales",()=>{
  const keys=["profile_avatar_instructions","profile_avatar_selecting","profile_avatar_select_first","profile_avatar_loading","profile_avatar_crop_ready","profile_avatar_ready","profile_avatar_signin_required","profile_avatar_scan_stale","profile_avatar_selection_cancelled","profile_avatar_crop_failed","profile_avatar_saved","profile_avatar_cloud_pending","profile_avatar_cloud_synced"];
  for(const [code] of LANGUAGES.filter(([code])=>code!=="auto"))
    for(const key of keys)assert.notEqual(translator(code)(key),key,`${code}:${key}`);
  assert.match(translator("fr")("profile_avatar_ready"),/Confirmer les valeurs/);
  assert.equal(PROFILE_AVATAR_CROP_MIN_SIDE,18);
});

console.log(`Profile avatar verification: ${passed} checks PASS, 0 FAIL`);
