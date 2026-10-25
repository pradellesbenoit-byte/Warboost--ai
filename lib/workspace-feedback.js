// Presentation only. Server authorization and canonical scope remain authoritative.
import {workspaceHelpCopy} from "./workspace-help.js";
import {formatFounderDraft} from "./founder-draft.js";
export function workspaceStatus(status,locale){
  const c=workspaceHelpCopy(locale);
  return ["pending","approved","rejected"].includes(status)?c[status]:c.unverified;
}
export function workspaceRequestsHtml(rows,locale,escape,actions,{approve,reject}){
  const c=workspaceHelpCopy(locale);
  return rows.map(row=>{
    const buttons=row.status==="pending"?` <button type="button" class="smallBtn" data-free-alliance-action="${actions[0]}" data-request-id="${escape(row.id)}">${escape(approve)}</button> <button type="button" class="smallBtn" data-free-alliance-action="${actions[1]}" data-request-id="${escape(row.id)}">${escape(reject)}</button>`:"";
    return `<div class="workspaceRequest"><span>${escape(row.nickname)} — ${escape(workspaceStatus(row.status,locale))}</span>${buttons}</div>`;
  }).join("")||escape(c.emptyRequests);
}
export function draftFeedback(editor,locale){
  const c=workspaceHelpCopy(locale);
  return editor.value===editor.dataset.savedText&&editor.dataset.savedText!==undefined?c.saved:c.dirty;
}
export function rosterFeedback(rows,profile,locale){
  const c=workspaceHelpCopy(locale);
  const formatted=formatFounderDraft(rows);
  const name=String(profile?.name||"").trim();
  const own=(rows||[]).find(row=>row.name===name);
  const mismatch=own?.declared_game_role&&profile?.role&&own.declared_game_role!==profile.role;
  return {text:formatted||c.emptyRoster,notice:formatted?c.opened:c.emptyRoster,
    rankNotice:mismatch?c.roleMismatch:c.unverified};
}
