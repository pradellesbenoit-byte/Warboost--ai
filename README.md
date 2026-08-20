# WarBoost V1.2.3 — Squad Slot Guard

- Corrige le bug où un scan d'Escouade 2/3/4 pouvait remplacer l'Escouade 1.
- Le sélecteur WarBoost Scan propose maintenant explicitement Escouade 1, Escouade 2, Escouade 3 et Escouade 4.
- Le serveur force le résultat Vision dans l'emplacement choisi : un scan Escouade 2 ne peut modifier que l'Escouade 2.
- Les autres escouades déjà enregistrées sont conservées.
- Compatible avec toutes les langues WarBoost ; les noms d'escouade du sélecteur utilisent la langue active.
- Supabase, Stripe PRO, Hybrid Sync et le correctif galerie Android sont conservés.
- Cache PWA incrémenté pour forcer le chargement du correctif.

# WarBoost V1.2.2 — Android Gallery Picker Fix

- WarBoost Scan n'impose plus l'ouverture de la caméra Android.
- Le bouton de capture ouvre désormais le sélecteur de photos/fichiers afin de choisir directement une capture d'écran existante.
- Formats acceptés : PNG, JPEG et WEBP.
- Cache PWA incrémenté pour forcer le chargement du correctif après déploiement.

# WarBoost V1.2.1 — Global Translation Completion

- Complete locale coverage for FR, EN-GB, EN-US, ES, DE, JA, ZH and AR.
- Removes English fallback strings visible inside Japanese/Spanish/German/Chinese/Arabic screens.
- Keeps Arabic RTL and locale-aware dates, time, numbers and prices.
- AI rules already return advice in the selected language.
- Supabase, Stripe PRO and Hybrid Sync preserved.
- Service-worker cache bumped so the language patch reaches installed PWAs.

# WarBoost V1.2 — Global Hybrid Sync

WarBoost V1.2 repart sur la base propre V1 et conserve la connexion Supabase ainsi que WarBoost PRO/Stripe déjà validés.

## 1. International par défaut

WarBoost détecte automatiquement la langue du téléphone/navigateur et propose aussi un sélecteur manuel.

Langues intégrées :

- Français
- Anglais UK
- Anglais US
- Espagnol
- Allemand
- Japonais
- Chinois simplifié
- Arabe avec interface RTL

Une langue non reconnue bascule automatiquement sur l'anglais. Dates, heures, nombres et prix utilisent le format local.

## 2. WarBoost Hybrid Sync — sans token joueur

La synchronisation ne demande aucun token Last War au joueur.

Elle combine trois couches :

1. **Données publiques** : via `WARBOOST_PUBLIC_LASTWAR_URL` si une source publique compatible est branchée côté serveur.
2. **WarBoost Scan** : captures Last War analysées côté serveur pour les données privées (QG, 4 escouades, héros, Drone, VS, Saison, etc.).
3. **Cloud alliance** : les membres qui rejoignent l'alliance WarBoost remontent automatiquement dans le roster R5/R4 avec leur dernière progression enregistrée.

Le bouton de synchronisation reste fonctionnel même lorsqu'aucune source publique externe n'est configurée : le cloud WarBoost et le roster alliance continuent de fonctionner.

## 3. WarBoost Scan

Nouvelle fenêtre mobile :

- Profil / QG
- Escouades / Héros
- Drone
- VS
- Saison

La capture est redimensionnée dans le navigateur avant l'envoi.

### Option A — OpenAI Vision côté serveur

Ajouter dans Vercel :

- `OPENAI_API_KEY`
- optionnel : `WARBOOST_VISION_MODEL` (défaut : `gpt-5.6-luna`)

La clé reste exclusivement côté serveur.

### Option B — moteur Vision externe WarBoost

- `WARBOOST_VISION_ENDPOINT`
- optionnel : `WARBOOST_VISION_SECRET`

Le moteur doit renvoyer un JSON partiel compatible avec l'état WarBoost.

Si aucun moteur Vision n'est configuré, WarBoost ne modifie aucune donnée et indique simplement que l'analyse automatique doit être activée côté serveur.

## 4. Joueur

- 4 escouades ouvrables/fermables.
- 5 héros par escouade.
- puissance, niveau, étoiles, arme exclusive, équipement.
- Drone : niveau + puissance.
- historique conservé.
- valeurs manuelles préservées lorsqu'un scan ne lit pas un champ.
- Coach IA PRO localisé.

## 5. R5 / R4

- invitation WarBoost partageable.
- le propriétaire de l'alliance est automatiquement ajouté au roster.
- les membres rejoignent via le lien/code.
- le serveur reconstruit le roster depuis les profils WarBoost enregistrés.
- QG, puissance, rôle et évolution visibles.
- plan de guerre IA PRO.

## 6. VS

- semaine et jour calculés avec l'horloge serveur WarBoost.
- adversaire / scores récupérables via source publique ou scan.
- plan du jour PRO.

## 7. Saison

- saison, jour, profession, résistance et progression.
- mise à jour via source publique ou scan.
- conseil PRO localisé.

## 8. PRO conservé

WarBoost V1.2 conserve le fonctionnement validé de V1.1.4 :

- Stripe Checkout
- abonnement 4,99 €/mois (selon le Price configuré)
- portail de gestion
- statut FREE / PRO
- prise en charge `SUPABASE_PUBLISHABLE_KEY`

Variables déjà utilisées :

- `STRIPE_SECRET_KEY`
- `STRIPE_PRO_PRICE_ID`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` ou `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 9. Source publique Last War optionnelle

Pour brancher une source publique compatible :

- `WARBOOST_PUBLIC_LASTWAR_URL`

WarBoost envoie uniquement identité WarBoost + pseudo/serveur connus. Aucun token joueur.

L'ancien connecteur de confiance reste également compatible :

- `WARBOOST_LASTWAR_PROVIDER_URL`
- `WARBOOST_PROVIDER_SECRET`

Voir `LASTWAR_PROVIDER_CONTRACT.md`.

## 10. Vercel Hobby

La V1.2 contient exactement **12 fonctions Serverless**, soit la limite utilisée pour ce projet Hobby :

- advice
- cloud-config
- cron-sync
- health
- ingest
- invite
- join
- pro
- scan
- state
- sync
- time

Ne rajoute pas un nouveau fichier `.js` dans `api/` sans fusionner une fonction existante.

## Déploiement conseillé

Pour remplacer V1.1 : uploader le contenu de ce ZIP à la racine GitHub en conservant les dossiers `api`, `lib`, `assets`, `supabase`.

Après le déploiement, vérifier :

- `/api/health`
- connexion WarBoost
- PRO
- changement de langue
- ouverture des 4 escouades
- WarBoost Scan
- invitation alliance

Version : **WarBoost V1.2.0 — Global Hybrid Sync**
