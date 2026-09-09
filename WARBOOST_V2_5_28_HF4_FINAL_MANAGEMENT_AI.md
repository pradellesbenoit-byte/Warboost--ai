# WarBoost V2.5.28 HF4 — Final Management AI

Date: 2026-09-08
Base exacte: WarBoost V2.5.28 HF3 Final Reliability
Base SHA-256: `0dbdf5ece630853959b5420750b6a88f65e66636071f64c41025aa2678d2f475`
Cible: `public-beta-safe-launch` / Vercel Preview uniquement.

## Objectif HF4
HF4 finalise les points observés pendant le smoke test réel HF3 sans supprimer les protections existantes.

### IA Joueur personnalisée
- Le classement reste recalculé depuis l'escouade principale et les données du joueur courant; aucun classement de héros d'un autre joueur n'est réutilisé.
- Les cartes visibles restent un TOP 3 maximum.
- Les 5 héros de l'escouade principale restent comparés dans le détail EX.
- Les égalités de score EX arrondi indiquent le départage réel: sévérité, ROI, puis impact, en comparant le rang courant au rang précédent.
- `Classable` devient `Comparé` dans le détail français.
- Les actions EX sont hiérarchisées: priorité principale, deuxième priorité, troisième priorité.
- Boutique IA conserve la même source de vérité Diagnostic PRO.
- Aucune quantité exacte de fragments/matériaux n'est inventée.

### VS
- Le plan du jour reste structuré en `Aujourd'hui / À garder / À éviter`.
- Le Jour 2 est explicite `Expansion de base` et prépare Jour 3 puis Jour 4.
- L'adversaire inconnu reste non spéculatif.

### Alliance R5/R4 — gestion des événements
- Suivi 30 jours par joueur et par événement.
- Événements principaux: VS, Alliance Exercise/Marshal, Zombie Siege, Desert Storm, Canyon Storm, Ghost Ops, Ville/Bastion/Capitole, Guerre de saison, Maraudeur.
- Compatibilité conservée avec les anciens identifiants V2.5.28 (`zombie`, `alliance_event`, `war`, `season`).
- Statuts distincts: `participated`, `absent_confirmed`, `not_selected`, `excused`, `unknown`.
- Sources visibles: confirmation joueur, import R5/R4, capture R5/R4, saisie WarBoost, API officielle seulement si autorisée.
- Import R5/R4: `nom;date;événement;statut`.
- Une donnée manquante, un statut inconnu, une absence confirmée ou une non-sélection ne deviennent jamais automatiquement une inactivité.
- Le moteur tactique continue d'affecter uniquement les membres actifs confirmés; un roster périmé reste suspendu/partiel.

## Safe Launch conservé
- paiements WarBoost désactivés; PRO inclus pour les testeurs invités;
- aucun accès externe au compte Last War;
- aucune API Last War non autorisée;
- aucun scraping;
- aucune automatisation gameplay;
- données/localStorage/cloud/scans/escouades/Drone/Alliance/VS/Saison/historique conservés;
- 12 fonctions serverless;
- 23 langues explicites + Auto;
- invitations, support, récupération de mot de passe et protections de confidentialité conservés.

## Base de données
Aucune nouvelle migration Supabase HF4. La migration d'invitations V2.5.26 et la migration support déjà installées restent inchangées.

## Validation
Les tests locaux/source/package sont distincts du test Vercel Preview. Après upload, un smoke test réel reste obligatoire avant de promouvoir ou partager largement la version.
