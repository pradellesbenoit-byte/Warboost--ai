import {normalizeProfileAvatarDataUrl,PROFILE_AVATAR_CROP_MIN_SIDE,squareAvatarSelection} from "./profile-avatar.js";

export function createProfileAvatarCropper({root=document,onUse=()=>{},onSelectionStart=()=>{},text=key=>key}={}){
  const panel=root.getElementById("profileAvatarCropPanel"),canvas=root.getElementById("profileAvatarCropCanvas"),
    preview=root.getElementById("profileAvatarCropPreview"),status=root.getElementById("profileAvatarCropStatus"),
    useButton=root.getElementById("profileAvatarUseBtn");
  const context=canvas?.getContext?.("2d");
  const doc=root.ownerDocument||root,ImageCtor=root.defaultView?.Image||globalThis.Image;
  let image=null,selection=null,dragStart=null,activePointerId=null,output=null,owner="",revision=null,disabledReason="profile_avatar_loading";
  const setStatus=key=>{if(status)status.textContent=key?text(key):""};
  const pointerId=event=>Number.isFinite(event?.pointerId)?event.pointerId:0;
  function setActionState(reasonKey){
    disabledReason=reasonKey||"";
    if(!useButton)return;
    useButton.disabled=Boolean(disabledReason);
    useButton.setAttribute("aria-disabled",String(Boolean(disabledReason)));
    if(useButton.dataset)useButton.dataset.disabledReason=disabledReason;
  }
  function drawSelection(){
    if(!canvas||!context||!image)return;
    context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    if(!selection)return;
    const {x,y,size}=selection;context.fillStyle="rgba(0,0,0,.62)";
    context.fillRect(0,0,canvas.width,canvas.height);
    context.clearRect(x,y,size,size);context.drawImage(image,0,0,canvas.width,canvas.height);
    context.save();context.beginPath();context.rect(0,0,canvas.width,canvas.height);context.rect(x,y,size,size);
    context.fillStyle="rgba(0,0,0,.62)";context.fill("evenodd");context.restore();
    context.strokeStyle="#ffffff";context.lineWidth=Math.max(2,canvas.width/240);context.strokeRect(x,y,size,size);
  }
  function point(event){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
  }
  function clearOutput(){
    output=null;
    if(preview){preview.removeAttribute("src");preview.classList.add("hidden")}
  }
  function renderCrop(quality){
    if(!image||!selection||!canvas)return null;
    const target=doc.createElement("canvas");target.width=128;target.height=128;
    const ctx=target.getContext("2d");if(!ctx)throw new Error("avatar_canvas_unavailable");
    // Crop from the original decoded capture, not the display canvas: that canvas
    // contains the dimming overlay and white selection border.
    const scaleX=(image.naturalWidth||image.width||canvas.width)/canvas.width;
    const scaleY=(image.naturalHeight||image.height||canvas.height)/canvas.height;
    ctx.drawImage(image,selection.x*scaleX,selection.y*scaleY,selection.size*scaleX,selection.size*scaleY,0,0,128,128);
    return target.toDataURL("image/jpeg",quality);
  }
  function showPreview(data){
    const normalized=normalizeProfileAvatarDataUrl(data);
    if(!normalized||!preview)return false;
    preview.src=normalized;preview.alt=text("profile_avatar_preview");preview.classList.remove("hidden");
    return true;
  }
  function updateLivePreview(){
    if(!selection||selection.size<PROFILE_AVATAR_CROP_MIN_SIDE)return;
    try{showPreview(renderCrop(.5))}
    catch{clearOutput();setActionState("profile_avatar_crop_failed");setStatus("profile_avatar_crop_failed")}
  }
  function buildPreview(){
    clearOutput();
    if(!selection||!canvas)return;
    try{
      for(const quality of [.82,.68,.54,.4,.28]){
        const data=normalizeProfileAvatarDataUrl(renderCrop(quality));
        if(data){output=data;break}
      }
      if(!output){setActionState("profile_avatar_size_error");setStatus("profile_avatar_size_error");return}
      showPreview(output);setActionState("");setStatus("profile_avatar_crop_ready");
    }catch{clearOutput();setActionState("profile_avatar_crop_failed");setStatus("profile_avatar_crop_failed")}
  }
  function finish(event){
    if(dragStart===null||pointerId(event)!==activePointerId)return;
    const p=point(event);dragStart=null;activePointerId=null;
    selection=p?squareAvatarSelection(dragStartX,dragStartY,p.x,p.y,canvas.width,canvas.height,PROFILE_AVATAR_CROP_MIN_SIDE):null;
    drawSelection();
    if(!selection){clearOutput();setActionState("profile_avatar_size_error");setStatus("profile_avatar_size_error");return}
    buildPreview();
  }
  function cancelSelection(event){
    if(dragStart===null||pointerId(event)!==activePointerId)return;
    dragStart=null;activePointerId=null;selection=null;clearOutput();drawSelection();
    setActionState("profile_avatar_selection_cancelled");setStatus("profile_avatar_selection_cancelled");
  }
  let dragStartX=0,dragStartY=0;
  canvas?.addEventListener("pointerdown",event=>{
    if(!image||event.isPrimary===false)return;
    const p=point(event);if(!p)return;
    event.preventDefault?.();
    onSelectionStart();clearOutput();setActionState("profile_avatar_selecting");setStatus("profile_avatar_selecting");
    dragStart=true;activePointerId=pointerId(event);dragStartX=p.x;dragStartY=p.y;selection=null;
    try{canvas.setPointerCapture(event.pointerId)}catch{}
  });
  canvas?.addEventListener("pointermove",event=>{
    if(!dragStart||pointerId(event)!==activePointerId)return;
    const p=point(event);if(!p)return;
    selection=squareAvatarSelection(dragStartX,dragStartY,p.x,p.y,canvas.width,canvas.height,1);
    drawSelection();
    updateLivePreview();
  });
  canvas?.addEventListener("pointerup",finish);
  canvas?.addEventListener("pointercancel",cancelSelection);
  canvas?.addEventListener("lostpointercapture",cancelSelection);
  root.addEventListener?.("pointerup",finish);
  root.addEventListener?.("pointercancel",cancelSelection);
  useButton?.addEventListener("click",()=>{
    if(useButton.disabled){setStatus(disabledReason||"profile_avatar_select_first");return}
    if(!image){setActionState("profile_avatar_unavailable");setStatus("profile_avatar_unavailable");return}
    if(!selection){setActionState("profile_avatar_select_first");setStatus("profile_avatar_select_first");return}
    if(!output){setActionState("profile_avatar_size_error");setStatus("profile_avatar_size_error");return}
    if(!owner||!Number.isInteger(revision)){setActionState("profile_avatar_scan_stale");setStatus("profile_avatar_scan_stale");return}
    try{
      const result=onUse({dataUrl:output,owner,revision});
      if(result===true||result?.ok===true){setActionState("");setStatus("profile_avatar_ready")}
      else{const reason=result?.messageKey||"profile_avatar_scan_stale";setActionState(reason);setStatus(reason)}
    }catch{setActionState("profile_avatar_scan_stale");setStatus("profile_avatar_scan_stale")}
  });
  function clear(){
    image=null;selection=null;dragStart=null;activePointerId=null;owner="";revision=null;clearOutput();setActionState("profile_avatar_loading");setStatus("");
    if(panel)panel.classList.add("hidden");
    if(canvas&&context){context.clearRect(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0}
  }
  function setCapture(dataUrl,nextOwner,nextRevision){
    clear();
    if(!dataUrl||!nextOwner||!Number.isInteger(nextRevision)||!panel||!canvas||!context||!ImageCtor){
      panel?.classList.remove("hidden");setActionState("profile_avatar_unavailable");setStatus("profile_avatar_unavailable");return false;
    }
    owner=nextOwner;revision=nextRevision;panel.classList.remove("hidden");
    setActionState("profile_avatar_loading");setStatus("profile_avatar_loading");
    const next=new ImageCtor();
    next.onload=()=>{
      if(image!==next)return;
      try{
        const scale=Math.min(1,480/Math.max(next.naturalWidth||1,next.naturalHeight||1));
        canvas.width=Math.max(1,Math.round(next.naturalWidth*scale));canvas.height=Math.max(1,Math.round(next.naturalHeight*scale));
        context.drawImage(next,0,0,canvas.width,canvas.height);setActionState("profile_avatar_select_first");setStatus("profile_avatar_select_first");
      }catch{image=null;setActionState("profile_avatar_unavailable");setStatus("profile_avatar_unavailable")}
    };
    next.onerror=()=>{if(image===next){image=null;selection=null;clearOutput();setActionState("profile_avatar_unavailable");setStatus("profile_avatar_unavailable")}};
    image=next;next.src=dataUrl;return true;
  }
  function isFor(nextOwner,nextRevision){return Boolean(image&&owner===nextOwner&&revision===nextRevision)}
  return {setCapture,clear,isFor};
}
