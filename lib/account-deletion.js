import {createHmac, timingSafeEqual, createHash, randomBytes} from "node:crypto";

export const DELETION_WORD="SUPPRIMER";
const TTL=5*60*1000;
function fail(status,code){return Object.assign(new Error(code),{status,code})}
function sessionKey(req){return createHash("sha256").update(String(req.headers?.authorization||"")).digest("hex")}
function sign(value,secret){return createHmac("sha256",secret).update(value).digest("base64url")}
export function deletionChallenge(userId,req,secret,now=Date.now()){
  if(!secret)throw fail(503,"DELETION_NOT_CONFIGURED");
  const payload=Buffer.from(JSON.stringify({userId,session:sessionKey(req),expires:now+TTL,nonce:randomBytes(24).toString("hex")})).toString("base64url");
  return `${payload}.${sign(payload,secret)}`;
}
export function verifyDeletionChallenge(challenge,userId,req,secret,now=Date.now()){
  if(!secret)throw fail(503,"DELETION_NOT_CONFIGURED");
  const [payload,mac,...extra]=String(challenge||"").split(".");
  if(!payload||!mac||extra.length||payload.length>1500)throw fail(400,"CONFIRMATION_REQUIRED");
  const actual=Buffer.from(mac),expected=Buffer.from(sign(payload,secret));
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw fail(400,"CONFIRMATION_REQUIRED");
  let value;try{value=JSON.parse(Buffer.from(payload,"base64url").toString())}catch{throw fail(400,"CONFIRMATION_REQUIRED")}
  if(value.userId!==userId||value.session!==sessionKey(req)||value.expires<=now||value.expires>now+TTL)throw fail(400,"CONFIRMATION_EXPIRED");
}
// Dependency injection is for isolated tests; the production entrypoint binds only real server helpers.
export function createAccountDeletionHandler({requireUser,prepare,remove,secret=()=>process.env.SESSION_SECRET}){
  return async function handler(req,res){
    res.setHeader("Cache-Control","no-store");
    if(req.method!=="POST")return res.status(405).json({error:"METHOD_NOT_ALLOWED"});
    try{
      const user=await requireUser(req);
      const body=req.body;
      if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(req.query||{}).length)throw fail(400,"INVALID_REQUEST");
      if(Object.keys(body).some(k=>!["action","understood","challenge","confirmation"].includes(k)))throw fail(400,"TARGET_NOT_ALLOWED");
      if(body.understood!==true)throw fail(400,"CONFIRMATION_REQUIRED");
      if(body.action==="prepare"){
        await prepare(user.id);
        return res.status(200).json({challenge:deletionChallenge(user.id,req,secret()),expires_in:300});
      }
      if(body.action!=="delete"||body.confirmation!==DELETION_WORD)throw fail(400,"CONFIRMATION_REQUIRED");
      verifyDeletionChallenge(body.challenge,user.id,req,secret());
      await remove(user.id);
      return res.status(200).json({deleted:true});
    }catch(error){
      const known=["AUTH_REQUIRED","AUTH_INVALID","AUTH_NOT_CONFIGURED","DELETION_NOT_CONFIGURED","DELETION_MIGRATION_REQUIRED","DELETION_SUPPORT_REQUIRED","CONFIRMATION_REQUIRED","CONFIRMATION_EXPIRED","INVALID_REQUEST","TARGET_NOT_ALLOWED"];
      const code=known.includes(error.code)?error.code:"DELETION_UNAVAILABLE";
      return res.status(known.includes(code)?(error.status||503):503).json({error:code,message:"Si la suppression directe est indisponible, contacte le Service client WarBoost depuis ton compte. Aucune suppression complète n’est annoncée en cas d’échec."});
    }
  };
}
