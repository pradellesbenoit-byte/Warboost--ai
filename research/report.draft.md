# Last War : règles d’événements et stratégie WarBoost

**Date de recherche :** 2026-10-02  
**Profondeur :** Deep  
**Sources consultées :** {{SOURCE_COUNT}}  
**Portée :** documentation publique accessible, pas d’accès au jeu ni aux messages Discord privés.

## Synthèse

La recherche fournit des pistes utiles pour planifier les objectifs et la coordination, mais pas un règlement officiel complet et actuel pour tous les événements. Les deux guides Désert accessibles décrivent largement les mêmes mécanismes, sans identifier un build du jeu correspondant au serveur du joueur. L’un comporte même deux minutages différents pour l’apparition des puits. Ces textes sont de la documentation communautaire, pas une certification des règles actuelles. [@desert-tutorial] [@desert-ldshop]

Canyon dispose de références de support officielles, mais leurs pages complètes étaient derrière une connexion. Les extraits indexés attestent seulement une présentation asymétrique et quelques priorités relatives d’objectifs. Ils ne justifient pas de certifier les coûts, dégâts, délais ou formules de score d’un guide tiers. [@canyon-official-launch] [@canyon-official-report] [@canyon-handbook]

WarBoost doit donc distinguer trois éléments : les observations en jeu déjà conservées dans le projet, les descriptions communautaires, et les propositions stratégiques calculées à partir des données réelles. Le moteur livré suit cette séparation. Il ne prétend pas prédire une victoire, connaître l’adversaire ni récupérer un règlement officiel en temps réel. Les chiffres contestés restent consultables, mais ne commandent pas les décisions.

## Résultats et niveau de preuve

### Désert : privilégier les objectifs sans dépendre d’un chronomètre incertain

Last War Tutorial décrit des groupes affectés aux structures, une distinction entre points d’alliance et récompense individuelle, et des remplaçants entrant lorsque des places sont disponibles. Il présente 20 titulaires et 10 remplaçants par force opérationnelle, avec deux forces possibles. Les 60 inscriptions cumulées ne constituent donc pas, dans ce guide, une bataille à 60 joueurs. LDShop reprend cette distinction. La capacité conservée par WarBoost reste une politique fondée sur les observations du projet ; elle n’est pas rebaptisée « règlement officiel vérifié ». [@desert-tutorial] [@desert-ldshop]

Le guide LDShop situe les puits à 13 minutes dans sa description des phases et à 20 minutes dans ses conseils ultérieurs. Aucune règle primaire accessible n’a permis de résoudre cet écart. Le moteur réagit à des états qualitatifs — ouverture, centre accessible, fin — plutôt que d’exécuter automatiquement une action à l’un de ces délais. Les recommandations de concentration, soutien et réserve restent des propositions, non des obligations du jeu. [@desert-ldshop] [@desert-tutorial]

### Canyon : conserver le contexte asymétrique, pas certifier des valeurs isolées

L’extrait de lancement officiel parle d’un champ de bataille à trois et oppose « Elite Army » à « Coalition Forces ». Un extrait de rapport officiel place la Tour d’Alimentation derrière le Laboratoire de Virus en rendement et évoque l’association Judicator/téléportation. Cela étaye une priorité relative, pas une formule de points ni des délais précis. [@canyon-official-launch] [@canyon-official-report]

Le guide Handbook est daté et explicite sur ses limites : mode présenté comme évolutif, données issues de retours communautaires et plusieurs valeurs non corroborées. Ses noms de factions diffèrent de ceux de l’extrait officiel. Les taux de points, durabilité et compétences doivent donc être reconfirmés sur le serveur concerné. Les observations déjà conservées par WarBoost sont affichées avec leur date, sans servir de calcul de victoire. [@canyon-handbook]

### VS et Saison : le contexte visible prime sur une table universelle

Les guides VS décrivent un cycle de thèmes quotidiens et recommandent de réserver les ressources aux tâches qui marquent le bon jour. Leurs tableaux de points de victoire ne concordent pas. Le moteur ne choisit pas arbitrairement l’un d’eux ; les scores et la fenêtre effectivement observés restent la base des décisions existantes. [@vs-guide] [@vs-vault] [@vs-tutorial]

Le calendrier tiers propose une conversion du reset et un délai de démarrage VS, mais n’apporte pas une preuve officielle pour chaque serveur ou changement d’heure. Le guide de saisons décrit un cycle depuis sa perspective Saison 6 : le généraliser à un compte hors saison serait injustifié. WarBoost conserve ses protections de cycle actif, terminé et intersaison et ne déduit pas un événement disponible d’un simple numéro de saison. [@event-calendar] [@season-guide]

