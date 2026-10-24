import {fetchWithTimeout} from "./http-timeout.js";

export function env(name){return String(process.env[name]||"").trim()}
export function billingDatabaseConfigured(){return Boolean(env("SUPABASE_URL")&&env("SUPABASE_SERVICE_ROLE_KEY"))}
export function billingError(code,message,status=503){return Object.assign(new Error(message),{code,status})}
export async function billingDb(path,options={}){
  if(!billingDatabaseConfigured())throw billingError("COMMERCIAL_DATABASE_NOT_CONFIGURED","Base de facturation non configurée.");
  const key=env("SUPABASE_SERVICE_ROLE_KEY");
  const r=await fetchWithTimeout(`${env("SUPABASE_URL").replace(/\/$/,"")}/rest/v1/${path}`,{
    ...options,headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json",...options.headers}
  },6000,{code:"COMMERCIAL_DATABASE_TIMEOUT",message:"Base de facturation indisponible."});
  const body=await r.json().catch(()=>null);
  if(!r.ok){
    const missing=["42P01","PGRST205","PGRST202","42703","PGRST204"].includes(body?.code);
    throw billingError(missing?"COMMERCIAL_SCHEMA_MISSING":"COMMERCIAL_DATABASE_ERROR",missing?"Migration de facturation requise.":"Échec de la base de facturation.");
  }
  return body;
}
export function billingRpc(name,params){return billingDb(`rpc/${name}`,{method:"POST",body:JSON.stringify(params)})}
export async function billingRow(table,column,value){
  const rows=await billingDb(`${table}?${column}=eq.${encodeURIComponent(value)}&select=*&limit=1`);
  return rows?.[0]||null;
}
export async function getSubscription(userId){
  if(!userId||!billingDatabaseConfigured())return null;
  try{return await billingRow("warboost_subscriptions","user_id",userId)}
  catch(e){if(e.code==="COMMERCIAL_SCHEMA_MISSING")return null;throw e}
}