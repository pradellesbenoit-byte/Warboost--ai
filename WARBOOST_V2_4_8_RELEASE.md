# WarBoost V2.4.8 — Adaptive Context Intelligence

## Objectif de la version

V2.4.8 ajoute un moteur de décision contextuel au Diagnostic PRO sans supprimer les protections de V2.4.7.

Le moteur ne se contente plus d'une priorité statique : il compare la valeur marginale des actions possibles selon les données réellement connues du joueur et le contexte de jeu.

## 1. Contexte joueur

Nouveau bloc `player_context` :

- `objective`: `auto`, `balanced`, `pvp`, `pve`, `vs`, `season` ;
- `account_age_days`: valeur optionnelle, jamais déduite/inventée si absente ;
- `server_profile`: `auto`, `new`, `mature`, `competitive`, `mixed` ;
- `updated_at`.

Le contexte est normalisé, sauvegardé localement et transmis dans l'état WarBoost existant sans modification du schéma Supabase.

## 2. Moteur Adaptive Context Intelligence

Nouveau module `lib/adaptive-context.js` :

- construction du contexte à partir du profil, de la Saison, du VS, du Drone, de la technologie et du type de formation ;
- inférence prudente de l'objectif seulement lorsque le joueur laisse `Auto` ;
- score de rendement marginal contextuel ;
- ajustements selon l'objectif, l'âge du compte lorsqu'il est connu, et le profil serveur lorsqu'il est connu ;
- niveaux de certitude `certain`, `probable`, `speculative` ;
- conditions `refresh`, `now`, `hold_vs`, `payback`, `neutral` ;
- horodatage de la recommandation.

## 3. Diagnostic PRO

Les candidats existants restent issus des données réellement présentes : héros, EX, Éveil, équipement, technologies, Drone, etc.

V2.4.8 ajoute :

- `marginal_value_score` ;
- `context_adjustment` ;
- `certainty` ;
- `condition_key` ;
- `calculated_at` ;
- résumé du contexte adaptatif ;
- affichage « Efficacité ressources » à la place d'un simple ROI générique.

Aucun coût exact, quantité de fragments ou gain de puissance post-Éveil n'est inventé lorsque la donnée n'est pas confirmée.

## 4. Technologie

Le moteur identifie une branche technologique incomplète en comparant :

- l'écart restant jusqu'à 100 % ;
- sa pertinence pour l'objectif contextuel.

Il ne recommande aucune branche lorsque toutes les technologies connues sont terminées.

## 5. Boutique IA

Correctif inclus dans `api/advice.js` : la sélection des escouades configurées utilise correctement l'objet d'escouade (`x.s`) lors du filtrage de fiabilité.

Toutes les protections Boutique V2.4.0–V2.4.7 restent actives, notamment catalogue partiel, fusion des scans, anti-doublon, offres vendues, prix ambigus, coffres opaques et ressources situationnelles.

## 6. Fonctions préservées

Restent inchangés par rapport à V2.4.7 :

- `api/scan.js` ;
- `api/state.js` ;
- `api/sync.js` ;
- `lib/squad-identity.js` ;
- `lib/data-freshness.js` ;
- `lib/heroes.js` ;
- `lib/shop-catalog.js` ;
- `lib/season6-awakening.js` ;
- `lib/meta-intel.js` ;
- `lib/alliance-activity.js` ;
- `styles.css` ;
- `publisher-ui.js` / `publisher-ui.css` ;
- `supabase/schema.sql`.

Le registre héros V2.4.7 reste donc intact, y compris la protection contre l'héritage de données par position et la conservation d'une donnée confirmée comme Kimberly EX19.

## 7. Traductions

Les nouveaux éléments V2.4.8 sont présents dans les 23 choix de langue explicites de l'interface, avec anglais UK et US séparés, plus le mode Auto.

## 8. Déploiement

Installer d'abord sur `publisher-demo`. Ne fusionner sur `main` qu'après validation fonctionnelle du Preview Vercel.
