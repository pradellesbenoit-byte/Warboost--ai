export const MOBILE_API_ORIGIN="https://beta.warboost.fr";
export function mobileOrigin(value){
  const url=new URL(value);
  return url.protocol==="capacitor:"?`${url.protocol}//${url.host}`:url.origin;
}
export function mobileRequestUrl(input,localOrigin="https://localhost",authOrigin=""){
  const url=new URL(String(input),localOrigin);
  if(mobileOrigin(url.href)===localOrigin&&url.pathname.startsWith("/api/"))return MOBILE_API_ORIGIN+url.pathname+url.search;
  if(url.origin===MOBILE_API_ORIGIN&&url.pathname.startsWith("/api/"))return url.href;
  if(authOrigin&&url.origin===authOrigin&&/^\/(?:auth|rest)\/v1(?:\/|$)/.test(url.pathname))return url.href;
  if(mobileOrigin(url.href)===localOrigin||url.protocol==="data:"||url.protocol==="blob:")return null;
  throw new Error("Destination réseau interdite dans WarBoost mobile.");
}
export function validAuthOrigin(value){
  const url=new URL(value);
  if(url.protocol!=="https:"||url.port||url.username||url.password||! /^[a-z0-9-]+\.supabase\.(co|in)$/.test(url.hostname))throw new Error("Configuration Auth mobile non autorisée.");
  return url.origin;
}
export function externalUrlAllowed(value){
  try{
    const url=new URL(value);
    return url.protocol==="https:"&&!url.username&&!url.password&&!/(^|\.)(stripe\.com|funfly\.com|lastwar\.com)$/.test(url.hostname);
  }catch{return false}
}
export function createMobileFetch({original,http,localOrigin,getAuthOrigin}){
  return async(input,init={})=>{
    const req=input instanceof Request?input:null;
    const target=mobileRequestUrl(req?.url||input,localOrigin,getAuthOrigin());
    if(!target)return original(input,init);
    const method=String(init.method||req?.method||"GET").toUpperCase();
    const headers=Object.fromEntries(new Headers(init.headers||req?.headers).entries());
    headers["cache-control"]="no-store";
    let body=init.body;
    if(body===undefined&&req&&!["GET","HEAD"].includes(method))body=await req.clone().text();
    if(new URL(target).pathname==="/api/pro"&&method!=="GET")throw new Error("Facturation mobile non intégrée : checkout web interdit.");
    const signal=init.signal||req?.signal;
    if(signal?.aborted)throw new DOMException("Aborted","AbortError");
    const options={url:target,method,headers,responseType:"text",connectTimeout:15000,readTimeout:20000,disableRedirects:true};
    if(body!==undefined)options.data=typeof body==="string"&&headers["content-type"]?.includes("application/json")?JSON.parse(body):body;
    let aborted;
    const abort=new Promise((_,reject)=>{aborted=()=>reject(new DOMException("Aborted","AbortError"));signal?.addEventListener("abort",aborted,{once:true})});
    let reply;
    try{reply=await Promise.race([http.request(options),abort])}finally{signal?.removeEventListener("abort",aborted)}
    if(reply.url&&new URL(reply.url).origin!==new URL(target).origin)throw new Error("Redirection réseau interdite.");
    if(reply.status>=300&&reply.status<400)throw new Error("Redirection réseau interdite.");
    const payload=[204,205].includes(reply.status)?null:typeof reply.data==="string"?reply.data:JSON.stringify(reply.data);
    return new Response(payload,{status:reply.status,headers:reply.headers});
  };
}
export function createSecureSessionStorage(plugin,initial={}){
  const cache=new Map(Object.entries(initial));
  let queue=Promise.resolve(),failure=null;
  function commit(){
    const value=JSON.stringify(Object.fromEntries(cache));
    queue=queue.then(()=>plugin.writeSession({value})).catch(error=>{failure=error});
  }
  return {
    getItem:key=>cache.get(key)||null,
    setItem(key,value){
      if(!/^sb-[a-z0-9-]+-auth-token$/.test(key))throw new Error("Clé de session non autorisée.");
      const session=JSON.parse(value);
      // Only auth session fields; never persist a password or arbitrary provider payload.
      const safe={access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at,expires_in:session.expires_in,token_type:session.token_type,user:session.user?{id:session.user.id,email:session.user.email}:null};
      cache.set(key,JSON.stringify(safe));commit();
    },
    removeItem(key){cache.delete(key);commit()},
    async flush(){await queue;if(failure)throw new Error("Enregistrement sécurisé de session impossible.")},
    async clearUser(userId){for(const [key,value] of cache)if(JSON.parse(value)?.user?.id===userId)cache.delete(key);commit();await this.flush()}
  };
}
