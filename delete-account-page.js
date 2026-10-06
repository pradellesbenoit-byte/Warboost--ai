const params=new URLSearchParams(location.search);
if(params.get("deleted")==="1"){
  const box=document.getElementById("deletionResult");
  box.hidden=false;
  box.textContent=params.get("local_cleanup")==="required"
    ?"Le parcours précédent a confirmé la suppression serveur. Le nettoyage local n’a pas pu être confirmé : efface les données du site WarBoost dans les paramètres du navigateur, y compris sur tes autres appareils."
    :"Le parcours précédent a confirmé la suppression serveur. Pense aussi à effacer les données du site WarBoost sur tes autres appareils.";
}
