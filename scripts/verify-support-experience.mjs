import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../api/support.js";
import {countNewSupportTickets,filterAndSortSupportTickets,renderSupportAdminTicket} from "../lib/support-admin-view.js";

const playerForm=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const playerClient=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const adminPage=readFileSync(new URL("../support-admin.html",import.meta.url),"utf8");
const adminClient=readFileSync(new URL("../support-admin.js",import.meta.url),"utf8");
assert.match(playerForm,/id="supportCategory"[^>]*required/,"category selection is mandatory");
assert.match(playerForm,/id="supportSubject"[^>]*minlength="3"[^>]*required/,"short subject is mandatory");
assert.match(playerForm,/id="supportDescription"[^>]*minlength="30"[^>]*required/,"detailed description is mandatory");
assert.doesNotMatch(playerForm,/id="supportDiagnostics"[^>]*checked/,"technical diagnostics are opt-in by default");
assert.match(playerClient,/payload\.diagnostics_consent=diagnosticsConsent/,"the client's explicit diagnostic choice reaches the server");
assert.match(playerClient,/payload\.diagnostics=\{\}/,"the client sends no diagnostics when consent is absent");
assert.match(adminPage,/id="supportTicketSummary"/,"admin page displays the new-ticket counter");
assert.match(adminPage,/id="adminTicketStatusFilter"/,"admin page exposes status filtering");
assert.match(adminPage,/id="adminTicketDateSort"/,"admin page exposes date sorting");
assert.match(adminClient,/ticket_id=\$\{encodeURIComponent\(ticketId\)\}/,"opening a ticket loads its protected full thread");

process.env.SUPABASE_URL="https://test.supabase.co";
process.env.SUPABASE_ANON_KEY="anon";
process.env.SUPABASE_SERVICE_ROLE_KEY="service";
process.env.WARBOOST_SUPPORT_ADMINS="admin@example.com";
process.env.WARBOOST_BETA_EMAILS="player@example.com";

const users={player:{id:"player-1",email:"player@example.com"},admin:{id:"admin-1",email:"admin@example.com"}};
const tickets=[],messages=[],calls=[];
let ticketSequence=0,messageSequence=0,storageUploads=0;
const originalFetch=globalThis.fetch;

function json(status,body){
  return {ok:status>=200&&status<300,status,text:async()=>body==null?"":JSON.stringify(body),json:async()=>body};
}
function queryIds(value=""){
  if(value.startsWith("eq."))return [value.slice(3)];
  return [...value.matchAll(/"([^"]+)"/g)].map(match=>match[1]);
}
globalThis.fetch=async(url,options={})=>{
  const parsed=new URL(String(url)),path=parsed.pathname,method=String(options.method||"GET").toUpperCase();
  calls.push({path,method,options});
  if(path==="/auth/v1/user"){
    const token=String(options.headers?.authorization||"").replace(/^Bearer\s+/i,"");
    return json(users[token]?200:401,users[token]||{});
  }
  if(path==="/rest/v1/wb1_beta_invites")return json(200,[]);
  if(path==="/rest/v1/wb1_support_tickets"){
    const id=parsed.searchParams.get("id")||"",player=parsed.searchParams.get("player_id")||"";
    if(method==="POST"){
      const row=JSON.parse(options.body);
      const ticket={id:`ticket-${++ticketSequence}`,ticket_no:`WB-TEST-${ticketSequence}`,created_at:`2026-10-02T10:0${ticketSequence}:00.000Z`,updated_at:`2026-10-02T10:0${ticketSequence}:00.000Z`,...row};
      tickets.push(ticket);return json(201,[ticket]);
    }
    if(method==="PATCH"){
      const ticket=tickets.find(item=>`eq.${item.id}`===id);
      if(ticket)Object.assign(ticket,JSON.parse(options.body));
      return json(204,null);
    }
    let rows=tickets;
    if(id)rows=rows.filter(item=>`eq.${item.id}`===id);
    if(player)rows=rows.filter(item=>`eq.${item.player_id}`===player);
    return json(200,[...rows].reverse());
  }
  if(path==="/rest/v1/wb1_support_messages"){
    if(method==="POST"){
      const row=JSON.parse(options.body);
      messages.push({id:`message-${++messageSequence}`,created_at:`2026-10-02T10:1${messageSequence}:00.000Z`,...row});
      return json(201,null);
    }
    const ids=queryIds(parsed.searchParams.get("ticket_id")||"");
    const rows=messages.filter(message=>!ids.length||ids.includes(message.ticket_id));
    const range=String(options.headers?.Range||options.headers?.range||"0-999").match(/^(\d+)-(\d+)$/);
    const selected=range?rows.slice(Number(range[1]),Number(range[2])+1):rows;
    return json(200,selected);
  }
  if(path.startsWith("/storage/v1/object/warboost-support/")&&method==="POST"){storageUploads++;return json(200,{Key:path})}
  throw new Error(`Unexpected request ${method} ${path}`);
};

