// Shared by API and browser. Never accept arbitrary messages, URLs or identifiers.
const stages=new Set(["request","configuration","authentication","consent","validation","profile_read",
  "version_check","normalization","history","alliance_reconciliation","profile_write","response","client_transport"]);
const codes=new Set(["save_confirmed","sync_unconfirmed","AUTH_REQUIRED","AUTH_INVALID","AUTH_EXPIRED",
  "AUTH_NOT_CONFIGURED","BETA_CONSENT_REQUIRED","access_denied","profile_write_conflict","profile_revision_required",
  "squad_freshness_ambiguous","database_not_configured","database_permissions_missing","database_schema_missing",
  "database_validation_failed","database_error","state_error","invalid_payload","invalid_json","request_too_large",
  "unsupported_content_type","request_timeout","upstream_timeout","network_error"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function newSaveCorrelation(){return globalThis.crypto.randomUUID();}
export function publicSaveError(error={},status=500){
  const code=String(error?.code||""),sql=String(error?.body?.code||"");
  if(code==="database_permissions_missing"||sql==="42501")return "database_permissions_missing";
  if(code==="database_schema_missing"||["42P01","42703","PGRST204","PGRST205"].includes(sql))return "database_schema_missing";
  if(["23502","23503","23505","23514","22P02"].includes(sql))return "database_validation_failed";
  if(/timeout/i.test(code)||["TimeoutError","AbortError"].includes(error?.name))return "upstream_timeout";
  if(codes.has(code))return code;
  if(/^[0-9A-Z]{5}$/.test(sql)&&sql)return "database_error";
  if(status===401)return "AUTH_INVALID";
  if(status===403||status===428)return status===428?"BETA_CONSENT_REQUIRED":"access_denied";
  if(status===409)return "profile_write_conflict";
  if(status===413)return "request_too_large";
  return "state_error";
}
export function safeSaveDiagnostic(input){
  if(!input||!uuid.test(String(input.correlation_id||""))||!stages.has(input.stage)||!codes.has(input.code)||
    !Number.isFinite(Date.parse(input.at)))return null;
  return {endpoint:"/api/state",method:"POST",stage:input.stage,
    http_status:Number.isInteger(input.http_status)&&input.http_status>=100&&input.http_status<=599?input.http_status:null,
    code:input.code,at:new Date(input.at).toISOString(),correlation_id:input.correlation_id.toLowerCase(),
    write_state:["not_attempted","unknown","confirmed"].includes(input.write_state)?input.write_state:"unknown",
    duration_ms:Number.isFinite(input.duration_ms)?Math.max(0,Math.min(3600000,Math.round(input.duration_ms))):null};
}
export function createSaveDiagnostic({stage="request",status=null,code="state_error",writeState="unknown",
  correlationId=newSaveCorrelation(),started=Date.now()}={}){
  return safeSaveDiagnostic({stage,http_status:status,code,write_state:writeState,
    correlation_id:correlationId,at:new Date().toISOString(),duration_ms:Date.now()-started});
}
