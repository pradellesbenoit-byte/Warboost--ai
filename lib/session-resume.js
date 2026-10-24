function isAuthRejection(error){
  const status=Number(error?.status)||0,code=String(error?.code||"").toLowerCase(),message=String(error?.message||"").toLowerCase();
  return status===401||status===403||/invalid[_ -]?grant|refresh[_ -]?token|token[_ -]?expired|session[_ -]?expired|jwt[_ -]?expired/.test(`${code} ${message}`);
}

export async function verifyExistingSupabaseSession(auth){
  if(typeof auth?.getSession!=="function")return {ok:false,session:null,retryable:true,error:new Error("auth_session_check_unavailable")};
  let current;
  try{
    const result=await auth.getSession();
    if(result?.error)return {ok:false,session:null,retryable:true,error:result.error};
    current=result?.data?.session||null;
  }catch(error){return {ok:false,session:null,retryable:true,error}}
  if(!current?.access_token)return {ok:false,session:null,reauthRequired:true,error:Object.assign(new Error("auth_session_missing"),{code:"auth_session_missing"})};
  if(typeof auth.getUser!=="function")return {ok:false,session:current,retryable:true,error:new Error("auth_user_check_unavailable")};

  let validation;
  try{validation=await auth.getUser(current.access_token)}catch(error){return {ok:false,session:current,retryable:true,error}}
  if(!validation?.error)return {ok:true,session:{...current,user:validation?.data?.user||current.user||null},refreshed:false};
  if(!isAuthRejection(validation.error))return {ok:false,session:current,retryable:true,error:validation.error};
  if(typeof auth.refreshSession!=="function")return {ok:false,session:current,reauthRequired:true,error:validation.error};

  let refreshed;
  try{refreshed=await auth.refreshSession()}catch(error){return {ok:false,session:current,retryable:!isAuthRejection(error),reauthRequired:isAuthRejection(error),error}}
  if(refreshed?.error){
    const rejected=isAuthRejection(refreshed.error);
    return {ok:false,session:refreshed?.data?.session||current,reauthRequired:rejected,retryable:!rejected,error:refreshed.error};
  }
  current=refreshed?.data?.session||current;
  if(!current?.access_token)return {ok:false,session:null,reauthRequired:true,error:Object.assign(new Error("auth_refresh_returned_no_session"),{code:"auth_refresh_returned_no_session"})};
  try{validation=await auth.getUser(current.access_token)}catch(error){return {ok:false,session:current,retryable:true,error}}
  if(!validation?.error)return {ok:true,session:{...current,user:validation?.data?.user||current.user||null},refreshed:true};
  const rejected=isAuthRejection(validation.error);
  return {ok:false,session:current,reauthRequired:rejected,retryable:!rejected,error:validation.error};
}

export async function runAuthenticatedIdleResume({auth,currentSession=null,setSession=()=>{},applySession=async()=>({ok:true}),reconcile=async()=>({ok:false,error:"runtime_reconcile_unavailable"})}={}){
  const checked=await verifyExistingSupabaseSession(auth);
  if(checked.session?.access_token){
    const previousUserId=String(currentSession?.user?.id||""),nextUserId=String(checked.session?.user?.id||"");
    if(previousUserId&&nextUserId&&previousUserId!==nextUserId){
      return {...(await applySession(checked.session)||{ok:true}),sessionChanged:true};
    }
    setSession(checked.session);
  }else if(checked.reauthRequired){
    if(!currentSession?.access_token)return {ok:true,skipped:true,reason:"signed-out"};
    await applySession(null);
    return {ok:true,reauthRequired:true,error:checked.error};
  }else if(!currentSession?.access_token){
    return {ok:true,skipped:true,reason:"signed-out"};
  }
  return await reconcile("idle-resume",{force:true});
}