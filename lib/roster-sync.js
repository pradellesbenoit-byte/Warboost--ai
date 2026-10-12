// Safe local diagnostics: no response messages, profile bodies, headers or identifiers.
const codes=new Set(["AUTH_REQUIRED","AUTH_INVALID","BETA_CONSENT_REQUIRED","BETA_INVITE_REQUIRED",
  "roster_cloud_required","roster_consent_required","roster_beta_required","account_owner_mismatch",
  "profile_owner_mismatch","account_changed","r4_r5_required","roster_canonical_persist_required",
  "profile_write_conflict","alliance_write_conflict","alliance_revision_required","squad_freshness_ambiguous",
  "database_schema_missing","database_permissions_missing","SUPABASE_NOT_CONFIGURED","SUPABASE_USER_NOT_CONFIGURED",
  "SUPABASE_USER_TIMEOUT","SUPABASE_SERVICE_TIMEOUT","request_timeout","network_error","sync_failed",
  "roster_sync_failed","roster_sync_unconfirmed","roster_cloud_service_unavailable","roster_context_unavailable"]);
const records=[];
export function parseRosterConfidence(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=="number"&&typeof value!=="string")return null;
  let raw=typeof value==="string"?value.trim():value;
  if(raw==="")return null;
  const percentage=typeof raw==="string"&&raw.endsWith("%");
  if(typeof raw==="string"){
    raw=raw.replace(/%$/,"").trim().replace(",",".");
    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw))return null;
  }
  const parsed=Number(raw)/(percentage?100:1);
  return Number.isFinite(parsed)&&parsed>=0&&parsed<=1?parsed:null;
}
export function safeRosterDiagnostic(error={},response=null,body=null){
  const raw=error.code||body?.error||(codes.has(error.message)?error.message:null)||(error.name==="TimeoutError"||error.name==="AbortError"?"request_timeout":
    error.name==="TypeError"?"network_error":"roster_sync_failed");
  const code=codes.has(raw)?raw:"roster_sync_failed";
  const http=Number(response?.status||error.http_status);
  const write=body?.roster_confirmation?.write_state||error.write_state;
  const upstream=String(body?.upstream_code||error.upstream_code||"");
  return {at:new Date().toISOString(),endpoint:"/api/sync",http_status:Number.isInteger(http)&&http>=100&&http<=599?http:null,
    code,upstream_code:/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(upstream)?upstream:null,
    write_state:["confirmed","unknown","not_confirmed","not_attempted"].includes(write)?write:"unknown",
    authorization_allowed:typeof body?.authorization?.allowed==="boolean"?body.authorization.allowed:
      typeof error.authorization_allowed==="boolean"?error.authorization_allowed:null};
}
export function recordRosterDiagnostic(diagnostic){
  records.push(safeRosterDiagnostic(diagnostic));if(records.length>5)records.shift();
  return records.at(-1);
}
export function rosterDiagnostics(){return records.map(row=>({...row}))}
export function rosterFailureKind(diagnostic){
  const code=diagnostic.code||"",status=diagnostic.http_status;
  if(["AUTH_REQUIRED","AUTH_INVALID","roster_cloud_required","account_owner_mismatch","profile_owner_mismatch","account_changed"].includes(code)||status===401)return "auth";
  if(code==="BETA_CONSENT_REQUIRED"||code==="roster_consent_required"||status===428)return "consent";
  if(code==="BETA_INVITE_REQUIRED"||code==="roster_beta_required")return "beta";
  if(code==="r4_r5_required"||diagnostic.authorization_allowed===false||status===403)return "role";
  if(["profile_write_conflict","alliance_write_conflict","alliance_revision_required","squad_freshness_ambiguous"].includes(code))return "conflict";
  if(code==="request_timeout"||/TIMEOUT$/.test(code)||status===504)return "timeout";
  if(code==="network_error")return "network";
  if(["roster_canonical_persist_required","roster_sync_unconfirmed","roster_context_unavailable"].includes(code))return "unconfirmed";
  if(status===409)return "conflict";
  if(status===400||status===413||status===422)return "format";
  if(status>=500||["database_schema_missing","database_permissions_missing","roster_cloud_service_unavailable"].includes(code))return "server";
  return "other";
}
export function rosterReplyConfirmed(body){
  if(body?.ok!==true||body?.state?.alliance?.roster_sync_status!=="synced")return false;
  if(body.roster_confirmation)return body.roster_confirmation.requested===true&&body.roster_confirmation.persisted===true;
  // Compatibility with older API versions: their explicit canonical synced state,
  // not merely HTTP 200, is the acknowledgement.
  return body.alliance_pending_source==="canonical";
}
