function json(res,status,data){
  res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  return res.status(status).json(data);
}
function env(){
  return {
    url:process.env.SUPABASE_URL,
    secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}
function adminHeaders(){
  const {secret}=env();
  const h={apikey:secret,Accept:"application/json"};
  if(secret && !String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}
function activeNow(row,now){
  const start=row?.starts_at?Date.parse(row.starts_at):null;
  const end=row?.ends_at?Date.parse(row.ends_at):null;
  return (!start||start<=now)&&(!end||end>=now);
}
export default async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{error:"Méthode non autorisée."});
  const {url,secret}=env();
  if(!url||!secret)return json(res,503,{error:"Live Content WarBoost non configuré."});
  try{
    const select="content_key,category,scope,title,summary,body,payload,priority,starts_at,ends_at,source_label,source_url,version,published_at,updated_at";
    const endpoint=`${url}/rest/v1/warboost_live_content?is_active=eq.true&select=${encodeURIComponent(select)}&order=priority.asc,published_at.desc`;
    const r=await fetch(endpoint,{headers:adminHeaders()});
    const data=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error(data?.message||`Supabase ${r.status}`);
    const now=Date.now();
    let items=(Array.isArray(data)?data:[]).filter(x=>activeNow(x,now));
    const requested=String(req.query?.category||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(requested.length){
      const wanted=new Set(requested);
      items=items.filter(x=>wanted.has(String(x.category||"").toLowerCase()));
    }
    const updated=items.reduce((m,x)=>{
      const d=Date.parse(x.updated_at||x.published_at||0)||0;
      return d>m?d:m;
    },0);
    return json(res,200,{
      ok:true,
      version:"19.3",
      updated_at:updated?new Date(updated).toISOString():new Date().toISOString(),
      count:items.length,
      items
    });
  }catch(e){
    console.error("WarBoost live-content",e);
    return json(res,502,{error:"Impossible de charger le contenu Live WarBoost."});
  }
}
