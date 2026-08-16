function send(res,status,data){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  return res.status(status).json(data);
}

function sendPublic(res,status,data){
  res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  return res.status(status).json(data);
}
function env(){return {url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY}}
function serviceHeaders(extra={}){
  const {secret}=env();
  const h={apikey:secret,Accept:"application/json",...extra};
  if(secret && !String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;
  return h;
}
function bearer(req){const v=String(req.headers?.authorization||"");return v.toLowerCase().startsWith("bearer ")?v.slice(7).trim():""}
async function currentUser(req){
  const {url,secret}=env();const token=bearer(req);if(!url||!secret||!token)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:secret,Authorization:`Bearer ${token}`,Accept:"application/json"}});
  if(!r.ok)return null;return await r.json().catch(()=>null);
}
async function adminForUser(user){
  if(!user?.id)return null;const {url}=env();
  const r=await fetch(`${url}/rest/v1/warboost_admins?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,{headers:serviceHeaders()});
  if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
async function requireAdmin(req,res){
  const user=await currentUser(req);if(!user){send(res,401,{error:"Connecte-toi à ton compte WarBoost."});return null}
  const admin=await adminForUser(user);if(!admin){send(res,403,{error:"Accès Live Admin refusé."});return null}
  return {user,role:admin.role||"admin"};
}
function txt(v,max=6000){return String(v??"").trim().slice(0,max)}
function bool(v){return v===true||v===1||v==="1"||v==="true"}
function iso(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()}
function slug(v){return txt(v,120).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,90)}
function validSourceUrl(v){const s=txt(v,500);if(!s)return null;try{const u=new URL(s);return ["http:","https:"].includes(u.protocol)?u.toString():null}catch{return null}}
const categories=new Set(["general","season","vs","hero","event","r5r4"]);
async function getExisting(id){
  if(!id)return null;const {url}=env();const r=await fetch(`${url}/rest/v1/warboost_live_content?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,{headers:serviceHeaders()});
  if(!r.ok)return null;const rows=await r.json().catch(()=>[]);return Array.isArray(rows)&&rows[0]?rows[0]:null;
}
async function listItems(){
  const {url}=env();const select="id,content_key,category,scope,title,summary,body,payload,priority,is_active,starts_at,ends_at,source_label,source_url,version,published_at,updated_at";
  const r=await fetch(`${url}/rest/v1/warboost_live_content?select=${encodeURIComponent(select)}&order=updated_at.desc`,{headers:serviceHeaders()});
  if(!r.ok)throw new Error(`Supabase ${r.status}`);return await r.json().catch(()=>[]);
}
export default async function handler(req,res){
  const {url,secret}=env();if(!url||!secret)return send(res,503,{error:"Live Admin non configuré."});

  // V19.5.1: contenu Live public servi par la même Serverless Function
  // afin de rester sous la limite du plan Vercel Hobby.
  if(req.method==="GET" && String(req.query?.mode||"")==="public"){
    try{
      const select="content_key,category,scope,title,summary,body,payload,priority,starts_at,ends_at,source_label,source_url,version,published_at,updated_at";
      const endpoint=`${url}/rest/v1/warboost_live_content?is_active=eq.true&select=${encodeURIComponent(select)}&order=priority.asc,published_at.desc`;
      const r=await fetch(endpoint,{headers:serviceHeaders()});
      const data=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error(data?.message||`Supabase ${r.status}`);

      const now=Date.now();
      let items=(Array.isArray(data)?data:[]).filter(row=>{
        const start=row?.starts_at?Date.parse(row.starts_at):null;
        const end=row?.ends_at?Date.parse(row.ends_at):null;
        return (!start||start<=now)&&(!end||end>=now);
      });

      const updated=items.reduce((m,x)=>{
        const d=Date.parse(x.updated_at||x.published_at||0)||0;
        return d>m?d:m;
      },0);

      return sendPublic(res,200,{
        ok:true,
        version:"19.5.1",
        updated_at:updated?new Date(updated).toISOString():new Date().toISOString(),
        count:items.length,
        items
      });
    }catch(e){
      console.error("WarBoost live public",e);
      return sendPublic(res,502,{error:"Impossible de charger le contenu Live WarBoost."});
    }
  }

  const auth=await requireAdmin(req,res);if(!auth)return;
  if(req.method==="GET"){
    if(String(req.query?.mode||"")==="me")return send(res,200,{ok:true,is_admin:true,role:auth.role});
    try{return send(res,200,{ok:true,role:auth.role,items:await listItems()})}catch(e){console.error("live-admin list",e);return send(res,502,{error:"Impossible de charger les contenus Live."})}
  }
  if(req.method==="POST"){
    try{
      const b=req.body&&typeof req.body==="object"?req.body:{};const id=txt(b.id,80)||null;const existing=await getExisting(id);
      const title=txt(b.title,160);if(!title)return send(res,400,{error:"Le titre est obligatoire."});
      const category=categories.has(txt(b.category,30))?txt(b.category,30):"general";
      const key=txt(b.content_key,120)||existing?.content_key||`admin_${slug(title)}_${Date.now().toString().slice(-6)}`;
      const oldPayload=existing?.payload&&typeof existing.payload==="object"?existing.payload:{};
      const payload={...oldPayload,icon:txt(b.icon,12)||oldPayload.icon||"🔄",badge:txt(b.badge,32)||oldPayload.badge||category.toUpperCase()};
      const row={content_key:key,category,scope:"global",title,summary:txt(b.summary,500)||null,body:txt(b.body,6000)||null,payload,priority:Math.min(999,Math.max(1,Number(b.priority)||50)),is_active:bool(b.is_active),starts_at:iso(b.starts_at),ends_at:iso(b.ends_at),source_label:txt(b.source_label,120)||"WarBoost Live",source_url:validSourceUrl(b.source_url),version:Number(existing?.version||0)+1};
      let r;
      if(existing){
        r=await fetch(`${url}/rest/v1/warboost_live_content?id=eq.${encodeURIComponent(existing.id)}`,{method:"PATCH",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"return=representation"}),body:JSON.stringify(row)});
      }else{
        r=await fetch(`${url}/rest/v1/warboost_live_content`,{method:"POST",headers:serviceHeaders({"Content-Type":"application/json",Prefer:"return=representation"}),body:JSON.stringify(row)});
      }
      const data=await r.json().catch(()=>[]);if(!r.ok)throw new Error(data?.message||`Supabase ${r.status}`);
      return send(res,200,{ok:true,item:Array.isArray(data)?data[0]:data});
    }catch(e){console.error("live-admin save",e);return send(res,502,{error:"Impossible d’enregistrer ce contenu Live."})}
  }
  if(req.method==="DELETE"){
    if(!["owner","admin"].includes(auth.role))return send(res,403,{error:"Seul un administrateur peut supprimer définitivement un contenu."});
    const id=txt(req.query?.id,80);if(!id)return send(res,400,{error:"Identifiant manquant."});
    try{const r=await fetch(`${url}/rest/v1/warboost_live_content?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:serviceHeaders({Prefer:"return=representation"})});const data=await r.json().catch(()=>[]);if(!r.ok)throw new Error(data?.message||`Supabase ${r.status}`);return send(res,200,{ok:true,deleted:Array.isArray(data)?data.length:1})}catch(e){console.error("live-admin delete",e);return send(res,502,{error:"Suppression impossible."})}
  }
  return send(res,405,{error:"Méthode non autorisée."});
}
