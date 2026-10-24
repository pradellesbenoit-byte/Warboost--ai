const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function showMemberRenameDialog({member,onSubmit}){
  document.querySelector("#memberRenameDialog")?.close();
  const dialog=document.createElement("dialog"),focus=document.activeElement;
  dialog.id="memberRenameDialog";dialog.className="memberRenameDialog";
  dialog.setAttribute("aria-labelledby","memberRenameTitle");
  dialog.innerHTML=`<form><h3 id="memberRenameTitle">Modifier le pseudo</h3><label>Ancien pseudo<input id="memberRenameOld" value="${escape(member.name)}" readonly /></label><label>Nouveau pseudo<input id="memberRenameNew" maxlength="80" required autocomplete="off" /></label><label class="memberRenameConfirm"><input id="memberRenameConfirm" type="checkbox" required />Je confirme qu’il s’agit du même joueur Last War. Son compte, son rang et son historique seront conservés.</label><div id="memberRenameStatus" role="status" aria-live="polite"></div><div class="memberRenameActions"><button type="button" class="secondaryBtn" data-rename-cancel>Annuler</button><button type="submit" class="primaryAction">Confirmer le renommage</button></div></form>`;
  document.body.append(dialog);
  let busy=false,success=false;
  dialog.addEventListener("close",()=>{dialog.remove();if(focus?.isConnected)focus.focus()},{once:true});
  dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
  dialog.querySelector("[data-rename-cancel]").addEventListener("click",()=>dialog.close());
  dialog.querySelector("form").addEventListener("submit",async event=>{
    event.preventDefault();if(busy||success)return;
    if(!dialog.querySelector("#memberRenameConfirm").checked)return;
    busy=true;
    const status=dialog.querySelector("#memberRenameStatus"),controls=[...dialog.querySelectorAll("input,button")];
    controls.forEach(control=>control.disabled=true);status.textContent="Enregistrement…";
    try{
      const result=await onSubmit(dialog.querySelector("#memberRenameNew").value.trim(),dialog);
      if(!dialog.isConnected||result===false)return;
      success=true;status.textContent="Pseudo modifié. Le compte, le rang et les données du joueur sont conservés.";
      const cancel=dialog.querySelector("[data-rename-cancel]");cancel.disabled=false;cancel.textContent="Fermer";cancel.focus();
    }catch(error){
      if(!dialog.isConnected)return;
      status.textContent=renameErrorMessage(error.code);controls.forEach(control=>control.disabled=false);
    }finally{busy=false}
  });
  dialog.showModal();dialog.querySelector("#memberRenameNew").focus();
  return dialog;
}
export function renameErrorMessage(code){
  return {
    nickname_taken:"Ce pseudo est déjà utilisé par un autre membre. Aucun changement n’a été enregistré.",
    nickname_identity_conflict:"Une autre entrée ou un compte porte ce pseudo. Aucune fusion automatique n’a été faite.",
    member_identity_ambiguous:"L’identité du joueur est ambiguë. Aucun changement n’a été enregistré.",
    nickname_invalid:"Saisis un pseudo valide de 1 à 80 caractères.",
    nickname_unchanged:"Saisis un pseudo différent de l’ancien.",
    member_name_changed:"Le pseudo a déjà été modifié. Ferme cette fenêtre et recharge la liste.",
    alliance_write_conflict:"L’alliance a changé pendant l’enregistrement. Recharge la liste avant de réessayer.",
    member_not_found:"Le joueur n’est plus dans cette liste. Recharge l’alliance.",
    r4_r5_required:"Seuls les responsables R4/R5 autorisés peuvent modifier un pseudo.",
    alliance_scope_mismatch:"Le compte ou l’alliance a changé. Aucun changement n’a été appliqué ici."
  }[code]||"Le renommage n’a pas pu être confirmé. Vérifie ta connexion et recharge la liste avant de réessayer.";
}