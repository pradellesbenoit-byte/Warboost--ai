function json(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
function env(){return {url:process.env.SUPABASE_URL,pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY}}
async function authUser(req){
  const {url,pub}=env(); if(!url||!pub)return null;
  const h=req.headers?.authorization||req.headers?.Authorization||""; const m=String(h).match(/^Bearer\s+(.+)$/i); if(!m)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}}); if(!r.ok)return null; return r.json();
}
function outputText(data){if(data?.output_text)return data.output_text;const out=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);return out.join("\n")}
function parseJson(text){const t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();return JSON.parse(t)}
const LANGS={"es":"Spanish","de":"German","ja":"Japanese","zh":"Simplified Chinese","ar":"Arabic","en":"British English","en-us":"American English"};
export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY)return json(res,503,{error:"Translation service not configured"});
  const user=await authUser(req).catch(()=>null); if(!user)return json(res,401,{error:"Sign in to load the full language pack."});
  const target=String(req.body?.target_language||"").toLowerCase(); if(!LANGS[target])return json(res,400,{error:"Unsupported language"});
  const texts=Array.isArray(req.body?.texts)?req.body.texts:[]; if(!texts.length||texts.length>70)return json(res,400,{error:"Send 1 to 70 strings"});
  const clean=texts.map(x=>String(x??"").slice(0,1200)); const chars=clean.reduce((n,x)=>n+x.length,0); if(chars>30000)return json(res,413,{error:"Translation batch too large"});
  if(target==="en-us")return json(res,200,{translations:clean});
  const model=process.env.OPENAI_TRANSLATION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:controller.signal,headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({
      model,reasoning:{effort:"minimal"},
      instructions:`Translate WarBoost mobile-game UI text into ${LANGS[target]}. Preserve emojis, numbers, hero names, product names, R5/R4, VS, PRO, WarBoost and Last War. Preserve placeholders and punctuation. Do not add explanations. Return JSON only with exactly one translation for every input string, in the same order. For Arabic use natural Modern Standard Arabic suitable for a game interface.`,
      input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({texts:clean})}]}],
      text:{format:{type:"json_schema",name:"translations",strict:true,schema:{type:"object",additionalProperties:false,properties:{translations:{type:"array",items:{type:"string"},minItems:clean.length,maxItems:clean.length}},required:["translations"]}}}
    })});
    const raw=await r.text(); let data={}; try{data=raw?JSON.parse(raw):{}}catch{data={}}
    if(!r.ok)return json(res,502,{error:"Translation engine unavailable"});
    const parsed=parseJson(outputText(data)); if(!Array.isArray(parsed?.translations)||parsed.translations.length!==clean.length)return json(res,502,{error:"Invalid translation response"});
    return json(res,200,{translations:parsed.translations});
  }catch(e){return json(res,e?.name==="AbortError"?504:500,{error:"Translation temporarily unavailable"})}finally{clearTimeout(timer)}
}
