# WarBoost V2.5.28 HF8.6.6 — Scan Persistence Reliability

HF8.6.6 corrige la persistance des captures pour les nouveaux comptes et les téléphones mobiles : captures Scan et file de captures roster conservées temporairement sur l’appareil (IndexedDB, cloisonnées par compte, TTL 48 h), résultats structurés sauvegardés localement + WarBoost Cloud, reprise automatique des sauvegardes cloud après réseau/fermeture mobile, détection des scans vides et rafraîchissement PWA/service worker plus fiable. Les images brutes ne sont pas enregistrées dans le profil cloud. Aucun changement de schéma Supabase n’est requis.

# WarBoost V2.5.28 HF8.6.5 — Simple Beta Access Code

Base actuelle : HF8.6.4 + accès bêta simplifié. La bêta reste **sur invitation**, mais l’invitation se fait désormais avec un code privé partagé au lieu d’ajouter chaque e-mail manuellement.

Le parcours normal des bêta-testeurs ne demande plus d’ajout manuel d’e-mail dans la console administrateur. Un joueur connecté qui n’est pas encore autorisé voit un champ **Code d’accès bêta** dans son Compte. Le code privé est validé côté serveur puis son compte est enregistré dans le registre Supabase existant.

Garanties principales : Safe Launch conservé, code non exposé côté navigateur, maximum 25 nouveaux comptes, expiration de l’onboarding au 31/10/2026, révocation prioritaire, aucune migration Supabase, aucune variable Vercel obligatoire supplémentaire, 12 fonctions serveur conservées et aucune perte de données.

Voir `WARBOOST_V2_5_28_HF8_6_5_SIMPLE_BETA_ACCESS_CODE.md` pour le détail.

Compatibilité Supabase : HF8.6.5 réutilise le registre créé par `migration_v2_5_26_beta_invites.sql`; aucune nouvelle migration n’est nécessaire.
