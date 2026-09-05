import {resolveLanguage,dirFor,translator} from "./i18n.js";
import {createWarBoostSupabaseAuthClient} from "./lib/browser-auth.js";

const $=s=>document.querySelector(s);
const LANGUAGE_KEY="warboost_v12_language";
const RECOVERY_MARKER="warboost_password_recovery_active_v2_5_25";
const choice=localStorage.getItem(LANGUAGE_KEY)||"auto";
const lang=resolveLanguage(choice), t=translator(lang);
document.documentElement.lang=lang;
document.documentElement.dir=dirFor(lang);
document.querySelectorAll("[data-i18n]").forEach(el=>el.textContent=t(el.dataset.i18n));
try{document.title=`WarBoost V2.5.25 — ${t("choose_new_password")}`}catch{}

function showStatus(text,ok=false){
  const el=$("#recoveryStatus");
  el.className=`notice${ok?"":" warn"} resetStatus`;
  el.textContent=text;
  el.classList.remove("hidden");
}
function setReady(ready){
  $("#recoveryLoading")?.classList.toggle("hidden",ready);
  $("#recoveryForm")?.classList.toggle("hidden",!ready);
}
function friendly(error){
  const code=String(error?.code||"").toLowerCase();
  const message=String(error?.message||"");
  if(code.includes("expired")||/expired/i.test(message))return t("recovery_link_expired");
  if(code.includes("weak_password")||/password.*weak|should be at least/i.test(message))return t("password_too_weak");
  return message||t("recovery_link_invalid");
}

let cloud=null,recoverySession=null;

async function init(){
  setReady(false);
  try{
    const r=await fetch("/api/cloud-config",{cache:"no-store"});
    const cfg=await r.json().catch(()=>({}));
    if(!r.ok||!cfg?.configured||!cfg?.url||!cfg?.key)throw Object.assign(new Error(t("auth_cloud_missing")),{code:"auth_cloud_missing"});
    cloud=createWarBoostSupabaseAuthClient({url:cfg.url,key:cfg.key});
    const consumed=await cloud.auth.consumeRecoverySessionFromUrl(location.href,{cleanUrl:true});
    if(consumed.error)throw consumed.error;
    recoverySession=consumed.data?.event==="PASSWORD_RECOVERY"?consumed.data?.session||null:null;
    if(recoverySession?.access_token){
      try{sessionStorage.setItem(RECOVERY_MARKER,"1")}catch{}
    }else{
      let recoveryActive=false;
      try{recoveryActive=sessionStorage.getItem(RECOVERY_MARKER)==="1"}catch{}
      if(recoveryActive){
        const existing=await cloud.auth.getSession();
        recoverySession=existing.data?.session||null;
      }
    }
    if(!recoverySession?.access_token)throw Object.assign(new Error(t("recovery_link_invalid")),{code:"recovery_link_invalid"});
    setReady(true);
    $("#recoveryLoading")?.classList.add("hidden");
    $("#newPassword")?.focus();
  }catch(error){
    $("#recoveryLoading")?.classList.add("hidden");
    setReady(false);
    showStatus(friendly(error));
  }
}

$("#savePasswordBtn")?.addEventListener("click",async()=>{
  if(!cloud||!recoverySession?.access_token)return showStatus(t("recovery_link_invalid"));
  const password=$("#newPassword").value;
  const confirm=$("#confirmPassword").value;
  if(password.length<8)return showStatus(t("password_too_short"));
  if(password!==confirm)return showStatus(t("passwords_do_not_match"));
  const btn=$("#savePasswordBtn");btn.disabled=true;btn.textContent=t("saving");
  try{
    const {error}=await cloud.auth.updateUser({password});
    if(error){showStatus(friendly(error));return}
    await cloud.auth.signOut();
    try{sessionStorage.removeItem(RECOVERY_MARKER)}catch{}
    recoverySession=null;
    $("#recoveryForm")?.classList.add("hidden");
    showStatus(t("password_updated_success"),true);
    btn.textContent=t("save_new_password");
  }catch(error){showStatus(friendly(error))}
  finally{btn.disabled=false}
});

$("#backToWarBoost")?.addEventListener("click",e=>{
  e.preventDefault();
  location.assign(new URL("/",location.origin).toString());
});

init();
