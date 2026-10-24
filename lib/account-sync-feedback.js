// Presentation only. Never persist credentials, raw errors, payloads or this receipt.
import {safeSaveDiagnostic} from "./cloud-save-diagnostic.js";
export function accountSyncErrorKind({status=null,code="",online=true}={}){
  const value=String(code||"");
  if(value==="database_permissions_missing")return "database_permissions";
  if(value==="database_schema_missing")return "database_schema";
  if(["database_error","database_validation_failed"].includes(value))return "database_sql";
  if(status===401||["AUTH_REQUIRED","AUTH_INVALID","AUTH_EXPIRED","auth_refresh_rejected"].includes(value))return "auth";
  if(status===409||["profile_write_conflict","squad_freshness_ambiguous","account_owner_mismatch","profile_owner_mismatch"].includes(value))return "conflict";
  if(status===403||status===428)return "forbidden";
  if(/timeout/i.test(value)||value==="TimeoutError"||value==="AbortError")return "timeout";
  if(online===false||["network_error","TypeError","Failed to fetch","NetworkError","Load failed","offline"].includes(value))return "network";
  if(Number(status)>=500||/^state_http_5\d\d$/.test(value))return "server";
  if(/^state_http_401$/.test(value))return "auth";
  if(/^state_http_(403|428)$/.test(value))return "forbidden";
  if(/^state_http_409$/.test(value))return "conflict";
  return "unconfirmed";
}

export function verifiedAccountStateReply(reply,owner){
  return Boolean(owner&&reply?.ok===true&&reply.state&&typeof reply.state==="object"&&
    String(reply.state.player_id||"")===String(owner)&&
    typeof reply.updated_at==="string"&&Number.isFinite(Date.parse(reply.updated_at)));
}

export function transientCloudFailure(kind){
  return ["network","timeout","server"].includes(kind);
}

// A historical write acknowledgement is not a claim that the current local state
// or current cloud revision is fully synchronized.
export function confirmedWriteReceipt(input){
  const diagnostic=safeSaveDiagnostic(input?.diagnostic);
  if(!diagnostic||diagnostic.code!=="save_confirmed"||diagnostic.write_state!=="confirmed"||
    diagnostic.http_status<200||diagnostic.http_status>=300||
    !Number.isFinite(Date.parse(input?.revision))||!Number.isFinite(Date.parse(input?.at)))return null;
  return {revision:input.revision,at:input.at,diagnostic};
}

export function deviceCloudSaveMetadata(profile,owner){
  if(!owner||String(profile?.player_id||"")!==String(owner))return {};
  const sync=profile.sync||{},out={};
  if(["verified","auth","forbidden","conflict","network","timeout","server","unconfirmed","database_permissions","database_schema","database_sql"].includes(sync.last_save_attempt?.kind)&&
    Number.isFinite(Date.parse(sync.last_save_attempt?.at)))
    out.last_save_attempt={kind:sync.last_save_attempt.kind,at:sync.last_save_attempt.at,
      ...(safeSaveDiagnostic(sync.last_save_attempt.diagnostic)?{diagnostic:safeSaveDiagnostic(sync.last_save_attempt.diagnostic)}:{})};
  if(Number.isFinite(Date.parse(sync.last_confirmed_write_at)))out.last_confirmed_write_at=sync.last_confirmed_write_at;
  const proof=confirmedWriteReceipt(sync.last_confirmed_write_receipt)||
    (sync.last_save_attempt?.kind==="verified"?confirmedWriteReceipt({
      revision:sync.last_confirmed_write_at,at:sync.last_confirmed_write_at,
      diagnostic:sync.last_save_attempt.diagnostic}):null);
  if(proof)out.last_confirmed_write_receipt=proof;
  return out;
}

export function mergeDeviceCloudSaveMetadata(profiles,owner){
  // Explicit nulls prevent cloud-echoed metadata from becoming a local receipt.
  const out={last_save_attempt:null,last_confirmed_write_at:null,last_confirmed_write_receipt:null};
  for(const profile of profiles){
    const next=deviceCloudSaveMetadata(profile,owner);
    const attemptTime=attempt=>Date.parse(attempt?.diagnostic?.at||attempt?.at)||0;
    if(next.last_save_attempt&&attemptTime(next.last_save_attempt)>=attemptTime(out.last_save_attempt))
      out.last_save_attempt=next.last_save_attempt;
    const proof=next.last_confirmed_write_receipt;
    if(proof&&(!out.last_confirmed_write_receipt||
      Date.parse(proof.revision)>Date.parse(out.last_confirmed_write_receipt.revision)||
      (proof.revision===out.last_confirmed_write_receipt.revision&&
       Date.parse(proof.diagnostic.at)>Date.parse(out.last_confirmed_write_receipt.diagnostic.at))))
      out.last_confirmed_write_receipt=proof;
    if(Date.parse(next.last_confirmed_write_at)> (Date.parse(out.last_confirmed_write_at)||0))
      out.last_confirmed_write_at=next.last_confirmed_write_at;
  }
  if(out.last_confirmed_write_receipt)out.last_confirmed_write_at=out.last_confirmed_write_receipt.at;
  return out;
}

