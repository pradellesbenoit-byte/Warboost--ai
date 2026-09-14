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

export function canRevealOwnedPrivateState({userId='',stateOwnerId='',betaAllowed=false,consentAccepted=false,betaAccessStatus=''}={}){
  const user=String(userId||'').trim(),owner=String(stateOwnerId||'').trim(),status=String(betaAccessStatus||'').trim().toLowerCase();
  if(!user||!owner||user!==owner)return false;
  if(betaAllowed!==true||consentAccepted!==true)return false;
  if(status==='checking'||DEFINITIVE_ACCESS_STATES.has(status))return false;
  return true;
}

export function deriveRuntimeAccessState({userId='',stateOwnerId='',betaAllowed=false,consentAccepted=false,betaAccessStatus=''}={}){
  const user=String(userId||'').trim(),owner=String(stateOwnerId||'').trim(),status=String(betaAccessStatus||'').trim().toLowerCase();
  const logged=Boolean(user),allowed=betaAllowed===true,consented=consentAccepted===true,ownerMatch=Boolean(user&&owner&&user===owner);
  const privateVisible=canRevealOwnedPrivateState({userId:user,stateOwnerId:owner,betaAllowed:allowed,consentAccepted:consented,betaAccessStatus:status});
  let phase='signed-out';
  if(logged){
    if(status==='checking')phase='syncing';
    else if(DEFINITIVE_ACCESS_STATES.has(status)||!allowed)phase='access-denied';
    else if(!consented)phase='consent-required';
    else if(!ownerMatch)phase='syncing';
    else phase='ready';
  }
  return {logged,allowed,consented,ownerMatch,privateVisible,status,phase};
}
