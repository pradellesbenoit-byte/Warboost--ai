// Isolated PostgreSQL + fake provider. NO outbound fetch and NO real secrets are used.
import {PGlite} from "@electric-sql/pglite";
import fs from "node:fs";
import crypto from "node:crypto";
export const userA="10000000-0000-4000-8000-000000000001";
export const userB="10000000-0000-4000-8000-000000000002";
export const userBeta="10000000-0000-4000-8000-000000000003";
export const userFree="10000000-0000-4000-8000-000000000004";
export const userLive="10000000-0000-4000-8000-000000000005";
export const userCountry="10000000-0000-4000-8000-000000000007";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
export async function billingFixture(){
  const pg=new PGlite();
  await pg.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
    create table auth.users(id uuid primary key,email text,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create table public.wb1_profiles(player_id text primary key,state jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now());
    create table public.wb1_snapshots(id bigint generated always as identity primary key,player_id text not null,state jsonb not null,source text not null default 'warboost',captured_at timestamptz not null default now());
    create table public.wb1_beta_invites(id uuid primary key default gen_random_uuid(),email text unique,status text,
      invited_at timestamptz default now(),accepted_user_id text,expires_at timestamptz,accepted_at timestamptz,updated_at timestamptz);`);
  for(const [id,email] of [[userA,"a@example.test"],[userB,"b@example.test"],[userBeta,"beta@example.test"],[userFree,"free@example.test"],[userLive,"live@example.test"],[userCountry,"country@example.test"]])
    await pg.query("insert into auth.users(id,email,created_at) values($1,$2,now()-interval '1 day')",[id,email]);
  await pg.query("insert into wb1_beta_invites(email,status,invited_at,accepted_user_id) values('beta@example.test','accepted',now()-interval '1 day',$1)",[userBeta]);
  const migrations=["supabase/migration_v2_5_28_hf8_commercial_readiness.sql","supabase/migration_v2_5_32_stripe_test_01.sql","supabase/migration_v2_5_32_stripe_test_02_beta_cohort.sql","supabase/migration_v2_5_33_live_billing_preparation.sql","supabase/migration_v2_5_34_account_reset_generation.sql","supabase/migration_v2_5_35_test_setup_intents.sql","supabase/migration_v2_5_36_test_payment_retry_recovery.sql"];
  for(const path of migrations)await pg.exec(fs.readFileSync(path,"utf8"));
  const oldEnv={...process.env},oldFetch=globalThis.fetch;
  Object.assign(process.env,{WARBOOST_COMMERCIAL_MODE:"test",WARBOOST_APP_URL:"https://beta.warboost.fr",STRIPE_SECRET_KEY:"sk_test_fixture_only",
    STRIPE_TEST_PUBLISHABLE_KEY:"pk_test_fixtureonly",WARBOOST_TEST_AUTOMATIC_TAX_ENABLED:"true",WARBOOST_TEST_TAX_READY_COUNTRIES:"FR",
    STRIPE_WEBHOOK_SECRET:"whsec_fixture_only",STRIPE_PRICE_PRO_MONTHLY:"price_pro_test",STRIPE_PRODUCT_PRO:"prod_pro_test",
    WARBOOST_TEST_BILLING_PREFLIGHT_ENABLED:"true",WARBOOST_TEST_APPROVED_BILLING_COUNTRIES:"FR",
    SUPABASE_URL:"https://fixture.invalid",SUPABASE_ANON_KEY:"anon-fixture",SUPABASE_SERVICE_ROLE_KEY:"service-fixture",WARBOOST_BETA_EMAILS:"",WARBOOST_SUPPORT_ADMINS:""});
  const fixture={pg,migrations,calls:[],customers:new Map(),subscriptions:new Map(),sessions:new Map(),
    setupIntents:new Map(),paymentMethods:new Map(),invoices:new Map(),paymentIntents:new Map(),idempotency:new Map(),
    failDb:false,failApplyOnce:false,failCheckoutOnce:false,failSetupOnce:false,failSubscriptionOnce:false,
    failSubscriptionBeforeCreationOnce:false,failSubscriptionLookupOnce:false,
    priceOverride:{},livePriceOverride:{},productOverride:{},
    providerLive:false,card:"accepted",taxStatus:"complete",invoiceAmount:499,paymentIntentStatus:"requires_payment_method"};
  fixture.price=(mode="test")=>mode==="live"?
    ({id:"price_pro_live_fixture",object:"price",active:true,livemode:true,product:"prod_pro_live_fixture",unit_amount:499,currency:"eur",tax_behavior:"inclusive",type:"recurring",
      billing_scheme:"per_unit",recurring:{interval:"month",interval_count:1,usage_type:"licensed"},...fixture.livePriceOverride}):
     ({id:"price_pro_test",object:"price",active:true,livemode:false,product:"prod_pro_test",unit_amount:499,currency:"eur",tax_behavior:"inclusive",type:"recurring",
      billing_scheme:"per_unit",recurring:{interval:"month",interval_count:1,usage_type:"licensed"},...fixture.priceOverride});
  fixture.sub=(customer,id="sub_test_one",status="active",mode="test")=>({id,object:"subscription",livemode:mode==="live",customer,status,
    metadata:{},current_period_end:Math.floor(Date.now()/1000)+86400,cancel_at_period_end:false,
    items:{data:[{quantity:1,price:fixture.price(mode)}]}});
  fixture.rpc=async(name,args)=>{
    const names=Object.keys(args),params=Object.values(args);
    const result=await pg.query(`select public.${name}(${names.map((n,i)=>`${n} => $${i+1}`).join(",")}) as result`,params);
    return result.rows[0]?.result;
  };
  fixture.completeSetup=(setupIntentId,{country="FR",paymentMethodId}={})=>{
    const intent=fixture.setupIntents.get(setupIntentId);
    if(!intent)throw Error("SETUP_INTENT_NOT_FOUND");
    const pmId=paymentMethodId||`pm_test_${fixture.paymentMethods.size+1}`;
    intent.status="succeeded";intent.payment_method=pmId;
    fixture.paymentMethods.set(pmId,{id:pmId,object:"payment_method",livemode:false,customer:intent.customer,
      billing_details:{address:{country}}});
    return intent;
  };
  globalThis.fetch=async(input,opts={})=>{
    const u=new URL(String(input));
    fixture.calls.push({host:u.hostname,path:u.pathname,opts});
    const liveRequest=Boolean(process.env.STRIPE_LIVE_SECRET_KEY)&&opts.headers?.authorization===`Bearer ${process.env.STRIPE_LIVE_SECRET_KEY}`;
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
    if(path==="setup_intents"&&opts.method==="POST"&&fixture.failSetupOnce){
      fixture.failSetupOnce=false;return json({error:{message:"SIMULATED_SETUP_FAILURE"}},503);
    }
    if(path==="subscriptions"&&opts.method==="POST"&&fixture.failSubscriptionBeforeCreationOnce){
      fixture.failSubscriptionBeforeCreationOnce=false;
      return json({error:{message:"SIMULATED_SUBSCRIPTION_FAILURE_BEFORE_CREATION"}},503);
    }
    if(path==="subscriptions"&&opts.method!=="POST"&&fixture.failSubscriptionLookupOnce){
      fixture.failSubscriptionLookupOnce=false;
      return json({error:{message:"SIMULATED_SUBSCRIPTION_LOOKUP_FAILURE"}},503);
    }
    if(path==="prices/price_pro_test")out=fixture.price();
    else if(path==="prices/price_pro_live_fixture")out=fixture.price("live");
    else if(path==="products/prod_pro_test")out={id:"prod_pro_test",object:"product",livemode:false,active:true,...fixture.productOverride};
    else if(path==="products/prod_pro_live_fixture")out={id:"prod_pro_live_fixture",object:"product",livemode:true,active:true,tax_code:"txcd_fixture",...fixture.productOverride};
    else if(path==="customers"){
      const id=`cus_${liveRequest?"live":"test"}_${fixture.customers.size+1}`;
      out={id,object:"customer",livemode:liveRequest,address:params.get("address[country]")?{country:params.get("address[country]")}:null,
        email:params.get("email")||null,metadata:{warboost_user_id:params.get("metadata[warboost_user_id]")||""}};
      fixture.customers.set(id,out);
    }else if(path.startsWith("customers/")){
      out=fixture.customers.get(path.split("/")[1]);
    }else if(path==="setup_intents"&&opts.method==="POST"){
      const id=`seti_test_${fixture.setupIntents.size+1}`;
      out={id,object:"setup_intent",livemode:false,status:"requires_payment_method",customer:params.get("customer"),
        client_secret:`${id}_secret_fixture`,payment_method:null,metadata:{
          warboost_user_id:params.get("metadata[warboost_user_id]")||"",
          warboost_setup_attempt_id:params.get("metadata[warboost_setup_attempt_id]")||"",
          billing_country:params.get("metadata[billing_country]")||"",
          test_consent_version:params.get("metadata[test_consent_version]")||""}};
      fixture.setupIntents.set(id,out);
    }else if(path.startsWith("setup_intents/"))out=fixture.setupIntents.get(path.split("/")[1]);
    else if(path.startsWith("payment_methods/"))out=fixture.paymentMethods.get(path.split("/")[1]);
    else if(path==="subscriptions"&&opts.method==="POST"){
      const id=`sub_test_flow_${fixture.subscriptions.size+1}`,invoiceId=`in_test_flow_${fixture.invoices.size+1}`,
        piId=`pi_test_flow_${fixture.paymentIntents.size+1}`,customer=params.get("customer");
      const metadata={user_id:params.get("metadata[user_id]")||"",warboost_user_id:params.get("metadata[warboost_user_id]")||"",
        warboost_setup_attempt_id:params.get("metadata[warboost_setup_attempt_id]")||"",
        billing_country:params.get("metadata[billing_country]")||""};
      const pi={id:piId,object:"payment_intent",livemode:false,status:fixture.paymentIntentStatus,
        amount:fixture.invoiceAmount,currency:"eur",client_secret:`${piId}_secret_fixture`,
        payment_method:params.get("default_payment_method")};
      const invoice={id:invoiceId,object:"invoice",livemode:false,status:"open",currency:"eur",
        amount_due:fixture.invoiceAmount,total:fixture.invoiceAmount,customer,subscription:id,
        automatic_tax:{enabled:params.get("automatic_tax[enabled]")==="true",status:fixture.taxStatus},
        total_tax_amounts:[{amount:0}],payment_intent:pi};
      out={id,object:"subscription",livemode:false,status:"incomplete",customer,
        default_payment_method:params.get("default_payment_method"),metadata,
        current_period_end:Math.floor(Date.now()/1000)+30*24*60*60,
        items:{data:[{quantity:1,price:fixture.price()}],has_more:false},latest_invoice:invoice,
        automatic_tax:{enabled:params.get("automatic_tax[enabled]")==="true"}};
      fixture.paymentIntents.set(piId,pi);fixture.invoices.set(invoiceId,invoice);fixture.subscriptions.set(id,out);
    }else if(path==="subscriptions"&&opts.method!=="POST"){
      out={object:"list",has_more:false,data:[...fixture.subscriptions.values()].filter(s=>s.customer===u.searchParams.get("customer"))};
    }else if(path.startsWith("subscriptions/")&&opts.method==="DELETE"){
      const sub=fixture.subscriptions.get(path.split("/")[1]);
      if(sub){sub.status="canceled";out={...sub,status:"canceled"}}
    }else if(path.startsWith("subscriptions/"))out=fixture.subscriptions.get(path.split("/")[1]);
    else if(path.startsWith("invoices/"))out=fixture.invoices.get(path.split("/")[1]);
    else if(path==="checkout/sessions"&&(opts.method||"GET")==="GET"){
      const subscription=u.searchParams.get("subscription");
      out={object:"list",has_more:false,data:[...fixture.sessions.values()].filter(session=>
        String(session.subscription?.id||session.subscription||"")===subscription)};
    }else if(path==="checkout/sessions"&&opts.method==="POST"){
      const id=`cs_${liveRequest?"live":"test"}_${fixture.sessions.size+1}`;out={id,object:"checkout.session",livemode:liveRequest,url:`https://checkout.stripe.com/c/pay/${id}`,
        customer:params.get("customer"),client_reference_id:params.get("client_reference_id"),status:"open",expires_at:Number(params.get("expires_at"))};
      fixture.sessions.set(id,out);
      if(key)fixture.idempotency.set(key,out);
      if(fixture.failCheckoutOnce){fixture.failCheckoutOnce=false;throw Error("SIMULATED_CONNECTION_LOSS_AFTER_STRIPE_CREATION")}
    }else if(path==="billing_portal/sessions")out={id:`bps_${liveRequest?"live":"test"}`,object:"billing_portal.session",livemode:liveRequest,url:`https://billing.stripe.com/p/session/${liveRequest?"live":"test"}`};
    else throw Error(`Unexpected provider fixture endpoint ${path}`);
    if(!out)return json({error:{message:"Fixture object missing"}},404);
    if(fixture.providerLive)out={...out,livemode:true};
    if(key)fixture.idempotency.set(key,out);
    if(path==="subscriptions"&&opts.method==="POST"&&fixture.failSubscriptionOnce){
      fixture.failSubscriptionOnce=false;
      throw Error("SIMULATED_CONNECTION_LOSS_AFTER_SUBSCRIPTION_CREATION");
    }
    return json(out);
  };
  fixture.event=(type,obj,created=Math.floor(Date.now()/1000),id=`evt_test_${crypto.randomUUID().replaceAll("-","")}`,livemode=false)=>({id,type,created,livemode,data:{object:obj}});
  fixture.sign=(event,signingLive=event.livemode)=>{
    const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000);
    const secret=signingLive?"whsec_live_fixture_only":"whsec_fixture_only";
    return [raw,`t=${t},v1=${crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex")}`];
  };
  fixture.close=async()=>{globalThis.fetch=oldFetch;process.env=oldEnv;await pg.close()};
  return fixture;
}