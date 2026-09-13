WARBOOST V2.5.28 HF8.6.15 — PLAYER PRESENTATION RELIABILITY

Base obligatoire : HF8.6.14 Session Apply Unblock.
Cible : public-beta-safe-launch uniquement.
Ne pas modifier main ni publisher-demo.
Aucune migration Supabase.
Aucun fichier à supprimer.

Ce correctif renforce la connexion mobile avant présentation à des joueurs :
- la session Supabase reste affichée immédiatement ;
- la migration IndexedDB des captures reste non bloquante ;
- les requêtes Auth Supabase ont désormais un délai maximum ;
- les écritures cloud de premier plan ont désormais un délai maximum ;
- les sauvegardes keepalive de fermeture restent inchangées ;
- les protections HF8.6.11 à HF8.6.14 et les régressions historiques sont conservées.

Après déploiement Preview : tester au minimum connexion, reconnexion, restauration profil/escouades/Drone,
Scan, fermeture/réouverture, et un compte invité neuf avant de diffuser le lien plus largement.
