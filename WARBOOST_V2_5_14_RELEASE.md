# WarBoost V2.5.14 — Cloud Auth Reliability Fix

## Objectif

Corriger le défaut constaté sur la Preview V2.5.13 : les variables Supabase étaient bien présentes (`configured:true`), mais l'interface pouvait afficher « Cloud non configuré » si le client navigateur Supabase chargé depuis un CDN externe n'était pas disponible.

## Corrigé

- Suppression du script CDN Supabase dans `index.html`.
- Nouveau `lib/browser-auth.js` local au dépôt : connexion mot de passe, inscription, OTP, session persistante, refresh token et déconnexion via l'API Supabase Auth HTTPS.
- Compatibilité avec le stockage de session Supabase historique `sb-<project-ref>-auth-token`.
- États d'initialisation distincts : `config-unreachable`, `config-missing`, `client-error`, `auth-unreachable`, `ready`.
- Messages utilisateur séparés pour configuration, initialisation et panne réseau/auth.
- Gestion propre des erreurs réseau sur connexion, inscription et OTP.
- Restauration explicite de `renderAuth()` dans la source V2.5.14, avec test de non-régression.
- Cache Service Worker V2.5.14 incluant le nouveau module d'authentification.

## Confidentialité / données

Toutes les protections V2.5.13 sont conservées : masquage hors session, consentement par compte, isolation multi-compte, récupération des données après reconnexion et aucune suppression automatique des données joueur.

## Base de données

Aucune migration Supabase V2.5.14. Aucun SQL destructif.

## Déploiement

Branche cible : `publisher-demo` uniquement. `main`, `warboost.fr` et la Production restent inchangés pendant la validation.
