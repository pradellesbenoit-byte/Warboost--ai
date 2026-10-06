import {createMobileFetch,mobileOrigin,validAuthOrigin,externalUrlAllowed,createSecureSessionStorage} from "./mobile-policy.js";
const packagedNative=Boolean(globalThis.document?.documentElement?.classList.contains("warboost-native"));
export const isNativeWarBoost=packagedNative||Boolean(globalThis.Capacitor?.isNativePlatform?.());
export let mobileSessionStorage;
let authOrigin="",native;
export function configureMobileAuth(url){if(isNativeWarBoost)authOrigin=validAuthOrigin(url)}
export async function clearMobileSession(userId){if(isNativeWarBoost)await mobileSessionStorage.clearUser(userId)}
export async function initializeMobileRuntime(){
  if(!isNativeWarBoost)return;
  if(!globalThis.Capacitor?.isNativePlatform?.())throw new Error("Pont natif indisponible : connexion bloquée, aucun stockage de session en clair.");
  native=await import("./mobile-capacitor.js");
  const secure=native.registerPlugin("WarBoostSecureStorage");
  const {value}=await secure.readSession();
  mobileSessionStorage=createSecureSessionStorage(secure,JSON.parse(value||"{}"));
  // Never use or migrate browser plaintext auth tokens on native builds.
  for(const key of Object.keys(localStorage))if(/^sb-.*-auth-token$/.test(key))localStorage.removeItem(key);
  const original=globalThis.fetch.bind(globalThis);
  const http=native.Capacitor.getPlatform()==="ios"?{request:options=>secure.request(options)}:native.CapacitorHttp;
  globalThis.fetch=createMobileFetch({original,http,localOrigin:mobileOrigin(location.href),getAuthOrigin:()=>authOrigin});
  document.documentElement.classList.add("warboost-native");
  const banner=document.createElement("div");
  banner.id="nativeNetworkStatus";banner.setAttribute("role","status");
  banner.style.cssText="position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#14243d;color:white;padding:10px;text-align:center";
  const show=connected=>{banner.hidden=connected;banner.textContent="Hors ligne : données locales disponibles. Synchronisation, scans et suppression nécessitent une connexion."};
  const ready=()=>{
    document.body.append(banner);
    document.addEventListener("click",async event=>{
      const link=event.target.closest?.("a[href]");if(!link)return;
      const url=new URL(link.href,location.href);
      if(mobileOrigin(url.href)===mobileOrigin(location.href))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(externalUrlAllowed(url.href))await native.Browser.open({url:url.href});
      else alert("Ce lien n’est pas autorisé dans WarBoost mobile.");
    },true);
    for(const input of document.querySelectorAll('input[type="file"][accept*="image"]')){
      const button=document.createElement("button");button.type="button";button.className="secondaryBtn";
      button.textContent="Appareil photo / galerie";
      input.insertAdjacentElement("afterend",button);
      button.onclick=async()=>{
        try{
          const photo=await native.Camera.getPhoto({quality:85,resultType:"base64",source:"PROMPT",saveToGallery:false,promptLabelHeader:"Capture WarBoost",promptLabelPhoto:"Galerie",promptLabelPicture:"Appareil photo"});
          const blob=await (await original(`data:image/${photo.format};base64,${photo.base64String}`)).blob();
          const transfer=new DataTransfer();transfer.items.add(new File([blob],`capture.${photo.format}`,{type:blob.type}));
          input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));
        }catch(error){if(!/cancel/i.test(error.message))alert("Capture impossible : vérifie les permissions appareil photo/galerie.")}
      };
    }
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ready,{once:true});else ready();
  show((await native.Network.getStatus()).connected);
  await native.Network.addListener("networkStatusChange",status=>{
    show(status.connected);window.dispatchEvent(new Event(status.connected?"online":"offline"));
    if(status.connected)window.dispatchEvent(new Event("focus"));
  });
  await native.App.addListener("appStateChange",async({isActive})=>{
    if(isActive){window.dispatchEvent(new Event("focus"));document.dispatchEvent(new Event("visibilitychange"))}
    else try{await mobileSessionStorage.flush()}catch{show(false);banner.textContent="Session non enregistrée : reconnecte-toi après fermeture."}
  });
  await native.App.addListener("backButton",()=>{if(history.length>1)history.back();else native.App.minimizeApp()});
}
// A broken secure store must fail closed, not silently persist tokens in localStorage.
await initializeMobileRuntime();