function response(){
  return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};
}
async function request({method="POST",token="player",query={},body={}}={}){
  const res=response();
  await handler({method,headers:{authorization:`Bearer ${token}`},query,body},res);
  return res;
}

try{
  const baseline={
    action:"create",category:"bug",subject:"Le scan reste bloqué",description:"Le scan reste bloqué après la capture et je m’attendais à voir le résultat.",
    nickname:"Pilote",server_id:"884",alliance_name:"Les Aigles",alliance_tag:"AIG",screen:"Escouades > formation",
    app_version:"2.5.32",locale:"fr",diagnostics:{app_version:"2.5.32",locale:"fr",platform:"should-not-be-saved"}
  };
  let res=await request({body:baseline});
  assert.equal(res.statusCode,201,"a valid ticket with category, subject and detailed description is created");
  assert.equal(tickets.length,1);
  assert.equal(tickets[0].subject,baseline.subject);
  assert.equal(tickets[0].description,baseline.description);
  assert.equal(tickets[0].category,"bug");
  assert.equal(tickets[0].nickname,"Pilote");
  assert.equal(tickets[0].server_id,"884");
  assert.equal(tickets[0].alliance_name,"Les Aigles");
  assert.equal(tickets[0].alliance_tag,"AIG");
  assert.equal(tickets[0].app_version,null,"diagnostic metadata is not saved without explicit consent");
  assert.equal(tickets[0].locale,null,"language is not saved as telemetry without consent");
  assert.deepEqual(tickets[0].diagnostics,{});
  assert.equal(tickets[0].attachment_path,null,"screenshot remains optional");
  assert.equal(storageUploads,0,"no storage upload occurs when no screenshot is attached");

  res=await request({body:{...baseline,category:"",subject:"OK",description:"trop court"}});
  assert.equal(res.statusCode,400,"category and minimum detailed description are required server-side");
  assert.equal(tickets.length,1,"invalid requests do not create tickets");

  const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]).toString("base64");
  res=await request({body:{...baseline,diagnostics_consent:true,attachment_data_url:`data:image/png;base64,${png}`,attachment_name:"capture.png",diagnostics:{app_version:"2.5.32",release:"HF8.6.34",locale:"fr",screen:"Escouades > formation",platform:"test-platform",online:true}}});
  assert.equal(res.statusCode,201,"diagnostics and optional screenshot are accepted with explicit consent");
  assert.equal(tickets[1].app_version,"2.5.32");
  assert.equal(tickets[1].locale,"fr");
  assert.equal(tickets[1].diagnostics.platform,"test-platform");
  assert.match(tickets[1].attachment_path,/^WB-\d{8}-[A-F0-9]{6}\//);
  assert.equal(storageUploads,1);

  const rendered=renderSupportAdminTicket({...tickets[1],messages:[{author_kind:"player",body:baseline.description,created_at:tickets[1].created_at},{author_kind:"support",body:"Réponse complète du support",created_at:"2026-10-02T10:30:00.000Z"}]});
  for(const visible of ["Pseudo WarBoost / Last War","E-mail du compte","Serveur","Alliance","Catégorie","Sujet","Description complète","Date et heure","Version WarBoost","Langue","Écran / section concernée","Statut du ticket","Escouades &gt; formation","Les Aigles #AIG","Voir la capture","Réponse complète du support"]){
    assert.ok(rendered.includes(visible),`admin detail displays ${visible}`);
  }
  assert.ok(rendered.includes("Le scan reste bloqué après la capture"),"admin detail includes the complete description");
  assert.ok(rendered.includes("data-admin-attachment="),"admin receives an authenticated capture link action");
  const missing=renderSupportAdminTicket({id:"missing",status:"received",created_at:null});
  assert.ok(missing.includes("non disponible"),"missing profile fields use the explicit non-available label");
  assert.ok(!missing.includes("<undefined>"),"missing fields are never fabricated");

  const sampleTickets=[
    {status:"received",created_at:"2026-10-01T00:00:00Z",ticket_no:"old"},
    {status:"received",created_at:"2026-10-02T00:00:00Z",ticket_no:"new"},
    {status:"waiting_player",created_at:"2026-10-03T00:00:00Z",ticket_no:"active"},
    {status:"resolved",created_at:"2026-10-04T00:00:00Z",ticket_no:"done"}
  ];
  assert.equal(countNewSupportTickets(sampleTickets),2,"visible counter counts unprocessed tickets");
  assert.deepEqual(filterAndSortSupportTickets(sampleTickets,"new","recent").map(ticket=>ticket.ticket_no),["new","old"],"new filter and recent-first sorting work");
  assert.deepEqual(filterAndSortSupportTickets(sampleTickets,"in_progress","recent").map(ticket=>ticket.ticket_no),["active"],"in-progress filter includes waiting-player tickets");
  assert.deepEqual(filterAndSortSupportTickets(sampleTickets,"resolved","oldest").map(ticket=>ticket.ticket_no),["done"],"resolved filter is available");

  res=await request({method:"GET",token:"player",query:{admin:"1"}});
  assert.equal(res.statusCode,403,"non-admin cannot list support tickets");
  res=await request({method:"GET",token:"player",query:{admin:"1",ticket_id:tickets[1].id}});
  assert.equal(res.statusCode,403,"non-admin cannot fetch an admin ticket thread");
  res=await request({method:"GET",token:"admin",query:{admin:"1"}});
  assert.equal(res.statusCode,200);
  assert.equal(res.body.tickets.length,2);
  res=await request({method:"GET",token:"admin",query:{admin:"1",ticket_id:tickets[1].id}});
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ticket.messages.length,1,"admin detail endpoint returns the complete thread");

  res=await request({token:"admin",body:{action:"status",ticket_id:tickets[0].id,status:"resolved"}});
  assert.equal(res.statusCode,200,"admin can change ticket status");
  assert.equal(tickets[0].status,"resolved");
  res=await request({token:"admin",body:{action:"reply",ticket_id:tickets[1].id,body:"Réponse visible au joueur",as_support:true}});
  assert.equal(res.statusCode,200,"admin can answer inside the ticket thread");
  assert.equal(tickets[1].status,"waiting_player");
  res=await request({method:"GET",token:"player",query:{}});
  assert.equal(res.statusCode,200);
  assert.ok(res.body.tickets.find(ticket=>ticket.id===tickets[1].id).messages.some(message=>message.author_kind==="support"&&message.body==="Réponse visible au joueur"),"admin response remains visible in the player's request history");

  res=await request({token:"player",body:{action:"status",ticket_id:tickets[1].id,status:"resolved"}});
  assert.equal(res.statusCode,403,"non-admin cannot change ticket status");
  console.log("Support ticket experience, admin triage, optional diagnostics, replies and access control: PASS");
} finally {
  globalThis.fetch=originalFetch;
}