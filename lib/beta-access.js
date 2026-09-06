import {requireUser} from "./auth.js";

export const BETA_RELEASE=true;
export const BETA_CONSENT_VERSION="2026-09-05-safe-launch-v2";

function pick(...names){
  for(const name of names){
    const value=process.env[name];
    if(typeof value==="string"&&value.trim())return value.trim();
  }
  return "";
}
function listEnv(name){
  return [...new Set(String(process.env[name]||"").split(/[;,\n]/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
}
function emailOf(value){return String(value||"").trim().toLowerCase()}
function consentHeader(req){return String(req.headers?.["x-warboost-beta-consent"]||"").trim()}
function sbUrl(){return pick("SUPABASE_URL","NEXT_PUBLIC_SUPABASE_URL","VITE_SUPABASE_URL").replace(/\/$/,"")}
function serviceKey(){return pick("SUPABASE_SERVICE_ROLE_KEY")}
function databaseConfigured(){return Boolean(sbUrl()&&serviceKey())}
function supportAdmins(){return listEnv("WARBOOST_SUPPORT_ADMINS")}
function legacyInvites(){return listEnv("WARBOOST_BETA_EMAILS")}
function missingInviteTable(body,status){
  const raw=`${status||""} ${body?.code||""} ${body?.message||""} ${typeof body==="string"?body:""}`.toLowerCase();
  return /42p01|pgrst205|could not find the table|relation .*wb1_beta_invites.* does not exist/.test(raw);
}
async function parseJson(r){const text=await r.text();try{return text?JSON.parse(text):null}catch{return text}}
async function inviteRest(path,options={}){
  if(!databaseConfigured())return {available:false,rows:[],missing:false,error:"SUPABASE_SERVICE_ROLE_KEY_MISSING"};
  try{
    const r=await fetch(`${sbUrl()}/rest/v1/${path}`,{
      ...options,
      headers:{apikey:serviceKey(),authorization:`Bearer ${serviceKey()}`,"content-type":"application/json",...(options.headers||{})}
    });
    const body=await parseJson(r);
    if(!r.ok){
      if(missingInviteTable(body,r.status))return {available:false,rows:[],missing:true,error:"BETA_INVITES_SCHEMA_MISSING"};
      return {available:false,rows:[],missing:false,error:"BETA_INVITES_DATABASE_ERROR",status:r.status,body};
    }
    return {available:true,rows:Array.isArray(body)?body:[],missing:false,error:null};
  }catch(e){return {available:false,rows:[],missing:false,error:"BETA_INVITES_DATABASE_UNREACHABLE",message:e?.message||""}}
}
function inviteActive(row){
  if(!row||!["pending","accepted"].includes(String(row.status||"").toLowerCase()))return false;
  if(row.expires_at){const expiry=Date.parse(row.expires_at);if(Number.isFinite(expiry)&&expiry<=Date.now())return false;}
  return true;
}
async function findInvite(email){
  const safe=emailOf(email);if(!safe)return {available:databaseConfigured(),row:null,missing:false,error:null};
  const q=`wb1_beta_invites?email=eq.${encodeURIComponent(safe)}&select=*&limit=1`,out=await inviteRest(q);
  return {...out,row:out.rows?.[0]||null};
}
async function markAccepted(row,user){
  if(!row?.id||String(row.status)!=="pending")return;
  const now=new Date().toISOString(),payload={status:"accepted",accepted_at:row.accepted_at||now,accepted_user_id:String(user?.id||"")||null,updated_at:now};
  await inviteRest(`wb1_beta_invites?id=eq.${encodeURIComponent(row.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
}

export function betaConfig(){
  const legacy=legacyInvites(),admins=supportAdmins();
  return {
    release:BETA_RELEASE,
    enforced:true,
    configured:Boolean(legacy.length||admins.length||databaseConfigured()),
    invited_count:legacy.length,
    consent_version:BETA_CONSENT_VERSION,
    payments_enabled:false,
    pro_included:true,
    invite_source:databaseConfigured()?"database+legacy":"legacy-env",
    database_invites_available:databaseConfigured(),
    legacy_allowlist_count:legacy.length
  };
}

export async function betaConfigAsync(){
  const cfg=betaConfig(),probe=await inviteRest("wb1_beta_invites?select=id,status&limit=1000"),activeRows=probe.available?probe.rows.filter(inviteActive):[];
  const legacy=new Set(legacyInvites()),admins=supportAdmins();
  return {
    ...cfg,
    configured:Boolean(probe.available||legacy.size||admins.length),
    invited_count:probe.available?activeRows.length:legacy.size,
    database_invites_available:probe.available,
    database_invites_schema_missing:Boolean(probe.missing),
    invite_source:probe.available?(legacy.size?"database+legacy":"database"):(legacy.size?"legacy-env":"not-configured")
  };
}

// Legacy synchronous helper retained for compatibility with older modules.
// V2.5.26 server routes should prefer betaAccessForUserAsync().
export function betaAccessForUser(user){
  const cfg=betaConfig(),email=emailOf(user?.email),admin=supportAdmins().includes(email),legacy=legacyInvites().includes(email),allowed=Boolean(email&&(admin||legacy));
  return {...cfg,allowed,access_status:allowed?(admin?"support-admin":"legacy-invited"):(cfg.configured?"invite-required":"invite-setup-required")};
}

export async function betaAccessForUserAsync(user){
  // Per-user access deliberately avoids scanning the entire invite table.
  // Health/admin screens may use betaConfigAsync() for aggregate counts.
  const base=betaConfig(),email=emailOf(user?.email),admin=supportAdmins().includes(email),legacy=legacyInvites().includes(email),lookup=await findInvite(email),row=lookup.row;
  const cfg={...base,database_invites_available:lookup.available,database_invites_schema_missing:Boolean(lookup.missing),invite_source:lookup.available?(legacyInvites().length?"database+legacy":"database"):(legacyInvites().length?"legacy-env":"not-configured")};
  let allowed=false,source="none",reason="invite-required";

  // Support admins are a bootstrap path so the invite manager can never lock itself out.
  if(admin){allowed=true;source="support-admin";reason="support-admin";}
  else if(row){
    if(inviteActive(row)){allowed=true;source="database";reason=String(row.status||"pending");}
    else{allowed=false;source="database";reason=String(row.status||"revoked")==="revoked"?"revoked":"expired";}
  }else if(legacy){allowed=true;source="legacy-env";reason="legacy-invited";}

  // A database revocation/expiry deliberately overrides a legacy allowlist entry.
  if(row&&!inviteActive(row)&&!admin){allowed=false;source="database";}
  if(allowed&&row?.status==="pending")await markAccepted(row,user);

  const configured=Boolean(cfg.configured||lookup.available||admin||legacy);
  return {
    ...cfg,
    configured,
    allowed,
    invite_source:source,
    invite_status:row?.status||null,
    access_status:!configured?"invite-setup-required":allowed?(source==="database"?(row?.status==="pending"?"invited":"accepted"):reason):reason
  };
}

export async function requireBetaUser(req,{consent=false}={}){
  const user=await requireUser(req),beta=await betaAccessForUserAsync(user);
  if(!beta.configured)throw Object.assign(new Error("Le registre d’invitations WarBoost doit être configuré avant l’ouverture de la bêta."),{status:503,code:"BETA_INVITES_NOT_CONFIGURED"});
  if(!beta.allowed)throw Object.assign(new Error(beta.access_status==="revoked"?"Accès bêta WarBoost révoqué":beta.access_status==="expired"?"Invitation bêta WarBoost expirée":"Invitation bêta WarBoost requise"),{status:403,code:beta.access_status==="revoked"?"BETA_INVITE_REVOKED":beta.access_status==="expired"?"BETA_INVITE_EXPIRED":"BETA_INVITE_REQUIRED"});
  if(consent&&consentHeader(req)!==BETA_CONSENT_VERSION)throw Object.assign(new Error("Consentement bêta requis avant l'envoi de données"),{status:428,code:"BETA_CONSENT_REQUIRED"});
  return {user,beta};
}
