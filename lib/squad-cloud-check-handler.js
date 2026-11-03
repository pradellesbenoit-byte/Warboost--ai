import {SQUAD_CLOUD_CHECK_SCHEMA,projectSquadCloudCheckRecord} from "./squad-cloud-check.js";

const header=(req,name)=>req?.headers?.[name]||req?.headers?.[name.toLowerCase()]||
  (name==="authorization"?req?.headers?.Authorization:null)||"";
const send=(res,status,body)=>{
  if(typeof res.status==="function")res.status(status);
  else res.statusCode=status;
  if(typeof res.setHeader==="function"){
    res.setHeader("Cache-Control","no-store, max-age=0");
    res.setHeader("Vary","Authorization");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    if(status===405)res.setHeader("Allow","GET");
  }
  return typeof res.json==="function"?res.json(body):res.end?.(JSON.stringify(body));
};
const deniedQueryKeys=["player_id","user_id","owner","identity","restore","squad_id","squad"];

export function createSquadCloudCheckHandler({requireUser,readForUser,consentVersion}={}){
  if(typeof requireUser!=="function"||typeof readForUser!=="function")
    throw new TypeError("Squad cloud check dependencies are required");
  return async function squadCloudCheckHandler(req,res){
    const query=req?.query||{};
    if((req?.method||"GET").toUpperCase()!=="GET")
      return send(res,405,{ok:false,code:"READ_ONLY_GET_REQUIRED"});
    if(deniedQueryKeys.some(key=>Object.prototype.hasOwnProperty.call(query,key)))
      return send(res,400,{ok:false,code:"FIXED_SQUAD_SCOPE_REQUIRED"});
    const authorization=String(header(req,"authorization"));
    const match=authorization.match(/^Bearer\s+(.+)$/i);
    if(!match)return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
    const token=match[1].trim();
    if(!token)return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
    if(header(req,"x-warboost-beta-consent")!==consentVersion)
      return send(res,428,{ok:false,code:"CONSENT_REQUIRED"});
    try{
      const user=await requireUser(req);
      const owner=String(user?.id||"");
      if(!owner)return send(res,401,{ok:false,code:"AUTH_REQUIRED"});
      const row=await readForUser(owner,token);
      const profilePresent=Boolean(row&&typeof row==="object");
      const checkedAt=new Date().toISOString();
      const cloud=projectSquadCloudCheckRecord({
        squads:row?.squads,
        exclusive_weapons:row?.exclusive_weapons
      },{profilePresent,revision:row?.updated_at});
      return send(res,200,{
        ok:true,read_only:true,schema:SQUAD_CLOUD_CHECK_SCHEMA,
        checked_at:checkedAt,profile_present:profilePresent,
        revision:cloud.revision,cloud
      });
    }catch(error){
      const status=Number(error?.status);
      const safeStatus=[401,403,409,428,503,504].includes(status)?status:503;
      const code=safeStatus===401?"AUTH_REQUIRED":safeStatus===403?"ACCESS_DENIED":
        safeStatus===409?"CLOUD_CONFLICT":safeStatus===428?"CONSENT_REQUIRED":
          safeStatus===504?"CLOUD_TIMEOUT":"CLOUD_READ_UNAVAILABLE";
      return send(res,safeStatus,{ok:false,code});
    }
  };
}
