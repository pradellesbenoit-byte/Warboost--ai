// Draft names/declared game ranks never become verified WarBoost roles or links.
export function resetForeignFounderDraft(panel,editor,userId){
  if(userId&&panel?.dataset.owner===userId)return false;
  panel?.classList.add("hidden");
  if(panel){delete panel.dataset.owner;delete panel.dataset.revision}
  if(editor){editor.value="";editor.dataset.savedText=""}
  return true;
}
export function parseFounderDraft(text){
  const rows=String(text||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(line=>{
    const parts=line.split(";"),name=parts[0].trim(),role=parts[1]?.trim().toUpperCase();
    if(parts.length>2||!name||name.length>80||(role&&!/^R[1-5]$/.test(role)))throw new Error("ALLIANCE_DRAFT_INVALID");
    return {name,declared_game_role:role||null};
  });
  if(rows.length>100)throw new Error("ALLIANCE_DRAFT_LIMIT");
  if(new Set(rows.map(r=>r.name.toLowerCase())).size!==rows.length)throw new Error("ALLIANCE_DRAFT_DUPLICATE");
  return rows;
}
export function formatFounderDraft(rows){
  return (rows||[]).map(r=>`${r.name}${r.declared_game_role?`; ${r.declared_game_role}`:""}`).join("\n");
}
