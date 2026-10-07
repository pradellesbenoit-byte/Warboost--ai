---
name: Fresh-launch privacy boundary
description: Product rule separating temporary UI/captures from confirmed profile and authentication.
---

À la fermeture complète puis réouverture de WarBoost, revenir à l’accueil :
aucune fenêtre précédente, sélection de captures ou vérification non confirmée
ne doit être restaurée. Conserver absolument le profil enregistré, les escouades
confirmées, les grades, la connexion et les droits bêta/PRO, y compris les données
validées qui attendent encore une synchronisation cloud.

**Why:** L’utilisateur a demandé un accueil neuf après fermeture, sans aucune
donnée temporaire en attente, mais sans perte de données enregistrées ni déconnexion.

**How to apply:** Distinguer une nouvelle ouverture/rechargement et un retour de
cache de navigation d’un simple changement de visibilité ou de focus. Ces derniers
surviennent aussi pendant la sélection d’une image dans la galerie/appareil photo :
ne pas les traiter seuls comme une fermeture. Le nettoyage des anciennes captures
ne doit jamais effacer le stockage d’authentification ou celui des profils validés.
