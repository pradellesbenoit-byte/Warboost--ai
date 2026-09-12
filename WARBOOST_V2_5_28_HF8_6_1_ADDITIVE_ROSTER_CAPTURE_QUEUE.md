# WarBoost V2.5.28 HF8.6.1 — Additive Roster Capture Queue

Date : 2026-09-12
Base : WarBoost V2.5.28 HF8.6 — Roster Scan + Progression + Combat AI
Cible : `public-beta-safe-launch`

## Problème réel corrigé
Sur certains téléphones Android, le sélecteur de fichiers renvoie une seule capture à chaque ouverture. HF8.6 remplaçait alors le tableau de captures par le nouveau `FileList`, ce qui empêchait d’accumuler le roster complet.

## Comportement HF8.6.1
WarBoost possède maintenant sa propre file cumulative :
1. l’utilisateur choisit une ou plusieurs captures ;
2. WarBoost les ajoute à la file existante ;
3. l’input natif est remis à zéro immédiatement pour permettre un nouveau choix ;
4. la file WarBoost reste intacte ;
5. les doublons exacts sont ignorés ;
6. chaque capture peut être retirée sans toucher aux autres ;
7. l’analyse utilise l’ensemble de la file cumulée.

Limite : 24 captures par lot, traitées séquentiellement pour éviter un envoi massif simultané.

## Non-régression
Aucune migration Supabase. Aucun `localStorage.clear()`. Les protections HF8.6 restent inchangées : progression, puissance d’escouade prioritaire, cycle de vie Alliance, anciens membres, Tempête du Désert, VS Freshness Guard et Safe Launch.
