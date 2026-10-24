import {clearPendingSingleScan,clearPendingRosterFiles,clearPendingTechnologyFiles} from "./pending-scan-storage.js";
import {clearMobileSession} from "./mobile-runtime.js";

export async function clearDeletedAccountLocalData(userId,storage=localStorage){
  let secureCleared=true;
  try{await clearMobileSession(userId)}catch{secureCleared=false}
  storage.removeItem(`warboost_account_state:${userId}`);
  for(const key of ["warboost_v1_core_state","warboost_last_good_state"]){
    try{const value=JSON.parse(storage.getItem(key)||"null");if((value?.state||value)?.player_id===userId)storage.removeItem(key)}catch{}
  }
  storage.removeItem("warboost_v1_pending_email");
  const owner=`user:${userId}`;
  const cleared=await Promise.all([clearPendingSingleScan(owner),clearPendingRosterFiles(owner),clearPendingTechnologyFiles(owner)]);
  return secureCleared&&cleared.every(Boolean);
}

export function mountAccountDeletion({root=document,getSession,onDeleting=()=>{},onFailure=()=>{},onDeleted}){
  const dialog=root.getElementById("accountDeletionDialog");
  const status=root.getElementById("accountDeletionStatus");
  const first=root.getElementById("accountDeletionFirst");
  const second=root.getElementById("accountDeletionSecond");
  const button=root.getElementById("accountDeletionConfirm");
  let challenge="",owner="",busy=false;
  const say=text=>{status.textContent=text};
  async function request(body){
    const session=getSession();
    if(!session?.access_token||!session?.user?.id)throw new Error("Connecte-toi à ton compte WarBoost.");
    if(owner&&session.user.id!==owner)throw new Error("Le compte connecté a changé. Ferme et recommence.");
    const response=await fetch("/api/support",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${session.access_token}`},body:JSON.stringify({...body,action:body.action==="prepare"?"account_delete_prepare":"account_delete_confirm"})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error==="CONFIRMATION_EXPIRED"?"La confirmation a expiré. Ferme et recommence.":(data.message||"Suppression indisponible. Utilise le Service client WarBoost."));
    return data;
  }
  root.getElementById("deleteAccountBtn")?.addEventListener("click",()=>{
    if(!getSession()?.user?.id)return;
    owner=getSession().user.id;challenge="";first.hidden=false;second.hidden=true;
    root.getElementById("accountDeletionUnderstood").checked=false;
    root.getElementById("accountDeletionWord").value="";say("");
    dialog.showModal();
  });
  root.getElementById("accountDeletionCancel")?.addEventListener("click",()=>{if(!busy)dialog.close()});
  dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
  root.getElementById("accountDeletionPrepare")?.addEventListener("click",async event=>{
    if(busy)return;
    if(!root.getElementById("accountDeletionUnderstood").checked)return say("Coche la première confirmation après avoir lu les conséquences.");
    busy=true;event.currentTarget.disabled=true;say("Vérification de la suppression…");
    try{
      const data=await request({action:"prepare",understood:true});challenge=data.challenge;
      first.hidden=true;second.hidden=false;say("Seconde confirmation : saisis SUPPRIMER. Valable 5 minutes.");
      root.getElementById("accountDeletionWord").focus();
    }catch(error){say(error.message)}finally{busy=false;root.getElementById("accountDeletionPrepare").disabled=false}
  });
  button.addEventListener("click",async()=>{
    if(busy||!challenge)return;
    if(root.getElementById("accountDeletionWord").value!=="SUPPRIMER")return say("Saisis exactement SUPPRIMER pour confirmer.");
    busy=true;button.disabled=true;onDeleting();say("Suppression en cours. Ne ferme pas cette fenêtre.");
    try{
      const data=await request({action:"delete",understood:true,confirmation:"SUPPRIMER",challenge});
      if(data.deleted!==true)throw new Error("La suppression n’est pas confirmée.");
      const clean=await clearDeletedAccountLocalData(owner);
      await onDeleted(owner,clean);
    }catch(error){onFailure();say(`${error.message} En cas d’interruption, reconnecte-toi pour vérifier ou contacte le support. Ne suppose pas que tout a été effacé.`)}
    finally{busy=false;button.disabled=false}
  });
}
