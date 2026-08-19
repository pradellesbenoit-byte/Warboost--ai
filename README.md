# WarBoost V20.5.33 — Voix R4 futuriste WarBoost

## V20.5.33 — Signature vocale R4

- Le salut français **« Bonjour, mon Colonel ! »** du grade R4 utilise désormais une voix **futuriste / signature WarBoost** : plus profonde, légèrement métallique et avec un écho court, tout en restant intelligible.
- Les autres grades et la musique **03 — Électro Motivante** restent inchangés.
- Dans les autres langues, la synthèse vocale R4 utilise un réglage plus grave et posé afin de conserver le même esprit WarBoost.
- Le Smart Cache Last War et l’économie de tokens de V20.5.32 sont conservés sans modification fonctionnelle.
- Service Worker passé à **V20.5.33**. Toujours **4 fichiers** de déploiement.

## Historique — V20.5.32

## V20.5.32 — Smart Cache partagé Joueur · R5/R4 · VS

- La synchronisation automatique du profil **ne refait plus un appel à chaque connexion** : les données de moins de **30 minutes** sont réutilisées avec **0 appel LastWar Tools**.
- Le profil Joueur réutilise les données déjà obtenues par **R5/R4** et **VS** (pseudo, serveur, alliance, rôle, QG, puissance quand disponible).
- Le cache joueur signé est maintenant partagé avec le VS : quand il est valide, le VS peut éviter un nouvel appel Player Search.
- Un succès R5/R4 ou VS alimente immédiatement le profil Joueur local sans appel supplémentaire.
- En cas de **HTTP 402 / tokens épuisés**, WarBoost garde le dernier profil valide, affiche un état **CACHE** et met les relances automatiques en pause pendant 1 heure. Le bouton **Synchroniser maintenant** reste disponible pour forcer une tentative.
- Les héros, le Drone, les équipements, la technologie et toutes les saisies détaillées restent intacts.
- Service Worker passé à **V20.5.32**. Toujours **4 fichiers** de déploiement.

## Historique — V20.5.31

## V20.5.31 — Profil joueur synchronisé à la connexion

- À chaque nouvelle session WarBoost connectée en **PRO**, WarBoost tente automatiquement de mettre à jour le profil joueur via la même infrastructure **LastWar Tools** utilisée par R5/R4, VS et Saison.
- Synchronisation des données publiques réellement disponibles : **pseudo, serveur, alliance, rôle R1–R5, niveau QG, puissance totale et coordonnées** lorsqu’elles sont exposées par le fournisseur.
- Pour récupérer la **puissance** et le **rôle** quand Player Search ne les fournit pas, WarBoost peut consulter Alliance Members puis ne conserve que la fiche du joueur connecté. Aucune permission R4/R5 n’est nécessaire pour cette fiche personnelle ; le verrou R4/R5 reste obligatoire pour importer le roster complet.
- Le **cache joueur signé** et la limite de **2 appels LastWar Tools maximum par action** sont conservés afin de limiter la consommation de tokens.
- L’escouade détaillée, les héros, le Drone, les équipements, la technologie et les saisies manuelles **ne sont jamais effacés** si LastWar Tools ne les expose pas.
- Une carte **Profil Last War** dans l’onglet Joueur affiche la dernière synchronisation et propose **Synchroniser maintenant**.
- Si LastWar Tools est indisponible, WarBoost conserve le dernier profil et continue avec les captures / saisies enregistrées.
- Le rôle synchronisé devient prioritaire pour l’en-tête et les salutations vocales.
- Service Worker passé à **V20.5.31**. Toujours **4 fichiers** de déploiement.

## Limite importante

Il s’agit d’une synchronisation via les données communautaires/publiques accessibles à WarBoost, pas d’une liaison officielle du compte Last War. Les informations non exposées par cette source (par exemple héros, équipement détaillé ou Drone) restent alimentées par Smart Scan et la saisie WarBoost.

## Historique — V20.5.30

## V20.5.30 — Pseudo, grade et salut de section

- Le premier badge de l’en-tête affiche maintenant en priorité le **pseudo Last War du joueur connecté** (profil/synchronisation), et non un libellé générique « Joueur ».
- Le badge **Rôle** affiche le grade réel **R5 / R4 / R3 / R2 / R1** dès qu’il est connu dans le compte, le profil joueur ou la vérification Last War.
- Quand le joueur ouvre pour la première fois de la session l’onglet **🎮 Joueur**, WarBoost prononce la salutation liée à son grade, par exemple **« Bonjour, mon Colonel ! »** pour un R4.
- Même comportement à la première entrée de la session dans **🧠 IA R5/R4**. La salutation n’est pas répétée à chaque clic.
- La salutation reste multilingue et suit la langue choisie dans WarBoost : français, anglais, anglais US, espagnol, allemand, japonais, chinois et arabe.
- L’accueil conserve **« Bienvenue dans WarBoost ! »** au lancement.
- La musique **03 — Électro Motivante** et le correctif de chargement V20.5.29 sont conservés.

