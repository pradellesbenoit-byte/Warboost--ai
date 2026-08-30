import {requireUser} from "./auth.js";

export const BETA_RELEASE=true;
export const BETA_CONSENT_VERSION="2026-08-30-v1";

function listEnv(name){
  return [...new Set(String(process.env[name]||"").split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
}
function consentHeader(req){return String(req.headers?.["x-warboost-beta-consent"]||"").trim()}

export function betaConfig(){
  const invitedEmails=listEnv("WARBOOST_BETA_EMAILS");
  return {release:BETA_RELEASE,enforced:invitedEmails.length>0,configured:invitedEmails.length>0,invited_count:invitedEmails.length,consent_version:BETA_CONSENT_VERSION,payments_enabled:false,pro_included:true};
}
export function betaAccessForUser(user){
  const cfg=betaConfig(),email=String(user?.email||"").trim().toLowerCase();
  const allowed=!cfg.enforced||listEnv("WARBOOST_BETA_EMAILS").includes(email);
  return {...cfg,allowed,access_status:allowed?(cfg.enforced?"invited":"preview-open"):"invite-required"};
}
export async function requireBetaUser(req,{consent=false}={}){
  const user=await requireUser(req),beta=betaAccessForUser(user);
  if(beta.enforced&&!beta.allowed)throw Object.assign(new Error("Invitation bêta WarBoost requise"),{status:403,code:"BETA_INVITE_REQUIRED"});
  if(consent&&consentHeader(req)!==BETA_CONSENT_VERSION)throw Object.assign(new Error("Consentement bêta requis avant l'envoi de données"),{status:428,code:"BETA_CONSENT_REQUIRED"});
  return {user,beta};
}
