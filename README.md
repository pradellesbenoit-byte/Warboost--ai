# WarBoost V20.5.19 — LastWar API Resilience

Cette version conserve **V20.5.17 Legal + RGPD** et finalise la couche de médiation de la consommation avant commercialisation PRO.

## V20.5.19 — LastWar API Resilience

### Nouveautés API LastWar Tools
- Player Search actuel : délai contrôlé par défaut (16 s) pour éviter de bloquer inutilement.
- Fallback historique : délai étendu (32 s) lorsque le service communautaire est ralenti.
- Toujours 2 appels maximum pour le diagnostic intelligent.
- Le fournisseur qui fonctionne reste mémorisé sur le téléphone.
- Diagnostic sûr enrichi : mode testé, timeout, durée et statut sans jamais exposer la clé API.
- La clé Vercel est normalisée si elle a été collée avec `Bearer`, `Authorization:` ou `X-API-Key:`.
- Alliance Members utilise maintenant un timeout adaptatif et accepte un override `LASTWAR_TOOLS_LEGACY_ALLIANCE_MEMBERS_URL` si LastWar Tools publie une route historique dédiée.
- Aucun nouvel endpoint Vercel : toujours une seule fonction partagée `api/player-scan.js`.

## V20.5.18 — CM2C + PRO Ready
- **CM2C activé** comme médiateur de la consommation WarBoost, compte valable jusqu’au **19/08/2029**.
- Coordonnées CM2C intégrées dans les **CGV** et le Centre légal : 49 rue de Ponthieu, 75008 Paris ; 01 89 47 00 14 ; litiges@cm2c.net ; formulaire de saisine CM2C.
- La formulation française de médiation reprend la mention fournie dans l’espace professionnel CM2C.
- **Paiements PRO déverrouillés côté conformité** : le bouton PRO passe désormais par acceptation CGU/CGV + demande d’activation immédiate, puis Stripe si la facturation Stripe est configurée.
- Identifiants entreprise complétés dans les mentions légales : **SIREN 108 855 875**, **SIRET 108 855 875 00010**, **APE 5829C**, RCS Albi.
- Centre conformité mis à jour : médiateur CM2C affiché comme actif au lieu de l’ancien avertissement.
- Résiliation électronique via le portail Stripe conservée.
- Politique RGPD, cookies/stockage, indépendance de Last War et traductions multilingues conservées.
- Aucun nouveau fichier `api/` : compatible avec la limite Vercel Hobby.

## Important
Le déverrouillage juridique ne remplace pas la configuration technique de Stripe : si les variables/endpoints Stripe ne sont pas correctement configurés sur Vercel, WarBoost affichera toujours le message de configuration Stripe correspondant.

## Fonctionnalités conservées de V20.5.16
Cette version conserve **V20.5.15 VS Live Intelligence** et ajoute le suivi **Saison jour après jour**.

## V20.5.16 — Season Live Sync
- Nouveau tableau **🌍 Saison aujourd’hui** dans l’onglet Saison.
- Synchronisation du pseudo + serveur avec LastWar Tools via la fonction existante `api/player-scan.js`.
- WarBoost lit les informations Saison réellement présentes dans la réponse Player Search lorsqu’elles existent.
- Support optionnel d’un endpoint Saison exact avec `LASTWAR_TOOLS_SEASON_STATUS_URL`.
- Si LastWar Tools ne transmet pas encore de numéro/jour de Saison, WarBoost ne l’invente pas : l’utilisateur peut calibrer **Saison + Jour + Phase** une seule fois.
- Après calibration, le jour avance automatiquement chaque jour sur le téléphone jusqu’à la prochaine synchronisation.
- Le tableau affiche Saison, jour, semaine, phase/événement, plan du jour et les 7 prochains repères.
- Le **Conseil rapide Saison** et le **Conseil IA PRO** reçoivent désormais le contexte Saison Live : numéro de saison, jour, phase, événement, source et date de synchronisation.
- Si l’API tombe en panne, le suivi calendrier déjà enregistré continue sans perdre le jour courant.
- Aucune nouvelle Serverless Function Vercel n’est ajoutée.

## Limite fournisseur actuelle
Le site public LastWar Tools présente Player Search, Alliance Rankings, Alliance Members et Kingdom Positions, mais ne garantit pas actuellement un endpoint public dédié au statut de Saison. WarBoost accepte donc uniquement une donnée réellement retournée par l’API, ou un endpoint exact configuré dans Vercel. Le mode calendrier est explicitement étiqueté comme tel.

## Smart API Fallback conservé
- API actuelle : `https://api.lastwar.dev/v1/player/search` avec `Authorization: Bearer`.
- Fallback uniquement si l’API actuelle est indisponible (404/405/5xx/timeout).
- API historique documentée : `https://api.lastwar.tools/world/find-player` avec `X-API-Key`.
- Aucun fallback sur 401/403 ou 429.
- Le fournisseur fonctionnel est mémorisé côté téléphone.
- Une détection automatique ne dépasse pas les limites prévues par les versions précédentes.

## Variables Vercel
- `LASTWAR_TOOLS_API_KEY` obligatoire pour les synchronisations LastWar Tools.
- `LASTWAR_TOOLS_PLAYER_SEARCH_URL` optionnelle.
- `LASTWAR_TOOLS_LEGACY_PLAYER_SEARCH_URL` optionnelle.
- `LASTWAR_TOOLS_ALLIANCE_MEMBERS_URL` optionnelle.
- `LASTWAR_TOOLS_VS_MATCHUP_URL` optionnelle pour un endpoint VS exact.
- `LASTWAR_TOOLS_SEASON_STATUS_URL` optionnelle pour un endpoint Saison exact.

## VS Live Intelligence conservé
- Tableau VS hebdomadaire : alliance vérifiée R4/R5 vs adversaire, puissance totale, Top 10, moyenne, effectifs et difficulté.
- Détection automatique de l’adversaire si le fournisseur l’inclut dans les données disponibles.
- Saisie de secours de l’adversaire si aucun matchup n’est exposé.
- L’adversaire n’est jamais importé comme alliance du joueur.
