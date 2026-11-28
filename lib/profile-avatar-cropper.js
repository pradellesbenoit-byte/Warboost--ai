import {normalizeProfileAvatarDataUrl,squareAvatarSelection} from "./profile-avatar.js";

export function createProfileAvatarCropper({root=document,onUse=()=>{},onSelectionStart=()=>{},text=key=>key}={}){
  const panel=root.getElementById("profileAvatarCropPanel"),canvas=root.getElementById("profileAvatarCropCanvas"),
    preview=root.getElementById("profileAvatarCropPreview"),status=root.getElementById("profileAvatarCropStatus"),
    useButton=root.getElementById("profileAvatarUseBtn");
  const context=canvas?.getContext?.("2d");
  let image=null,selection=null,dragStart=null,output=null,owner="",revision=null;
  const setStatus=key=>{if(status)status.textContent=key?text(key):""};
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
    output=null;if(useButton)useButton.disabled=true;
    if(preview){preview.removeAttribute("src");preview.classList.add("hidden")}
  }
  function buildPreview(){
    clearOutput();
    if(!selection||!canvas)return;
    const target=document.createElement("canvas");target.width=128;target.height=128;
    const ctx=target.getContext("2d");if(!ctx){setStatus("profile_avatar_unavailable");return}
    ctx.drawImage(canvas,selection.x,selection.y,selection.size,selection.size,0,0,128,128);
    for(const quality of [.82,.68,.54,.4,.28]){
      const data=normalizeProfileAvatarDataUrl(target.toDataURL("image/jpeg",quality));
      if(data){output=data;break}
    }
    if(!output){setStatus("profile_avatar_size_error");return}
    if(preview){preview.src=output;preview.alt=text("profile_avatar_preview");preview.classList.remove("hidden")}
    if(useButton)useButton.disabled=false;
    setStatus("");
  }
  function finish(event){
    if(dragStart===null)return;
    const p=point(event);dragStart=null;
    selection=p?squareAvatarSelection(dragStartX,dragStartY,p.x,p.y,canvas.width,canvas.height,28):null;
    drawSelection();
    if(!selection){clearOutput();setStatus("profile_avatar_size_error");return}
    buildPreview();
  }
  let dragStartX=0,dragStartY=0;
  canvas?.addEventListener("pointerdown",event=>{
    if(!image)return;
    const p=point(event);if(!p)return;
    onSelectionStart();clearOutput();setStatus("");
    dragStart=true;dragStartX=p.x;dragStartY=p.y;selection=null;
    try{canvas.setPointerCapture(event.pointerId)}catch{}
  });
  canvas?.addEventListener("pointermove",event=>{
    if(!dragStart)return;
    const p=point(event);if(!p)return;
    selection=squareAvatarSelection(dragStartX,dragStartY,p.x,p.y,canvas.width,canvas.height,1);
    drawSelection();
  });
  canvas?.addEventListener("pointerup",finish);
  canvas?.addEventListener("pointercancel",event=>{if(dragStart!==null)finish(event)});
  useButton?.addEventListener("click",()=>{
    if(!output||!owner||!Number.isInteger(revision))return;
    onUse({dataUrl:output,owner,revision});setStatus("profile_avatar_ready");
  });
  function clear(){
    image=null;selection=null;dragStart=null;owner="";revision=null;clearOutput();setStatus("");
    if(panel)panel.classList.add("hidden");
    if(canvas&&context){context.clearRect(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0}
  }
  function setCapture(dataUrl,nextOwner,nextRevision){
    clear();
    if(!dataUrl||!nextOwner||!Number.isInteger(nextRevision)||!panel||!canvas||!context)return false;
    owner=nextOwner;revision=nextRevision;panel.classList.remove("hidden");
    const next=new Image();
    next.onload=()=>{
      if(image!==next)return;
      const scale=Math.min(1,480/Math.max(next.naturalWidth||1,next.naturalHeight||1));
      canvas.width=Math.max(1,Math.round(next.naturalWidth*scale));canvas.height=Math.max(1,Math.round(next.naturalHeight*scale));
      context.drawImage(next,0,0,canvas.width,canvas.height);setStatus("");
    };
    next.onerror=()=>{if(image===next){image=null;setStatus("profile_avatar_unavailable")}};
    image=next;next.src=dataUrl;return true;
  }
  function isFor(nextOwner,nextRevision){return Boolean(image&&owner===nextOwner&&revision===nextRevision)}
  return {setCapture,clear,isFor};
}
