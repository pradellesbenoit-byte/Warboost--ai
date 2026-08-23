# WarBoost V1.4.0 — Changelog

Date de préparation : 23 août 2026

## Objectif

Préparer WarBoost à une future intégration officielle Last War / FirstFun sans utiliser de méthode d'accès non autorisée pendant l'attente de leur réponse.

## Modifications

- Version applicative portée à 1.4.0.
- Nouveau mode `approval-first-api-ready`.
- Ajout du fournisseur officiel prioritaire `WARBOOST_LASTWAR_OFFICIAL_URL`.
- Ajout du jeton serveur optionnel `WARBOOST_LASTWAR_OFFICIAL_TOKEN`.
- Ajout d'un connecteur partenaire approuvé via `WARBOOST_LASTWAR_PROVIDER_URL`.
- Ancienne source publique désactivée par défaut ; activation explicite requise via `WARBOOST_ALLOW_LEGACY_PROVIDER=true`.
- Ajout du consentement de lecture seule dans les requêtes de synchronisation.
- Ajout des métadonnées de provenance : `provider_kind`, `access_status`, `capabilities`, `official_last_sync`.
- Ajout de la source `sync.sources.official`.
- Interface mise à jour dans toutes les langues : accès officiel indiqué comme « en attente d'autorisation » tant qu'il n'est pas configuré.
- Health check mis à jour en V1.4.0 avec garde-fous d'intégration.
- Documentation `LASTWAR_PROVIDER_CONTRACT.md` réécrite pour le futur accès officiel.
- Cache PWA renouvelé (`warboost-v1-4-0`).
- Moteur de recommandations versionné en V1.4.0 sans changement des règles métier principales de V1.3.3.

## Ce qui reste actif sans API Last War

- WarBoost Scan.
- Analyse des escouades et héros.
- Armes exclusives.
- Drone.
- Conseiller Boutique PRO.
- Cloud alliance R5/R4.
- VS / Saison selon les données enregistrées.
- Authentification WarBoost et stockage Supabase.

## Validation

`npm run check` : OK.

Test du fournisseur sans configuration officielle : retourne correctement `PROVIDER_NOT_CONNECTED` sans écraser les données locales.