### Événements récents, Discord et API

Le site régional officiel mentionne Goldvein War et Saison 6 dans ses extraits promotionnels. Il ne fournit, dans les preuves accessibles, ni date de lancement vérifiée ni règlement complet. Un guide Goldvein tiers ne comble pas cette absence. Aucun nouvel événement n’est donc activé sur la seule base d’une date de mise à jour de page. [@official-regional] [@ldshop-gg-blog-last-war-survival-goldvein-war-guide-html]

Les pages Discord identifient un serveur ou une invitation, pas des messages d’annonces consultés. La documentation API découverte mentionne un service de données tiers ; son caractère officiel et sa couverture des règles n’ont pas été établis. La mise à jour retenue est curatée et manuelle, pas un scraping ni une promesse de temps réel. [@discord-com-servers-last-war-survival-game-1141583924468908043] [@discord-com-invite-lastwarsurvival] [@third-party-api]

## Architecture et stratégie retenues

Le registre central contient des affirmations atomiques avec sources, type de provenance, confiance, date de vérification, build et portée serveur inconnus lorsqu’ils ne sont pas établis, intervalle de revue, supersession et journal de changements. Les sources officielles accessibles seulement sous forme d’extrait sont distinguées des articles complets. Les observations locales antérieures ne sont pas effacées simplement parce que leur preuve publique reste inaccessible.

La sélection stratégique utilise des disponibilités explicites, sourcées et datées pour l’instance concernée. Une inscription ne devient pas une participation historique. Les absents confirmés sont séparés des non-répondants. Un dépassement de capacité ne crée pas automatiquement un statut remplaçant dans le nouveau moteur. Les événements ouverts comptent l’ensemble du roster actif, sans reprendre la limite de 20 des tempêtes.

Les affectations expliquent les éléments utilisés : puissance d’escouade récente en priorité, puissance du compte seulement comme contexte de repli, type connu, et résultats de participation réellement confirmés. La fiabilité ne pénalise pas les inconnus, excusés ou non-sélectionnés. Un rôle flexible reste à confirmer lorsque la puissance est absente ou ancienne. Le grade ne prouve ni compétence tactique ni disponibilité.

Les plans A/B/C sont conditionnels. A organise les objectifs visibles et conserve une réserve ; B concentre les forces si l’adversaire paraît plus fort ou si un objectif est perdu ; C réaffecte les joueurs réellement disponibles et réévalue le score en fin de bataille. Ce sont des heuristiques de coordination, cohérentes avec les conseils communautaires de concentration et soutien, pas une méta officiellement validée. Sans observation adverse explicite, aucune puissance ni composition ennemie n’est inventée. [@desert-tutorial] [@canyon-handbook]

## Limites

Les sources sont surtout des sites communautaires, commerciaux et des extraits. Le seuil de consultation est atteint, mais le critère strict de trois preuves indépendantes dont deux Tier 1/2 n’est pas satisfait pour les chiffres opérationnels. Ces chiffres ne constituent donc pas des résultats certifiés. Les guides peuvent partager la même origine ; leur répétition ne prouve pas leur indépendance.

Restent non établis officiellement : les minutages exacts, plusieurs formules de score, la procédure actuelle de remplacement Canyon, les traductions des factions, les poids VS, la portée serveur/saison, le build applicable et les dates de lancement récentes. Les recherches complémentaires et la veille Sep/Oct 2026 n’ont pas levé ces limites. Un accès au panneau de règles actuel du jeu reste nécessaire pour les certifier.

## Recommandations

Maintenir le registre par revue normale de sources publiques et observations en jeu confirmées. Chaque révision doit ajouter une source sauvegardée, préserver l’ancienne affirmation comme supersédée et préciser la portée. Les nombres contradictoires restent bloqués pour les calculs tant que la contradiction n’est pas résolue.

Valider les propositions avec les R4/R5 avant la bataille et confirmer présence, faction et objectifs dans le jeu. L’interface mobile expose d’abord les consignes, puis les raisons et sources dans des sections ouvrables. Les pourcentages décrivent la couverture des entrées, jamais la probabilité de gagner.

## Inventaire des preuves consultées

Ce tableau distingue les pages lues des pistes limitées à un extrait. Une référence sans contenu utile n’est pas utilisée comme corroboration d’une règle.

| Référence | Portée de la preuve | Citation |
|---|---|---|
{{SOURCE_INVENTORY}}