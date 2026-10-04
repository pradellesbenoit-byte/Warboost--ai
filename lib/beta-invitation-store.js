import {fetchWithTimeout} from "./http-timeout.js";

function pick(...keys){for(const key of keys){const v=String(process.env[key]||"").trim();if(v)return v}return ""}
export function betaInvitationError(code){
  const messages={
    BETA_ACCESS_REVOKED:"Cet accès bêta a été révoqué.",
    BETA_INVITE_EXPIRED:"Invitation bêta expirée.",
    BETA_INVITE_OWNER_MISMATCH:"Cette invitation est déjà liée à un autre compte.",
    BETA_CODE_INVALID:"Code d’accès bêta incorrect.",
    BETA_CODE_EXPIRED:"Ce code bêta n’accepte plus de nouveaux comptes.",
    BETA_CODE_FULL:"La limite de testeurs de ce code bêta est atteinte.",
    BETA_ACTIVATION_SCHEMA_MISSING:"L’activation bêta est temporairement indisponible : migration serveur requise."
  };
  return Object.assign(new Error(messages[code]||"Activation bêta indisponible. Réessayez."),{
    code,status:/SCHEMA|DATABASE|TIMEOUT/.test(code)?503:403
  });
}
export async function activateBetaInvitationAtomic(user,{codeVerified=false}={}){
  const url=pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"");
  const key=pick("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)throw betaInvitationError("BETA_ACTIVATION_DATABASE_ERROR");
  const r=await fetchWithTimeout(`${url}/rest/v1/rpc/wb1_activate_beta_invitation`,{
    method:"POST",headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json"},
    body:JSON.stringify({p_user_id:user.id,p_code_verified:Boolean(codeVerified)})
  },6000,{code:"BETA_ACTIVATION_TIMEOUT",message:"Activation bêta indisponible. Réessayez."});
  const body=await r.json().catch(()=>null);
  if(!r.ok){
    const missing=["PGRST202","42883","42P01"].includes(body?.code);
    throw betaInvitationError(missing?"BETA_ACTIVATION_SCHEMA_MISSING":body?.message==="BETA_CODE_FULL"?"BETA_CODE_FULL":"BETA_ACTIVATION_DATABASE_ERROR");
  }
  if(body?.ok!==true||body.allowed!==true)throw betaInvitationError(body?.error||"BETA_ACTIVATION_DATABASE_ERROR");
  return body;
}