## V20.5.29 — Salutation vocale multilingue selon le grade

- La musique choisie reste **03 — Électro Motivante**.
- La salutation vocale suit désormais **la langue sélectionnée par le joueur** dans WarBoost.
- Langues prises en charge : **français, anglais (R.-U.), anglais américain, espagnol, allemand, japonais, chinois et arabe**.
- Le rôle reste personnalisé : **R5 Général · R4 Colonel · R3 Lieutenant · R2 Sergent · R1 Soldat**, avec l’équivalent naturel dans chaque langue.
- En français, WarBoost conserve les voix WAV embarquées de V20.5.27. Dans les autres langues, il utilise la synthèse vocale du téléphone/navigateur avec la locale exacte (ex. `en-US`, `ja-JP`, `ar-SA`).
- Quand le joueur change volontairement de langue après avoir activé l’audio, WarBoost rejoue une fois la salutation dans la nouvelle langue.
- Le texte de salutation affiché sur l’accueil est synchronisé avec la langue choisie, y compris le sens RTL en arabe.
- La musique continue de se mettre en pause en arrière-plan et reprend au retour si elle est activée.
- Aucun nouveau fichier de déploiement : **toujours 4 fichiers**.

## V20.5.27 — Musique 3 + salut vocal + pause arrière-plan

- La musique choisie est **03 — Électro Motivante**. Elle est embarquée directement dans `index.html` pour conserver le déploiement en 4 fichiers.
- La musique se **met en pause immédiatement** lorsque WarBoost passe en arrière-plan / quand l’utilisateur revient au menu du téléphone.
- Elle reprend uniquement quand WarBoost revient au premier plan et que la musique est activée.
- À la fin du chargement, l’écran attend maintenant le bouton **Entrer** : ce geste déverrouille l’audio Android de manière fiable.
- Salut vocal automatique après entrée selon le rôle connecté : **R5 Bonjour mon Général · R4 Bonjour mon Colonel · R3 Bonjour mon Lieutenant · R2 Bonjour mon Sergent · R1 Bonjour Soldat**.
- Les salutations sont embarquées et ne dépendent pas d’un service vocal externe.
- Le bouton 🎵/🔇 reste disponible et mémorise le choix de l’utilisateur.


## V20.5.26 — Mascot Loading + Music + Rank Greetings

### Identité visuelle WarBoost
- Nouvel écran plein écran de **chargement animé 10 secondes** inspiré de la mascotte WarBoost : robot WB, drone, diamant, bouclier, potion et café du QG.
- Progression amusante : héros, troupes, drone, musique, grades et derniers réglages.
- Fin automatique avec message personnalisé selon le grade.

### Grades personnalisés
- **R5 → Mon Général**
- **R4 → Mon Colonel**
- **R3 → Mon Lieutenant**
- **R2 → Mon Sergent**
- **R1 → Soldat**
- Le formulaire compte cloud permet désormais de sélectionner R1 à R5.
- Accueil personnalisé selon le grade connecté.

### Musique WarBoost
- Petite ambiance musicale générée directement dans le navigateur, sans fichier audio externe.
- Bouton 🎵 / 🔇 dans l’en-tête et préférence mémorisée.
- Sur mobile, la musique démarre après le premier toucher lorsque le navigateur autorise l’audio.

### Sécurité conservée
- Le **Guest Lock V20.5.25** reste actif : quand le compte cloud est déconnecté, les pages sensibles restent masquées.
- Aucun nouveau fichier API : toujours les 4 fichiers de déploiement habituels.


## V20.5.25 — Guest Lock

### Correctif sécurité demandé
- Quand l'application est **déconnectée**, WarBoost passe en **mode protégé**.
- Les pages et données sensibles sont **masquées** derrière un écran de connexion.
- Les onglets **Joueur / IA R5-R4 / VS / Saison** sont bloqués tant que le compte cloud n'est pas reconnecté.
- Au clic sur une section bloquée, WarBoost ouvre directement **Compte cloud**.
- Les données locales restent conservées sur l'appareil, mais elles ne sont plus visibles en mode déconnecté.

## V20.5.24 — Loading Strip + Logo Clean

### Ajustements demandés
- Suppression du petit numéro de version à côté du logo **WarBoost** dans l'en-tête.
- Ajout d'une **petite bande de chargement de 10 secondes** à l'ouverture de l'application.
- La bande affiche une **annonce amusante WarBoost** avec messages qui tournent pendant le chargement.
- Le badge rond déjà retiré et les champs d'exemple vides du **Copilote IA R5/R4** sont conservés.

## V20.5.23 — Header Cleanup

### Ajustements demandés
- Suppression du badge version en haut de l'application.
- Suppression des textes d'exemple dans le formulaire **Copilote IA R5 / R4**.
- Les champs Alliance, Serveur, Nombre de membres et Question / situation s'ouvrent désormais visuellement vides.
- Le petit numéro de version à côté du logo WarBoost reste conservé.

Cette version conserve **V20.5.21 Token Saver + Alliance Cache** et finalise l’expérience produit qui ne dépend pas de la disponibilité de LastWar Tools.

