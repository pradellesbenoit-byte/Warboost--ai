# WarBoost V2.3.1 — Serverless Fix

Correctif de déploiement Vercel sans suppression de fonctionnalité.

## Correction principale
- Passage de 13 à 12 Serverless Functions.
- Suppression de `api/time.js`.
- L'heure serveur, la semaine ISO et le jour VS sont désormais fournis par `api/health.js`.
- `app.js` appelle `/api/health` à la place de `/api/time`.

## Fonctionnalités conservées
- Diagnostic PRO.
- WarBoost Scan.
- Synchronisation cloud.
- VS.
- Saison.
- Alliance.
- R5/R4.
- Invitations.
- Gestion sécurisée des rôles.
- Conseils IA.
- PRO.

## Objectif
Rester compatible avec la limite actuelle de 12 fonctions du déploiement Vercel concerné, sans passer au forfait supérieur uniquement pour ce blocage.
