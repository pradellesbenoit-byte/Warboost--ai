import {mountIdentityOnboarding} from "./identity-onboarding-ui.js";
import {identityOnboardingRequired,validPlayerIdentity} from "./identity-onboarding.js";

const ERROR_COPY={
  IDENTITY_INVALID:"identity_onboarding_invalid",
  IDENTITY_DUPLICATE:"identity_onboarding_duplicate",
  IDENTITY_AMBIGUOUS:"identity_onboarding_duplicate",
  IDENTITY_AUTHORITY_CONFLICT:"identity_onboarding_conflict"
};

export function createIdentityOnboardingController({document,getContext,translate,request,onProfile}){
  let view=null,owner="",generation=0,loading=false,saving=false,loaded=false,authority={},messageKey="",revision=null;
  const t=key=>translate(getContext().locale)(key);
  const values=()=>Object.fromEntries(Object.entries(view.inputs).map(([key,input])=>[key,input.value.trim()]));
  function paint(){
    if(!view)return;
    view.dialog.lang=getContext().locale||"en-GB";
    view.dialog.dir=view.dialog.lang==="ar"?"rtl":"ltr";
    view.dialog.querySelectorAll("[data-i18n]").forEach(node=>{node.textContent=t(node.dataset.i18n)});
    for(const [key,input] of Object.entries(view.inputs)){
      input.disabled=loading||saving||!loaded;
      input.readOnly=Boolean(authority[key]);
    }
    view.button.disabled=loading||saving||!loaded||!validPlayerIdentity(values());
    view.button.textContent=t(saving?"syncing":"identity_onboarding_continue");
    view.status.textContent=t(loading||!loaded&&!messageKey?"syncing":messageKey||(Object.keys(authority).length?"identity_onboarding_authoritative":""));
    if(!messageKey&&!loading&&loaded&&!Object.keys(authority).length)view.status.textContent="";
    view.retry.hidden=loading||saving||loaded||!messageKey;
    view.retry.textContent=t("identity_onboarding_retry");
  }
  function close(){
    generation++;view?.dialog.close();view?.dialog.remove();view=null;
    owner="";loaded=false;loading=false;saving=false;authority={};messageKey="";
  }
  async function load(){
    if(!view||loading||saving)return;
    const id=owner,version=++generation;
    loading=true;messageKey="";paint();
    try{
      const result=await request("GET");
      if(version!==generation||getContext().userId!==id)return;
      authority=result.authority||{};
      revision=result.updated_at||null;
      // Preserve this account's local partial identity; verified roster fields take precedence.
      for(const [key,input] of Object.entries(view.inputs))
        input.value=authority[key]||input.value||result.identity?.[key]||"";
      loaded=true;
      onProfile(result,{saved:false,ownerId:id});
      if(!view||version!==generation)return;
    }catch(error){
      if(version!==generation||getContext().userId!==id)return;
      loaded=false;messageKey=ERROR_COPY[error.code]||"identity_onboarding_error";
    }finally{
      if(version===generation){loading=false;paint()}
    }
  }
  async function submit(event){
    event.preventDefault();
    if(!view||saving||loading||!loaded||!validPlayerIdentity(values()))return;
    const id=owner,version=generation,candidate=values();
    saving=true;messageKey="";paint();
    try{
      const result=await request("POST",{identity:candidate,base_updated_at:revision});
      if(version!==generation||getContext().userId!==id)return;
      onProfile(result,{saved:true,ownerId:id});
      // Do not dismiss unless the current account really received a complete saved identity.
      sync();
    }catch(error){
      if(version!==generation||getContext().userId!==id)return;
      messageKey=ERROR_COPY[error.code]||"identity_onboarding_error";
      if(error.code==="profile_write_conflict"||error.code==="profile_revision_required")loaded=false;
      if(error.authority){
        authority=error.authority;
        for(const [key,value] of Object.entries(authority))if(view.inputs[key])view.inputs[key].value=value;
      }
    }finally{
      if(version===generation){saving=false;paint()}
    }
  }
  function sync(){
    const context=getContext();
    if(!identityOnboardingRequired(context)){if(view)close();return false}
    if(view&&owner!==context.userId)close();
    if(!view){
      owner=context.userId;view=mountIdentityOnboarding(document);
      view.retry=document.createElement("button");view.retry.type="button";
      view.retry.className="secondaryBtn";view.retry.id="identityOnboardingRetry";
      view.retry.hidden=true;view.status.after(view.retry);
      for(const [key,input] of Object.entries(view.inputs))input.value=context.identity?.[key]||"";
      view.form.addEventListener("submit",submit);
      view.form.addEventListener("input",()=>{messageKey="";paint()});
      view.retry.addEventListener("click",load);
      // Programmatic/external closure must not bypass the required identity.
      view.dialog.addEventListener("close",()=>{if(view&&!view.dialog.open&&identityOnboardingRequired(getContext()))view.dialog.showModal()});
    }
    paint();
    if(!loaded&&!loading&&!messageKey&&!context.hydrating)void load();
    return true;
  }
  return {sync,isRequired:()=>identityOnboardingRequired(getContext()),destroy:close};
}