## V20.5.22 — Final Product Polish

### Parcours de démarrage
- Nouveau **Centre de démarrage WarBoost** sur l’accueil avec progression de configuration.
- Checklist claire : compte WarBoost, escouade principale, PRO, alliance R4/R5 et installation PWA.
- **Onboarding guidé** pour les nouveaux utilisateurs, avec accès direct à chaque étape.
- Le mode FREE reste utilisable ; PRO, alliance et installation PWA sont présentés comme étapes optionnelles lorsqu’elles ne sont pas nécessaires.

### Résilience produit / modes secours
- WarBoost indique explicitement les modes de secours lorsque LastWar Tools, le cloud ou une autre source externe est indisponible.
- Les captures, la saisie manuelle, le cache local et les analyses locales restent accessibles quand la fonction le permet.
- Aucun écran ne doit laisser croire qu’une donnée externe est disponible lorsqu’elle ne l’est pas.

### Aide & diagnostic
- Nouveau **centre Aide & diagnostic** accessible depuis l’accueil et le pied légal.
- Diagnostic support volontairement sûr : version, réseau, état cloud, formule, escouade, taille du roster, fournisseur LastWar mémorisé, présence du cache joueur et mode PWA.
- Le diagnostic **n’inclut jamais la clé LastWar Tools, mot de passe ou données bancaires**.
- Copie du diagnostic et préparation d’un e-mail support en un clic.

### Finition / commercialisation
- Version et cache PWA passés à **V20.5.22**.
- Les fonctions existantes restent inchangées : Smart Scan, Boutique IA, R4/R5, VS, Saison, cloud, Stripe/PRO, CM2C, RGPD et moteur multilingue.
- Toujours seulement **4 fichiers de déploiement** et aucune nouvelle Serverless Function.

## V20.5.21 — Token Saver + Alliance Cache conservé

Cette version conserve **V20.5.20 Alliance Members Resilience**, **V20.5.19 LastWar API Resilience** et **V20.5.18 CM2C + PRO Ready**, avec un objectif principal : **économiser les tokens LastWar Tools** et éviter de refaire Player Search à chaque synchronisation.

## V20.5.21 — Token Saver + Alliance Cache

### Économie de tokens LastWar Tools
- Après un **Player Search réussi**, le serveur WarBoost renvoie un **jeton de cache signé** lié au compte WarBoost, au pseudo Last War, au serveur, à l’alliance détectée et au mode API fonctionnel.
- Le jeton est stocké sur le téléphone mais **ne contient jamais la clé API LastWar Tools**. Il est signé côté serveur avec un HMAC dérivé du secret déjà présent dans Vercel.
- Tant que ce cache est valide, **Player Search coûte 0 appel LastWar Tools** : la synchronisation peut consacrer jusqu’à **2 appels à Alliance Members**.
- Le cache expire par défaut après **7 jours**. L’override facultatif `LASTWAR_TOOLS_PLAYER_CACHE_HOURS` permet de choisir de 1 h à 720 h.
- Si le roster ne contient plus le joueur ou renvoie une autre alliance, WarBoost invalide le cache et exigera un nouveau Player Search.
- Le contrôle final reste inchangé : le même joueur doit apparaître dans le roster en **R4 ou R5** avant tout import.

### HTTP 402 / solde de tokens
- Un **HTTP 402** est maintenant reconnu comme **solde de tokens LastWar Tools épuisé**.
- WarBoost **n’effectue plus de fallback inutile** après un 402 : un seul appel échoue, puis l’utilisateur est invité à attendre le prochain reset de son dashboard LastWar Tools ou à recharger son solde.
- Les erreurs 401/403 et 429 continuent également à bloquer le fallback.

### Budget d’appels
- Une action de synchronisation ne dépense jamais volontairement plus de **2 appels LastWar Tools**.
- Si la découverte du fournisseur consomme déjà 2 appels, WarBoost met le profil en cache et s’arrête avant Alliance Members. La relance suivante utilise le cache et réserve les appels au roster.
- Aucun nouveau fichier `api/` n’est ajouté : la fonction partagée `api/player-scan.js` reste compatible Vercel Hobby.

## V20.5.20 — Alliance Members Resilience conservé
- Priorité à `/world/alliance-members` lorsque Player Search fonctionne en API historique X-API-Key.
- Seconde route roster compatible possible sur 404/405/5xx/timeout.
- Délais adaptatifs et diagnostics sûrs (route, HTTP, durée, jamais la clé).

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


## V20.5.29 — Correctif écran de chargement
- Corrige le blocage à 0 % causé par les étapes de splash manquantes.
- Ajoute des étapes de chargement multilingues.
- Ajoute un bouton « Passer et entrer » après 1,5 s.
- Ajoute un fail-safe à 12 s : le splash ne peut plus bloquer l’accès.
- Conserve la musique 3 Électro Motivante et les salutations vocales multilingues par grade.
- Rend le Service Worker tolérant aux ressources PWA absentes.
