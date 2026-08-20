# WarBoost V1 — Core

Nouvelle base propre, indépendante des anciennes interfaces V20.x.

## Principe produit

L'accueil ne montre que :

- 👤 Joueur
- 🛡️ Alliance
- ⚔️ VS
- 🌍 Saison
- 🤖 Coach IA

Chaque module s'ouvre dans une grande fenêtre mobile et se referme en un toucher.

## Joueur

- 4 escouades fixes.
- Chaque escouade s'ouvre/se ferme comme un accordéon.
- 5 héros par escouade.
- Puissance, niveau, étoiles, arme exclusive et équipement.
- Une escouade n'est remplacée que par une donnée plus récente.
- Historique serveur via `wb1_snapshots`.
- Coach WarBoost donnant une priorité de progression.

## R5 / R4

- Code et lien d'invitation partageables.
- Le membre rejoint l'alliance WarBoost après connexion.
- Roster compact avec QG, puissance, rôle et progression.
- Générateur de plan de guerre basé sur le roster disponible.

## VS

- Semaine calculée avec l'horloge serveur WarBoost.
- Jour VS calculé côté serveur.
- Alliance adverse et scores stockés dans le profil synchronisé.
- Plan du jour généré à partir des données disponibles.

## Saison

- Saison, jour, profession, résistance, progression.
- Conseil adapté au jour et à la progression.

## Serveur temps réel

`/api/time` fournit une heure UTC autoritaire, la semaine ISO et le jour VS. Le téléphone n'est pas la référence principale lorsque le serveur est accessible.

## Synchronisation Last War

Le noyau ne dépend pas de LastWar Tools et n'affiche aucun token au joueur.

Deux mécanismes sont prévus :

1. **Pull** : `WARBOOST_LASTWAR_PROVIDER_URL` — WarBoost interroge une source compatible.
2. **Push** : `/api/ingest` — une source de confiance pousse les mises à jour au serveur WarBoost.

`/api/cron-sync` permet ensuite une mise à jour planifiée de tous les profils.

> Important : WarBoost V1 Core contient le moteur de synchronisation, la persistance et le contrat de données. La mise à jour automatique réelle depuis Last War nécessite encore de brancher une source qui a effectivement accès aux données Last War. Le noyau ne prétend pas contourner cette limite.

Voir `LASTWAR_PROVIDER_CONTRACT.md`.

## Authentification

La page supporte Supabase Auth si ces variables Vercel sont définies :

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

L'inscription supporte le code e-mail 6 à 8 chiffres utilisé par WarBoost.

Sans cloud configuré, l'application reste testable en mode local.

## Base de données

Exécuter `supabase/schema.sql`.

Tables :

- `wb1_profiles`
- `wb1_snapshots`
- `wb1_alliances`
- `wb1_alliance_members`

Les tables V1 ont leur propre préfixe afin de ne pas casser les anciennes versions.

## Variables serveur optionnelles

- `WARBOOST_LASTWAR_PROVIDER_URL`
- `WARBOOST_PROVIDER_SECRET`
- `WARBOOST_INGEST_SECRET`
- `CRON_SECRET`

Aucune de ces valeurs ne doit être exposée dans le navigateur.

## Routes

- `GET /api/time`
- `GET|POST /api/state`
- `POST /api/sync`
- `POST /api/ingest`
- `POST /api/advice`
- `POST /api/invite`
- `POST /api/join`
- `POST /api/cron-sync`
- `GET /api/health`
- `GET /api/cloud-config`

## Test interface

Le bouton **Charger des données de démonstration** remplit uniquement l'interface locale pour vérifier rapidement les 4 escouades, l'alliance, le VS et la saison.

## Version

WarBoost V1.0.0 — Core
