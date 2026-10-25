import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {parseFounderDraft,formatFounderDraft} from "../lib/founder-draft.js";
import {workspaceHelpCopy,WORKSPACE_HELP_LANGUAGES,renderWorkspaceHelp} from "../lib/workspace-help.js";
import {workspaceRequestsHtml,draftFeedback,rosterFeedback} from "../lib/workspace-feedback.js";
import {freeAccessCopy} from "../lib/free-access.js";
import {accountSyncView} from "../lib/account-sync-feedback.js";
import {LANGUAGES,translator} from "../i18n.js";
const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function element(value=""){
 return {value,dataset:{},textContent:"",innerHTML:"",disabled:false,
  classList:{add(){},remove(){}},querySelectorAll(){return []}};
}
function harness(){
 const nodes=Object.fromEntries(["freeFounderPanel","freeFounderRoster","freeDraftFeedback","freeSpaceRequests","freeAllianceRequests",
  "freeSpaceRoster","freeSpaceFeedback","freeSpaceRankNotice","freeFounderNote"].map(id=>[id,element()]));
 nodes.freeFounderPanel.dataset={owner:"account-A",revision:"1"};
 nodes.freeFounderRoster.dataset.savedText="";
 const listeners={},messages=[],calls=[],buttons=[element(),element()];
 const context={parseFounderDraft,formatFounderDraft,workspaceHelpCopy,renderWorkspaceHelp,workspaceRequestsHtml,draftFeedback,rosterFeedback,freeAccessCopy,esc,
  lang:"fr",cloudSession:{user:{id:"account-A"},access_token:"synthetic-A"},
  state:{player_id:"account-A",player:{name:"Player I",role:"R5"},squads:[1,2,3,4]},
  sessionApplyKey:session=>session?.access_token||"",requireBetaAccess:()=>true,requireBetaConsent:()=>true,
  pushServerState:async()=>({ok:true}),authHeaders:value=>value,confirm:()=>true,
  pullServerState:async()=>{},inviteMessage:(text,ok)=>messages.push({text,ok}),
  $:selector=>nodes[selector.slice(1)]||null,
  document:{querySelectorAll:selector=>selector.includes("#freeFounderSave")?buttons:[],addEventListener:(event,fn)=>{listeners[event]=fn}},
  fetchJsonBounded:async(url,options)=>{
   calls.push({url,body:JSON.parse(options.body)});
   return await context.reply(calls.at(-1));
  },
  reply:async()=>({response:{ok:true},json:{ok:true,game_role_verified:false,requests:[]}})
 };
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf("let freeAllianceBusy=false;"),source.indexOf("// Capture overrides old invitation-sharing handlers.")),context);
 return {context,nodes,listeners,messages,calls,buttons,
  run:(action,target)=>vm.runInContext(`submitFreeAllianceAction(${JSON.stringify(action)},${JSON.stringify(target)||"undefined"})`,context)};
}
for(const locale of WORKSPACE_HELP_LANGUAGES){
 test(`${locale}: complete native notice, statuses and text-only rendering`,()=>{
  const copy=workspaceHelpCopy(locale),en=workspaceHelpCopy("en");
  assert.equal(Object.keys(copy).length,17);
  for(const [key,text] of Object.entries(copy)){
   assert.equal(typeof text,"string");assert.ok(text.length>0,key);
   if(locale!=="en")assert.notEqual(text,en[key],key);
  }
  assert.match(copy.founder,/R3/);assert.match(copy.founder,/R1/);
  assert.match(copy.invalid,/\{line\}/);
  const container={ownerDocument:{createElement:tag=>({tag})},replaceChildren(...children){this.children=children}};
  renderWorkspaceHelp(container,locale);
  assert.equal(container.children.length,5);
  assert.equal(container.children[0].textContent,copy.title);
  assert.equal(container.dir,locale==="ar"?"rtl":"ltr");
  assert.equal(container.children.every(child=>typeof child.textContent==="string"),true);
 });
}
test("every configured language resolves to a translated notice, including both English locales",()=>{
 const supported=new Set(WORKSPACE_HELP_LANGUAGES);
 for(const item of LANGUAGES){
  const code=Array.isArray(item)?item[0]:item.code||item.value;
  if(code==="auto")continue;
  assert.ok(supported.has(code.split("-")[0]),code);
  assert.equal(translator(code)("beta_release_label"),workspaceHelpCopy(code).free);
  assert.equal(translator(code)("beta_badge"),workspaceHelpCopy(code).free);
 }
});
test("exact R1–R5 grammar, optional rank, original line number, no input rewrite",()=>{
 assert.equal(parseFounderDraft("Player I ; R3")[0].declared_game_role,"R3");
 assert.equal(parseFounderDraft("Player I")[0].declared_game_role,null);
 for(const rank of ["R3.","R0","R6","R3 ; extra"]){
  assert.throws(()=>parseFounderDraft(`First\n\nPlayer I ; ${rank}`),error=>error.message==="ALLIANCE_DRAFT_INVALID"&&error.line===3);
 }
 assert.throws(()=>parseFounderDraft("Same\nsame"),/DUPLICATE/);
});
test("decision buttons only exist on pending; translated states and escaped identities",()=>{
 const html=workspaceRequestsHtml([
  {id:"synthetic-pending",nickname:"<img>",status:"pending"},
  {id:"synthetic-approved",nickname:"B",status:"approved"},
  {id:"synthetic-rejected",nickname:"C",status:"rejected"},
  {id:"synthetic-unknown",nickname:"D",status:"unexpected"}
 ],"fr",esc,["approve_space","reject_space"],freeAccessCopy("fr"));
 assert.equal((html.match(/<button /g)||[]).length,2);
 assert.match(html,/Approuvée/);assert.match(html,/Refusée/);
 assert.doesNotMatch(html,/<img>|data-request-id="synthetic-approved"|data-request-id="synthetic-rejected"/);
});
test("blank roster, declared mismatch and saved/unsaved drafts never grant roles",()=>{
 assert.equal(rosterFeedback([],{},"fr").text,workspaceHelpCopy("fr").emptyRoster);
 const profile={name:"Player I",role:"R5"};
 const view=rosterFeedback([{name:"Player I",declared_game_role:"R3"}],profile,"fr");
 assert.equal(view.rankNotice,workspaceHelpCopy("fr").roleMismatch);
 assert.equal(profile.role,"R5");
 const editor=element("A");assert.equal(draftFeedback(editor,"fr"),workspaceHelpCopy("fr").dirty);
 editor.dataset.savedText="A";assert.equal(draftFeedback(editor,"fr"),workspaceHelpCopy("fr").saved);
 editor.value="B";assert.equal(draftFeedback(editor,"fr"),workspaceHelpCopy("fr").dirty);
});
test("mobile form structure: label before full-width textarea, live feedback and two help entry points",()=>{
 const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const css=fs.readFileSync(new URL("../styles.css",import.meta.url),"utf8");
 assert.ok(html.indexOf('id="freeFounderLabel"')<html.indexOf('id="freeFounderRoster"'));
 assert.equal((html.match(/data-workspace-help/g)||[]).length,2);
 assert.match(html,/id="freeDraftFeedback" role="status" aria-live="polite"/);
 assert.match(css,/#freeFounderRoster\{[^}]*width:100%/);
 assert.match(css,/#freeFounderPanel label\{[^}]*display:block/);
 assert.match(css,/min-height:44px/);assert.match(css,/workspaceHelp\[dir="rtl"\]/);
});
test("real save handler rejects R3. before HTTP and preserves exact typed text",async()=>{
 const h=harness();h.nodes.freeFounderRoster.value="Player I ; R3.";
 await h.run("save_draft");
 assert.equal(h.calls.length,0);assert.equal(h.nodes.freeFounderRoster.value,"Player I ; R3.");
 assert.match(h.messages.at(-1).text,/Ligne 1/);assert.match(h.messages.at(-1).text,/R3/);
 assert.equal(h.messages.at(-1).ok,undefined);
});
test("real save handler acknowledges only successful server revision, preserving four squads",async()=>{
 const h=harness();h.nodes.freeFounderRoster.value="Player I ; R3";
 h.context.reply=async()=>({response:{ok:true},json:{ok:true,provisional:true,membership_granted:false,game_role_verified:false,revision:2,roster_draft:[{name:"Player I",declared_game_role:"R3"}]}});
 await h.run("save_draft");
 assert.equal(h.calls[0].body.roster[0].name,"Player I");
 assert.equal(h.nodes.freeFounderPanel.dataset.revision,"2");
 assert.equal(h.nodes.freeDraftFeedback.textContent,workspaceHelpCopy("fr").saved);
 assert.equal(h.messages.at(-1).ok,true);
 assert.equal(JSON.stringify(h.context.state.squads),"[1,2,3,4]");
 assert.equal(h.context.state.player.role,"R5");
});
test("save refusal/network failure preserves draft and cannot show success",async()=>{
 for(const fail of ["http","network"]){
  const h=harness();h.nodes.freeFounderRoster.value="Player I ; R3";
  h.context.reply=async()=>{if(fail==="network")throw Error("synthetic failure");return {response:{ok:false},json:{ok:false}}};
  await h.run("save_draft");
  assert.equal(h.nodes.freeFounderRoster.value,"Player I ; R3");
  assert.notEqual(h.messages.at(-1).ok,true);
  assert.equal(h.nodes.freeFounderPanel.dataset.revision,"1");
 }
});
test("edits made during save remain unsaved, do not get overwritten; duplicate click sends once",async()=>{
 const h=harness();h.nodes.freeFounderRoster.value="Old ; R3";
 let resolve;h.context.reply=()=>new Promise(done=>{resolve=done});
 const first=h.run("save_draft");
 await h.run("save_draft");
 assert.equal(h.calls.length,1);
 h.nodes.freeFounderRoster.value="New ; R2";
 resolve({response:{ok:true},json:{ok:true,provisional:true,membership_granted:false,game_role_verified:false,revision:2,roster_draft:[{name:"Old",declared_game_role:"R3"}]}});
 await first;
 assert.equal(h.nodes.freeFounderRoster.value,"New ; R2");
 assert.equal(h.nodes.freeDraftFeedback.textContent,workspaceHelpCopy("fr").dirty);
 assert.equal(h.messages.at(-1).text,workspaceHelpCopy("fr").dirty);
});
test("real workspace request uses approval status returned by server, not local rank",async()=>{
 for(const status of ["pending","approved","rejected"]){
  const h=harness();h.context.reply=async()=>({response:{ok:true},json:{ok:true,game_role_verified:false,status}});
  await h.run("request_space");
  assert.equal(h.calls[0].body.action,"request_space");
  assert.equal(Object.hasOwn(h.calls[0].body,"role"),false);
  assert.equal(h.messages.at(-1).text,workspaceHelpCopy("fr")[status]);
 }
});
test("incomplete server acknowledgements fail closed without a saved or approved message",async()=>{
 for(const [action,body] of [
  ["save_draft",{provisional:true,membership_granted:false,game_role_verified:false}],
  ["approve_space",{game_role_verified:false}],
  ["list_space",{game_role_verified:false,requests:[{id:"synthetic",nickname:"A",status:"unknown"}]}],
  ["request_space",{game_role_verified:false}]
 ]){
  const h=harness();h.context.reply=async()=>({response:{ok:true},json:{ok:true,...body}});
  await h.run(action,"synthetic");
  assert.notEqual(h.messages.at(-1).ok,true);
  assert.equal(h.nodes.freeFounderPanel.dataset.revision,"1");
 }
});
test("approve/reject response immediately removes action buttons and translates decisions",async()=>{
 for(const [action,status] of [["approve_space","approved"],["reject_space","rejected"]]){
  const h=harness();
  h.context.reply=async()=>({response:{ok:true},json:{ok:true,game_role_verified:false,requests:[{id:"synthetic-member",nickname:"Member",status}]}});
  await h.run(action,"synthetic-member");
  assert.doesNotMatch(h.nodes.freeSpaceRequests.innerHTML,/<button/);
  assert.match(h.nodes.freeSpaceRequests.innerHTML,new RegExp(workspaceHelpCopy("fr")[status]));
 }
});
test("real roster load handles empty state and labels declared rank mismatch",async()=>{
 for(const rows of [[],[{name:"Player I",declared_game_role:"R3"}]]){
  const h=harness();h.context.reply=async()=>({response:{ok:true},json:{ok:true,game_role_verified:false,roster_draft:rows}});
  await h.run("view_space");
  assert.ok(h.nodes.freeSpaceRoster.textContent);
  assert.equal(h.nodes.freeSpaceRankNotice.textContent,rows.length?workspaceHelpCopy("fr").roleMismatch:workspaceHelpCopy("fr").unverified);
 }
});
test("late reply after session/account change cannot write feedback or expose cached private roster",async()=>{
 const h=harness();let resolve;
 h.context.reply=()=>new Promise(done=>{resolve=done});
 const first=h.run("view_space");await Promise.resolve();
 h.context.cloudSession={user:{id:"account-B"},access_token:"synthetic-B"};
 h.context.state.player_id="account-B";
 resolve({response:{ok:true},json:{ok:true,game_role_verified:false,roster_draft:[{name:"private-A"}]}});
 await first;
 assert.equal(h.nodes.freeSpaceRoster.textContent,"");
 assert.equal(h.messages.length,0);
});
test("current cloud check proves only matching revision and never fabricates a write receipt",()=>{
 const revision="2026-10-25T10:00:00.000Z";
 const base={sessionKey:"synthetic",revision,check:{kind:"verified",revision},sync:{}};
 const view=accountSyncView(base);
 assert.equal(view.kind,"verified");assert.equal(view.lastConfirmedAt,null);
 assert.equal(accountSyncView({...base,dirty:true}).kind,"pending");
 assert.equal(accountSyncView({...base,revision:"other"}).kind,"unknown");
 assert.equal(accountSyncView({...base,online:false}).kind,"network");
 assert.equal(accountSyncView({...base,save:{kind:"forbidden"}}).kind,"forbidden");
 assert.equal(accountSyncView({...base,hasSquadConflict:true}).kind,"conflict");
});
