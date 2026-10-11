# WarBoost — audit et corrections locales

Date : 11 octobre 2026. Branche : `public-beta-safe-launch`.

Ce rapport décrit les contrôles effectués, pas une certification exhaustive de tous les parcours. Aucun commit, push, déploiement, migration ni enregistrement dans un profil joueur n’a été réalisé pendant cette passe.

## Corrections effectives

- Petit W animé pendant les scans et demandes de conseil IA réellement lancés. Les opérations concurrentes sont suivies séparément ; une ancienne réponse ne masque pas une nouvelle analyse. Arrêt au résultat, à l’erreur, à l’annulation ou au timeout. Pas de temporisation artificielle ni faux pourcentage.
- Message localisé, statut accessible et animation désactivée avec la préférence de mouvement réduit. Le composant est distinct de l’illustration de démarrage.
- Messages opérationnels de scan localisés, y compris sélection/confirmation de la cible, aide au lot, retrait d’une capture, conflit et timeout. Les erreurs techniques de requête ne sont plus directement affichées comme message utilisateur ; les erreurs précises de validation de revue restent distinctes.
- 4 238 entrées auparavant équivalentes à l’anglais complétées dans 21 dictionnaires non anglais. Paramètres, nombres, tags, URL, adresses, monnaies et grades vérifiés. Le résolveur donne explicitement priorité aux nouvelles entrées fournies.
- Deux clés manquantes ajoutées et liens publics sécurité/suppression reliés aux traductions après constat dans le navigateur. 801 clés UI statiquement repérables sont résolues dans 23 locales, soit 22 langues avec deux variantes anglaises.
- Cache des assets mis à jour sans effacer localStorage, session, profils ou scans confirmés.
- Tests historiques remis en conformité : quatre cibles de scan explicites, douze handlers API plus deux modules auxiliaires, roster canonique sans restauration d’une liste cloud legacy, titre Coach espagnol réellement traduit, signature du suivi d’opérations et dépendances du timeout localisé.
- Tests API isolés de la configuration cloud réelle. Le workflow Android supprimé antérieurement n’a pas été recréé : son contrôle est explicitement marqué SKIP, les contrôles Android locaux restant actifs.

L’interface générale, les fichiers du chargement avec personnages, les API de scan, le moteur portraits/équipements, les seuils, la Technologie, l’Alliance et les données joueurs n’ont pas été réécrits.

## Vérifications automatisées

Dernière passe : **71 scripts `test:*` exécutés individuellement, tous avec code de sortie 0**.

L’étape CI GitHub du test Android contient un SKIP explicite : cela ne valide pas un APK ni un workflow Actions.

Commandes de compilation et intégrité :

| Contrôle | Résultat |
| --- | --- |
| `npm run check` | PASS |
| `npm run build:web` | PASS |
| `npm run build` — bundle web mobile | PASS |
| `npm run test:web-build` | PASS |
| `npm run test:mobile-wrapper` | PASS |
| `git diff --check` | PASS |
| `npm run mobile:doctor` | Échec environnement : Xcode absent ; contrôle Android annoncé positif |

Les suites couvrent notamment les quatre cibles, revue/confirmation, propriétaires et réponses obsolètes, provenance, héros/variantes, portraits et conflits, formations multiples, association d’armes, puissances, équipement partiel/illisible/vrai zéro, Drone, Technologie, cloud/roster/rangs, événements, accès bêta/PRO, suppression de compte et wrapper.

Le test de traduction vérifie aussi que chaque entrée complétée est réellement retournée par le résolveur. Le test W couvre 230 messages opérationnels, les vraies fonctions de requête extraites dans un contexte isolé, les erreurs, le nettoyage et l’état occupé de la session.

Ces tests restent majoritairement des fixtures, simulations réseau ou contextes DOM/VM isolés : ils ne remplacent pas une connexion et une sauvegarde cloud réelles.

## Essais Vision réellement effectués

Le vrai `openaiVision` a reçu les captures originales locales et la banque/les atlas existants. La normalisation serveur a ensuite été exécutée. Aucune composition connue du profil n’a été fournie comme indice et aucun profil n’a été sauvegardé.

### Lot Avion : formation et cinq armes

Fichiers `0_1000024445_1791542801874.png` à `5_1000024350_1791542801939.png`, déjà présents dans `attached_assets`.

Retour observé en environ 35,8 s :

| Slot | Proposition | Niveau | Étoiles | Niveau d’arme associé |
| --- | --- | --- | --- | --- |
| 1 | Carlie | 155 | 5 | 5 |
| 2 | Lucius | 155 | 5 | 1 |
| 3 | Morrison | 155 | 5 | 10 |
| 4 | DVA | 155 | 5 | 28 |
| 5 | Skyler | 155 | 5 | 1 |

