// Isolated PostgreSQL + fake provider. NO outbound fetch and NO real secrets are used.
import {PGlite} from "@electric-sql/pglite";
import fs from "node:fs";
import crypto from "node:crypto";
export const userA="10000000-0000-4000-8000-000000000001";
export const userB="10000000-0000-4000-8000-000000000002";
export const userBeta="10000000-0000-4000-8000-000000000003";
export const userFree="10000000-0000-4000-8000-000000000004";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
export async function billingFixture(){
  const pg=new PGlite();
  await pg.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table public.wb1_beta_invites(id uuid primary key default gen_random_uuid(),email text unique,status text,
      invited_at timestamptz default now(),accepted_user_id text,expires_at timestamptz,accepted_at timestamptz,updated_at timestamptz);`);
  for(const [id,email] of [[userA,"a@example.test"],[userB,"b@example.test"],[userBeta,"beta@example.test"],[userFree,"free@example.test"]])
    await pg.query("insert into auth.users(id,email,created_at) values($1,$2,now()-interval '1 day')",[id,email]);
  await pg.query("insert into wb1_beta_invites(email,status,invited_at,accepted_user_id) values('beta@example.test','accepted',now()-interval '1 day',$1)",[userBeta]);
  const migrations=["supabase/migration_v2_5_28_hf8_commercial_readiness.sql","supabase/migration_v2_5_32_stripe_test_01.sql","supabase/migration_v2_5_32_stripe_test_02_beta_cohort.sql"];
  for(const path of migrations)await pg.exec(fs.readFileSync(path,"utf8"));
  const oldEnv={...process.env},oldFetch=globalThis.fetch;
  Object.assign(process.env,{WARBOOST_COMMERCIAL_MODE:"test",WARBOOST_APP_URL:"https://beta.warboost.fr",STRIPE_SECRET_KEY:"sk_test_fixture_only",
    STRIPE_WEBHOOK_SECRET:"whsec_fixture_only",STRIPE_PRICE_PRO_MONTHLY:"price_pro_test",STRIPE_PRODUCT_PRO:"prod_pro_test",
    SUPABASE_URL:"https://fixture.invalid",SUPABASE_ANON_KEY:"anon-fixture",SUPABASE_SERVICE_ROLE_KEY:"service-fixture",WARBOOST_BETA_EMAILS:"",WARBOOST_SUPPORT_ADMINS:""});
  const fixture={pg,migrations,calls:[],customers:new Map(),subscriptions:new Map(),sessions:new Map(),idempotency:new Map(),
    failDb:false,failApplyOnce:false,failCheckoutOnce:false,priceOverride:{},productOverride:{},providerLive:false,card:"accepted"};
  fixture.price=()=>({id:"price_pro_test",object:"price",active:true,livemode:false,product:"prod_pro_test",unit_amount:499,currency:"eur",type:"recurring",
    billing_scheme:"per_unit",recurring:{interval:"month",interval_count:1,usage_type:"licensed"},...fixture.priceOverride});
  fixture.sub=(customer,id="sub_test_one",status="active")=>({id,object:"subscription",livemode:false,customer,status,
    metadata:{},current_period_end:Math.floor(Date.now()/1000)+86400,cancel_at_period_end:false,
    items:{data:[{quantity:1,price:fixture.price()}]}});
  fixture.rpc=async(name,args)=>{
    const names=Object.keys(args),params=Object.values(args);
    const result=await pg.query(`select public.${name}(${names.map((n,i)=>`${n} => $${i+1}`).join(",")}) as result`,params);
    return result.rows[0]?.result;
  };
  globalThis.fetch=async(input,opts={})=>{
    const u=new URL(String(input));
    fixture.calls.push({host:u.hostname,path:u.pathname,opts});
    if(u.hostname==="fixture.invalid"){
      if(fixture.failDb)return json({code:"DB_UNAVAILABLE"},503);
      if(u.pathname==="/auth/v1/user"){
        const id=String(opts.headers?.authorization||"").replace("Bearer ","");
        const rows=(await pg.query("select * from auth.users where id=$1",[id])).rows;
        return rows[0]?json(rows[0]):json({},401);
      }
      try{
        const rpc=u.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
        if(rpc){
          if(fixture.failApplyOnce&&rpc[1]==="warboost_apply_billing_snapshot"){fixture.failApplyOnce=false;return json({code:"DB_UNAVAILABLE"},503)}
          return json(await fixture.rpc(rpc[1],JSON.parse(opts.body)));
        }
        const table=u.pathname.split("/").pop();
        if(table==="wb1_profiles")return json([]);
        if(!/^warboost_[a-z_]+$|^wb1_beta_invites$/.test(table))throw Error("Unexpected fixture table");
        const filters=[...u.searchParams].filter(([k])=>!["select","limit"].includes(k)),values=[];
        const where=filters.map(([key,v],i)=>{
          if(!/^[a-z_]+$/.test(key)||!v.startsWith("eq."))throw Error("Unexpected fixture filter");
          values.push(v.slice(3));return `${key}=$${i+1}`;
        }).join(" and ");
        if(opts.method==="PATCH"){
          const body=JSON.parse(opts.body),keys=Object.keys(body),args=[...Object.values(body),...values];
          await pg.query(`update ${table} set ${keys.map((k,i)=>`${k}=$${i+1}`).join(",")} where ${filters.map(([k],i)=>`${k}=$${keys.length+i+1}`).join(" and ")}`,args);
          return json(null);
        }
        const rows=(await pg.query(`select * from ${table}${where?` where ${where}`:""} limit ${Number(u.searchParams.get("limit")||1000)}`,values)).rows;
        return json(rows);
      }catch(e){return json({code:e.code||"FIXTURE_DATABASE_ERROR"},503)}
    }
    if(u.hostname!=="api.stripe.com")throw Error("OUTBOUND_NETWORK_FORBIDDEN");
    const path=u.pathname.replace("/v1/",""),params=new URLSearchParams(opts.body||"");
    const key=opts.headers?.["Idempotency-Key"];
    if(key&&fixture.idempotency.has(key))return json(fixture.idempotency.get(key));
    let out;
    if(path==="prices/price_pro_test")out=fixture.price();
    else if(path==="products/prod_pro_test")out={id:"prod_pro_test",object:"product",livemode:false,active:true,...fixture.productOverride};
    else if(path==="customers"){
      const id=`cus_test_${fixture.customers.size+1}`;out={id,object:"customer",livemode:false};fixture.customers.set(id,out);
    }else if(path==="subscriptions"){
      out={object:"list",has_more:false,data:[...fixture.subscriptions.values()].filter(s=>s.customer===u.searchParams.get("customer"))};
    }else if(path.startsWith("subscriptions/"))out=fixture.subscriptions.get(path.split("/")[1]);
    else if(path==="checkout/sessions"){
      const id=`cs_test_${fixture.sessions.size+1}`;out={id,object:"checkout.session",livemode:false,url:`https://checkout.stripe.com/c/pay/${id}`,
        customer:params.get("customer"),client_reference_id:params.get("client_reference_id"),status:"open",expires_at:Number(params.get("expires_at"))};
      fixture.sessions.set(id,out);
      if(key)fixture.idempotency.set(key,out);
      if(fixture.failCheckoutOnce){fixture.failCheckoutOnce=false;throw Error("SIMULATED_CONNECTION_LOSS_AFTER_STRIPE_CREATION")}
    }else if(path==="billing_portal/sessions")out={id:"bps_test",object:"billing_portal.session",livemode:false,url:"https://billing.stripe.com/p/session/test"};
    else throw Error(`Unexpected provider fixture endpoint ${path}`);
    if(!out)return json({error:{message:"Fixture object missing"}},404);
    if(fixture.providerLive)out={...out,livemode:true};
    if(key)fixture.idempotency.set(key,out);
    return json(out);
  };
  fixture.event=(type,obj,created=Math.floor(Date.now()/1000),id=`evt_test_${crypto.randomUUID().replaceAll("-","")}`)=>({id,type,created,livemode:false,data:{object:obj}});
  fixture.sign=event=>{
    const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000);
    return [raw,`t=${t},v1=${crypto.createHmac("sha256","whsec_fixture_only").update(`${t}.${raw}`).digest("hex")}`];
  };
  fixture.close=async()=>{globalThis.fetch=oldFetch;process.env=oldEnv;await pg.close()};
  return fixture;
}