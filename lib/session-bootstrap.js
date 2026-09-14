const DEFINITIVE_ACCESS_STATES=new Set(['invite-required','revoked','expired']);

export function shouldPreserveVerifiedSessionAccess({previousUserId='',nextUserId='',cloudProfileVerified=false,betaAllowed=false,betaAccessStatus=''}={}){
  const previous=String(previousUserId||'').trim(),next=String(nextUserId||'').trim(),status=String(betaAccessStatus||'').trim().toLowerCase();
  return Boolean(previous&&next&&previous===next&&cloudProfileVerified===true&&betaAllowed===true&&!DEFINITIVE_ACCESS_STATES.has(status));
}

export function betaStateForSessionBootstrap(previous={}, {preserveVerified=false}={}){
  const prev=previous&&typeof previous==='object'?previous:{};
  if(preserveVerified){
    return {...prev,enforced:true,configured:true,allowed:true,access_status:'accepted',restore_error:null};
  }
  return {...prev,enforced:true,configured:true,allowed:false,access_status:'checking',restore_error:null};
}

export function preserveAllowedAfterTransient({previouslyVerified=false,currentAllowed=false}={}){
  return Boolean(previouslyVerified||currentAllowed);
}

export function restoreAttemptSucceeded(result){
  return Boolean(result?.ok||result?.cloud_empty);
}
