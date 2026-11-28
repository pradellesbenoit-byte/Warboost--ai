export const PROFILE_AVATAR_DATA_URL_MAX_LENGTH=24000;
export const PROFILE_AVATAR_CROP_MIN_SIDE=18;
const JPEG_DATA_URL=/^data:image\/jpeg;base64,\/9j\/(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function normalizeProfileAvatarDataUrl(value){
  if(typeof value!=="string"||value.length>PROFILE_AVATAR_DATA_URL_MAX_LENGTH||!JPEG_DATA_URL.test(value))return null;
  return value;
}

export function validateProfileAvatarSelection({selection,draft,userId,stateOwnerId,requestIsCurrent}={}){
  const owner=String(userId||"");
  if(!owner||String(stateOwnerId||"")!==owner||selection?.owner!==`user:${owner}`)
    return {ok:false,messageKey:"profile_avatar_signin_required"};
  if(!draft||draft.type!=="profile"||selection?.owner!==draft.owner||
    selection?.revision!==draft.request?.revision||requestIsCurrent!==true)
    return {ok:false,messageKey:"profile_avatar_scan_stale"};
  const dataUrl=normalizeProfileAvatarDataUrl(selection?.dataUrl);
  if(!dataUrl)return {ok:false,messageKey:"profile_avatar_crop_failed"};
  return {ok:true,pending:{dataUrl,owner:selection.owner,revision:selection.revision}};
}

export function squareAvatarSelection(startX,startY,endX,endY,width,height,minSide=24){
  const w=Number(width),h=Number(height);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)return null;
  const clamp=(value,max)=>Math.max(0,Math.min(max,Number(value)||0));
  const x0=clamp(startX,w),y0=clamp(startY,h),x1=clamp(endX,w),y1=clamp(endY,h);
  const side=Math.floor(Math.min(Math.abs(x1-x0),Math.abs(y1-y0),w,h));
  if(side<Math.max(1,Number(minSide)||1))return null;
  const left=clamp((x1<x0?x0-side:x0),w-side);
  const top=clamp((y1<y0?y0-side:y0),h-side);
  return {x:Math.floor(left),y:Math.floor(top),size:side};
}

export function profileStateWithoutAvatar(state){
  if(!state||typeof state!=="object"||!state.player||typeof state.player!=="object")return state;
  const player={...state.player};
  delete player.profile_avatar_data_url;
  return {...state,player};
}

export function mergeProfileAvatar(base={},incoming={}){
  const baseData=normalizeProfileAvatarDataUrl(base?.profile_avatar_data_url);
  const incomingHasAvatar=Boolean(incoming&&Object.hasOwn(incoming,"profile_avatar_data_url"));
  const baseAt=Date.parse(base?.profile_avatar_updated_at||"")||0;
  const incomingAt=Date.parse(incoming?.profile_avatar_updated_at||"")||0;
  const incomingData=normalizeProfileAvatarDataUrl(incoming?.profile_avatar_data_url);
  const acceptIncoming=incomingHasAvatar&&(incomingAt>baseAt||
    (incomingAt===baseAt&&incomingAt>0)||(!baseData&&Boolean(incomingData)&&baseAt===0&&incomingAt===0));
  return acceptIncoming
    ?{profile_avatar_data_url:incomingData,profile_avatar_updated_at:incoming?.profile_avatar_updated_at||null}
    :{profile_avatar_data_url:baseData,profile_avatar_updated_at:base?.profile_avatar_updated_at||null};
}

export function removeProfileAvatar(player={},updatedAt=new Date().toISOString()){
  return {...(player||{}),profile_avatar_data_url:null,profile_avatar_updated_at:updatedAt,updated_at:updatedAt};
}
