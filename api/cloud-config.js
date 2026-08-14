export default function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({configured:false,error:"Méthode non autorisée."});
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  res.setHeader("Cache-Control","no-store");
  if(!url||!key)return res.status(503).json({configured:false,error:"Configuration Supabase manquante."});
  return res.status(200).json({configured:true,url,key});
}
