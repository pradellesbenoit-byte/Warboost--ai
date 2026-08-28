# WarBoost V2.4.8 — Adaptive Context Intelligence

WarBoost V2.4.8 fait évoluer le Diagnostic PRO vers un moteur **adaptatif et contextuel** tout en conservant les protections de fiabilité introduites dans V2.4.0–V2.4.7.

## Nouveauté principale : contexte joueur adaptatif

Le Diagnostic PRO peut désormais tenir compte de trois informations de contexte enregistrées dans le profil WarBoost :

- objectif principal : Auto, Équilibré, PvP, PvE, VS ou Saison ;
- âge du compte en jours, uniquement s'il est réellement renseigné ;
- profil serveur : Auto/inconnu, Récent, Mature, Compétitif ou Mixte.

Ces champs restent optionnels. En mode **Auto**, WarBoost utilise seulement les données réellement disponibles dans le compte, les scans, le VS et la Saison. Il n'invente ni l'âge du compte ni le profil du serveur.

## Diagnostic PRO V2.4.8

Le moteur compare maintenant les goulots disponibles avec un **rendement marginal contextuel** :

- héros et armes exclusives ;
- Éveil / Reshape Saison 6 ;
- équipement ;
- technologies ;
- Drone ;
- niveaux / étoiles ;
- timing VS et Saison.

Chaque priorité peut afficher :

- impact ;
- efficacité ressources ;
- rendement marginal /100 ;
- niveau de certitude : Certain, Probable ou Spéculatif ;
- condition d'utilisation ;
- date du calcul.

Les recommandations restent conditionnelles : WarBoost peut demander de rafraîchir les données, de conserver une ressource pour le VS, ou de vérifier le retour à court terme avant de dépenser.

## Technologie adaptative

V2.4.8 ne choisit plus simplement la première technologie connue. Le moteur recherche parmi les branches réellement renseignées une **technologie incomplète présentant le meilleur compromis entre écart restant et pertinence pour l'objectif actuel**.

Aucun objectif de niveau ou coût exact n'est inventé lorsqu'il n'est pas confirmé par les données visibles/fiables.

## Boutique IA

Le conseiller Boutique continue de fonctionner en catalogue partiel tant qu'aucun catalogue officiel Last War n'est disponible.

Correctif V2.4.8 : la sélection de l'escouade de référence du conseiller Boutique utilise correctement les escouades configurées et fiables. Les protections précédentes restent actives :

- scans de boutiques cumulés au lieu d'écraser l'historique récent ;
- doublons fusionnés ;
- articles vendus exclus ;
- prix ambigus non inventés ;
- coffres opaques plafonnés ;
- ressources situationnelles dépendantes du contexte VS/Saison ;
- disponibilité actuelle jamais affirmée sans preuve ;
- réserve diamant conservée dans la logique d'achat.

## Saison 6 — Awakening / Reshape

La logique V2.4.4 reste conservée :

- prérequis visibles d'Éveil ;
- comparaison relative Éveil / EX / équipement / technologie / Drone ;
- bonus de formation mono-type pris en compte ;
- prudence sur les compositions hybrides sans synergie mesurée ;
- aucune projection exacte de puissance post-Reshape sans source fiable.

## Mémoire par identité de héros

Le registre `hero_profiles` de V2.4.7 est conservé sans modification fonctionnelle :

- les valeurs restent attachées au héros et non au slot ;
- déplacer un héros ne copie pas ses données sur un autre héros ;
- un scan partiel n'efface pas une ancienne valeur fiable ;
- les doublons inter-escouades restent bloqués ;
- Kimberly EX19 reste conservable comme donnée confirmée ;
- une valeur déjà perdue avant le registre n'est jamais reconstruite artificiellement.

## Multilingue

Les nouveaux libellés V2.4.8 du contexte adaptatif, de l'efficacité ressources, du rendement marginal, de la certitude, des conditions et de la date de recommandation sont couverts dans les **23 choix de langue explicites** de l'interface WarBoost (les 22 langues prévues avec les variantes anglais UK/US), en plus du mode Auto.

## Intégration officielle

WarBoost reste un compagnon indépendant et **approval-first / API-ready**. Aucune automatisation de gameplay ni accès non autorisé n'est ajouté. Une intégration officielle Last War pourra être branchée si l'autorisation correspondante est obtenue.