Puissance totale : **44,43 M**. Résultat cohérent avec l’audit réel antérieur. Ce sont des propositions à confirmer, pas des données automatiquement enregistrées.

### Formation Avion seule : équipements

Source réelle : `5_1000024350_1791542801939.png`. Retour exploitable en environ 26,6 s : mêmes cinq propositions ordonnées, 44,43 M, niveaux 155 et cinq étoiles.

Pour chacun des cinq héros : quatre pièces distinctes, slots 0 à 3, niveau 40. Le retour comporte des raretés orange, et rouge au premier slot de Morrison/DVA/Skyler. Ces couleurs sont des lectures proposées par Vision, pas une nouvelle vérité humaine indépendante ; la revue reste nécessaire.

Deux essais préparatoires avaient utilisé `0_1000024445_1791542801874.png`, qui est en réalité l’écran d’arme Skyler, et n’ont créé aucune formation. Ils ne constituent pas une validation des équipements. Le choix du bon fichier formation a été vérifié avant l’essai exploitable ci-dessus.

### Formation Tank historique

Source : `0_1000024163_1791564974661.png`. Retour en environ 25,7 s :

- 35,19 M ; cinq niveaux 155 et cinq étoiles conservés ;
- Murphy, vide, vide, Marshall, Stetmann proposés dans cet ordre ;
- slots 2 et 3 non résolus : ne pas les forcer ni conclure à une reconnaissance Tank complète.

L’accord d’un modèle avec un audit précédent n’est pas une preuve indépendante de justesse. Les zooms de la même capture ne sont pas non plus des preuves indépendantes.

## Navigateur et sécurité

Une passe réelle à 360 et 430 px a vérifié : sortie du chargement vers l’accueil, absence d’exception JS/import, absence de débordement horizontal sur l’accueil accessible, changement FR/AR/JA/EN, RTL arabe et conservation du choix après recharge.

Le vrai composant W a été exercé dans le DOM avec une opération différée contrôlée : animation, message arabe, concurrence, annulation, réponse obsolète et mouvement réduit vérifiés. Cet exercice n’était pas une requête Vision.

Les pages publiques sécurité, confidentialité et suppression ont ouvert sans connexion. Les deux liens restés français ont ensuite été corrigés avec des clés explicites. La dernière capture de preview montre le chargement original ; la sortie vers l’accueil a été observée dans la passe interactive, pas déduite de cette capture initiale.

Requêtes non authentifiées supplémentaires : `/`, `/security.html`, `/privacy.html`, `/delete-account.html` → 200 ; `/api/state` → 401 ; `/server.mjs` et `/%2e%2e/server.mjs` → 403.

Scans sécurité exécutés : dépendances 0 vulnérabilité signalée ; analyse confidentialité 0 ; SAST **1 alerte HIGH existante** sur `readFile` dans `server.mjs`. Les contrôles de chemin/accès présents et les requêtes négatives ne montrent pas d’exploitation, mais ne suffisent pas à déclarer toute la famille de traversées de chemin impossible. Revue manuelle à conserver.

Un HTTP 403 non identifié a été observé dans le navigateur autour des pages publiques ; elles ont néanmoins rendu correctement, sans exception JS. Son origine exacte n’a pas été établie.

## Limites et validations encore nécessaires

- Deux portraits Tank restent non résolus. Il faut une vérité joueur fiable sur ces slots et des captures nettes avant toute correction de seuil ou association.
- Les 31 héros et variantes sont couverts par les tests de catalogue ; ils n’ont pas tous été validés sur des captures réelles pendant cette passe.
- Pas de nouvelle validation réelle de Drone, Technologie, QG, éveil/reshape, boutique, VS ou Saison : leurs contrôles exécutés sont les suites existantes. Les cas réellement illisibles et les zéros demandent encore des captures appropriées.
- Pas de compte connecté disponible au testeur : pas de prétention de validation E2E de sauvegarde/rechargement cloud des quatre escouades, restriction de la quatrième, connexion réelle, R4/R5, inscriptions ou suppression réelle. Le preview public était en Safe Launch, accès aux fonctions privées désactivé.
- Les dictionnaires sont assistés par modèle, pas relus par 21 locuteurs natifs. La présence de 801 clés ne certifie ni tous les textes construits dynamiquement ni les messages IA locaux encore FR/EN. Les documents publics restent également à traiter séparément pour une publication multilingue.
- Aucun APK/AAB, archive iOS ou essai sur téléphone physique n’a été produit.

## Périmètre

Principaux fichiers : `app.js`, `index.html`, `i18n.js`, `sw.js`, `package.json`, `analysis-indicator.css`, `lib/analysis-indicator.js`, `lib/analysis-copy.js`, `lib/locales/*`, scripts de test/audit et notes de validation.

Les changements restent locaux et non commités. Aucun push, déploiement, modification de données cloud ni intervention sur `demo-lastwar-presentation`.