export function staleProfileRestore(revision,metadata){
  const proof=confirmedWriteReceipt(metadata?.last_confirmed_write_receipt);
  return Boolean(proof&&(!Number.isFinite(Date.parse(revision))||Date.parse(revision)<Date.parse(proof.revision)));
}

export function verifiedAccountWriteReply(reply,owner){
  return reply?.write_confirmed===true&&verifiedAccountStateReply(reply,owner);
}

// Runtime only: generations and session ownership must never enter persisted profiles.
export function createCloudOperations(){
  let session="",generation=0,latest={},results={};
  return {
    begin(sessionKey,lane){
      if(session!==sessionKey){session=sessionKey;latest={};results={};}
      const operation={sessionKey,lane,generation:++generation};
      latest[lane]=operation.generation;
      return operation;
    },
    complete(operation,result,currentSession){
      if(!operation||session!==currentSession||operation.sessionKey!==currentSession||
        latest[operation.lane]!==operation.generation||results[operation.lane]?.generation===operation.generation)return false;
      results[operation.lane]={...result,generation:operation.generation};
      return true;
    },
    snapshot(currentSession){return session===currentSession?{...results}:{};}
  };
}

export function accountSyncView({sync={},receipt=null,check=null,save=null,confirmed=null,sessionKey="",dirty=false,online=true,revision=null,hasSquadConflict=false}={}){
  // Compatibility with earlier callers; application callers use separate operation lanes.
  const current=Boolean(sessionKey&&receipt?.sessionKey===sessionKey);
  if(current&&!save)save=receipt;
  const historicAttempt=sync.last_save_attempt;
  if(!save&&historicAttempt&&["auth","forbidden","conflict","network","timeout","server","unconfirmed","database_permissions","database_schema","database_sql"].includes(historicAttempt.kind))
    save=historicAttempt;
  const pending=Boolean(sync.pending_cloud_save||dirty);
  let kind;
  if(!online)kind="network";
  else if(hasSquadConflict)kind="conflict";
  else if(save&&save.kind!=="verified")kind=save.kind;
  else if(check?.kind==="conflict")kind="conflict";
  else if(pending)kind=sync.last_error==="squad_freshness_ambiguous"?"conflict":"pending";
  else if(save?.kind==="verified"&&save.revision===revision)kind="verified";
  else kind="unknown";
  const timestamp=sync.last_sync;
  const confirmedAt=confirmed?.revision===revision&&!pending&&!hasSquadConflict&&check?.kind!=="conflict"?confirmed.at:null;
  const proof=[confirmedWriteReceipt(sync.last_confirmed_write_receipt),
    save?.kind==="verified"?confirmedWriteReceipt(save):null,
    historicAttempt?.kind==="verified"?confirmedWriteReceipt({
      revision:sync.last_confirmed_write_at,at:sync.last_confirmed_write_at,diagnostic:historicAttempt.diagnostic}):null]
    .filter(Boolean).sort((a,b)=>Date.parse(b.revision)-Date.parse(a.revision)||Date.parse(b.diagnostic.at)-Date.parse(a.diagnostic.at))[0]||null;
  const squadConflict=hasSquadConflict||(pending&&sync.last_error==="squad_freshness_ambiguous");
  const versionConflict=check?.kind==="conflict"||save?.kind==="conflict"||
    (pending&&sync.last_error==="profile_write_conflict");
  const localKind=!online?"network":squadConflict?"squad_conflict":versionConflict?"version_conflict":
    save&&save.kind!=="verified"?save.kind:pending?"pending":"clear";
  return {kind,pending,canCheck:true,
    localKind,lastConfirmedAt:proof?.at||null,lastConfirmedRevision:proof?.revision||null,
    checkKind:check?.kind||null,saveKind:save?.kind||null,
    saveDiagnostic:safeSaveDiagnostic(save?.diagnostic||historicAttempt?.diagnostic),
    attemptAt:Number.isFinite(Date.parse(save?.attemptAt||historicAttempt?.at))?save?.attemptAt||historicAttempt.at:null,
    confirmedAt:typeof confirmedAt==="string"&&Number.isFinite(Date.parse(confirmedAt))?confirmedAt:null,
    lastKnown:typeof timestamp==="string"&&Number.isFinite(Date.parse(timestamp))?timestamp:null};
}
