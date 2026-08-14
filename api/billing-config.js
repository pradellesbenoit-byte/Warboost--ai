export default function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Méthode non autorisée."});
  const configured=!!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_PRO_MONTHLY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({configured,priceLabel:process.env.STRIPE_PRO_PRICE_LABEL||"4,99 € / mois"});
}
