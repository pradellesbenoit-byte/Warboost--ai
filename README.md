# WarBoost V1.4.4 — API-ready / Approval-first

## Nouveautés V1.4

- Couche d’intégration Last War préparée pour un futur accès officiel en lecture seule.
- Aucune source Last War non autorisée n’est activée par défaut.
- Nouveau chemin prioritaire `WARBOOST_LASTWAR_OFFICIAL_URL`.
- Consentement explicite et périmètre `read_only_account_analysis` envoyés au fournisseur officiel.
- Suivi de provenance : type de fournisseur, statut d’accès, capacités et date de dernière synchronisation officielle.
- WarBoost Scan et cloud alliance restent pleinement fonctionnels pendant l’attente de l’autorisation.
- Ancienne source publique conservée uniquement en compatibilité, désactivée tant que `WARBOOST_ALLOW_LEGACY_PROVIDER=true` n’est pas explicitement défini.
- Interface multilingue mise à jour pour afficher clairement « autorisation officielle en attente ».
- Conseiller Boutique PRO, armes exclusives, escouades et logique V1.3.3 conservés.

## Stratégie

Cette version peut être développée et testée sans dépendre d’une API Last War. Si Last War / FirstFun fournit ensuite une API, un SDK ou un endpoint partenaire, il suffira de brancher l’adaptateur officiel prévu, sans refaire le reste de l’application.

---

# WarBoost V1.3.3 — Conseiller Boutique Adaptatif PRO

## Nouveautés V1.3.3

- Chaque offre scannée reçoit maintenant un **score adaptatif /100** au lieu d'un classement fixe.
- Le score combine : escouade principale, héros confirmés, étoiles, niveaux d'armes exclusives, équipement, Drone, type de boutique, prix/remise visibles, jour VS, saison et budget diamants quand le solde est visible.
- Le scan Boutique peut désormais lire, lorsqu'ils sont réellement visibles : **solde de monnaie**, **niveau VIP** et **jours VIP restants**. Ces valeurs ne sont jamais inventées.
- **Protection budget diamants** : WarBoost réserve par défaut 10 000 diamants pour le VIP 30 jours. Une offre qui ferait passer le solde sous cette réserve est fortement pénalisée, sauf si le joueur achète précisément l'activation VIP.
- Si le solde diamants n'est pas lisible, WarBoost conserve le score de valeur mais affiche une prudence budget et baisse légèrement la confiance globale.
- **Contexte VS** : petits bonus de priorité sur les objets correspondant au jour visible (Drone, construction, recherche, héros, accélérateurs, boucliers/téléporteurs/soins) sans remplacer la valeur long terme du compte.
- **Contexte Saison** : l'endurance et le Drone peuvent gagner légèrement en priorité lorsqu'une saison active est connue.
- Les héros déjà **5★** font baisser fortement les fragments héros génériques ; les armes exclusives en retard remontent automatiquement.
- Les achats en argent réel sont volontairement plafonnés : une remise ne suffit jamais à produire « À prendre » si le pack ne résout pas un goulot ciblé.
- La Boutique Honneur continue de protéger les plans d'équipement rares ; les ressources génériques et coffres de ressources restent faibles face aux matériaux rares.
- Correction de précision importante : une ligne comme **« 4 équipements niv.40 »** est maintenant comprise comme équipement **niveau 40**, et non comme niveau 4.
- Le résultat Boutique affiche maintenant **Priorité XX/100**, **À prendre / Si surplus / À éviter**, la raison, le prix et la cible quand elle est identifiable.

### Références moteur — 21/08/2026

Les règles de base ont été recroisées avec des sources 2026 récentes sur les boutiques, les plans d'équipement et le calendrier Alliance Duel/VS, notamment Last War Vault, LastWarSurvival.com et des retours communautaires récents. Ces références servent de garde-fous de rareté et de timing ; **les données scannées du compte et de la boutique restent prioritaires**. WarBoost n'est pas affilié officiellement à Last War.

---

# WarBoost V1.3.1 — Libellés escouades + Skyler

## Correctifs V1.3.1

- Les cartes Joueur affichent toujours **Escouade 1 / Escouade 2 / Escouade 3 / Escouade 4** (traduits selon la langue). Un texte lu dans une capture, comme `Formation Actuelle`, ne peut plus remplacer le nom de l’emplacement.
- Le serveur de scan force également le nom interne `Squad 1..4`, afin d’éviter que ce libellé erroné revienne après une synchronisation.
- Le nom **Skyler / Shuyler** est désormais canonicalisé et affiché comme **Skyler** dans WarBoost, y compris pour les anciennes données déjà enregistrées.
- Les armes exclusives associées à cet ancien nom sont migrées automatiquement vers **Skyler**.
- La confirmation des 5 héros, les niveaux, étoiles, équipements, armes exclusives, PRO, Stripe, Supabase, Sync hybride et les langues restent inchangés.

---

# WarBoost V1.3.0 — Hero Identity Confirmation

Les noms de héros ne sont plus devinés à partir des portraits seuls. Après un scan d’escouade, le joueur confirme les 5 noms avant enregistrement.

# WarBoost V1.3.0 — Identité héros vérifiée

## Correctif V1.3.0

Cette version corrige les noms de héros inventés ou mal associés lors d’un scan d’escouade.

- Le premier passage Vision ne peut plus attribuer un nom à partir du portrait seul.
- Les noms lisibles à l’écran sont acceptés uniquement avec une confiance élevée.
- Les portraits passent par une reconnaissance stricte puis une seconde vérification indépendante.
- Un portrait n’est accepté qu’avec une confiance très élevée et au moins deux indices visuels.
- Le type de héros (Tank / Aircraft / Missile) est contrôlé pour bloquer les incohérences.
- Les anciens noms non fiables sont effacés lors du prochain scan de l’escouade au lieu d’être conservés.
- WarBoost préfère afficher « Héros 1 » plutôt que d’inventer un mauvais nom.
- Correction du catalogue : `Blaz` remplace l’ancienne faute `Braz`.

Les niveaux, étoiles, équipements, armes exclusives, Drone, PRO, internationalisation et verrouillage Escouade 1/2/3/4 sont conservés.

---


Cette version corrige le cas où une escouade était bien analysée (niveau, étoiles, équipements, puissance) mais restait affichée comme `Héros 1`, `Héros 2`, etc.

## Améliorations V1.2.8

- image envoyée à WarBoost Vision en résolution supérieure (jusqu’à 2048 px) pour mieux lire les portraits et petits textes ;
- catalogue contrôlé des héros Last War pour canonicaliser les vrais noms (DVA, Lucius, Carlie, Morrison, Skyler, etc.) ;
- seconde passe Vision ciblée uniquement sur les portraits si le premier scan n’a pas reconnu tous les noms ;
- aucun remplissage basé uniquement sur une composition “probable” : WarBoost exige une preuve visuelle suffisante ;
- conservation de toutes les fonctions V1.2.7 : 4 emplacements d’escouade séparés, Escouade 4 optionnelle, armes exclusives intégrées aux héros, PRO, Stripe, Supabase, traduction mondiale et Sync hybride.

## Test recommandé

Après déploiement, re-scanner chaque escouade une fois. Les anciens libellés génériques ne sont remplacés que lorsqu’un nom réel est reconnu avec suffisamment de confiance.

---


## Corrections demandées

- Les escouades affichent maintenant les vrais noms de héros lorsqu’ils sont lus/reconnus par WarBoost Vision (DVA, Lucius, etc.).
- WarBoost Vision ne renvoie plus volontairement des placeholders `Hero 1`, `Héros 1`, etc. ; il lit le texte du nom et peut reconnaître un portrait uniquement avec forte confiance.
- Le scan **Arme exclusive** reste directement dans le sélecteur principal **WarBoost Scan**, au même endroit que Profil/QG, Escouades, Drone, VS et Saison.
- La section/bouton séparé « Scanner une arme exclusive » a été retiré de Joueur pour éviter le doublon.
- Lorsqu’une arme exclusive est associée à un héros connu, son résultat est affiché directement à la suite de son niveau et de ses étoiles : par exemple `Nv.150 · 5★ · Lame de Frappe Nv.23 · Puissance 7 237 471`.
- Les bonus détaillés de l’arme (PV, ATQ, Défense, résistance, compétence max) sont affichés juste sous la ligne du héros.
- Correction du format de puissance d’arme exclusive : une valeur comme `7 237 471` reste un entier complet et n’est plus traitée comme une puissance en millions.
- Les garde-fous V1.2.3 sur les emplacements Escouade 1/2/3/4, l’Escouade 4 optionnelle V1.2.5, PRO, Stripe, Supabase, galerie Android, langues et Sync hybride sont conservés.

### Important après mise à jour
Les anciens scans qui avaient enregistré `Héros 1`, `Héros 2`, etc. ne peuvent pas être renommés de manière sûre sans nouvelle lecture de l’image. Re-scanner chaque escouade une fois avec V1.3.0 efface les anciennes identités douteuses puis ne conserve que les noms vérifiés.

---


## Nouveauté Joueur
- Nouvelle section **Armes exclusives** dans **Joueur**.
- Nouveau type de scan **Arme exclusive** dans WarBoost Scan.
- Vision peut lire, quand ils sont visibles : héros, nom de l’arme, niveau, puissance, bonus PV/ATQ/Défense, résistance à tous les dégâts et niveau de compétence max.
- Plusieurs armes exclusives peuvent être enregistrées sans écraser les escouades.
- Lorsqu’un héros scanné correspond à une arme exclusive enregistrée, son niveau EX est réutilisé dans l’affichage et le diagnostic PRO.
- Conservation de la V1.2.5 : Escouade 4 optionnelle, scans d’escouades indépendants, PRO, Stripe, Supabase, Android Gallery, 8 langues et Sync hybride.

# WarBoost V1.2.5 — Optional Squad 4

## Correctif V1.2.5
- Escouade 4 désormais **optionnelle** : son absence ne réduit plus la confiance PRO et ne déclenche plus « Compléter les données ».
- Les joueurs ayant débloqué/acheté l'Escouade 4 peuvent toujours la scanner ; elle est alors intégrée automatiquement à la comparaison.
- L'interface affiche « optionnelle / à débloquer dans Last War » quand aucun scan Escouade 4 n'existe.
- La confiance PRO se calcule sur les escouades réellement disponibles (3 ou 4) + le Drone.
- Traductions mises à jour dans les 8 langues.

# Historique V1.2.4 — PRO Squad Intelligence

- **Priorité IA PRO** compare désormais réellement les escouades enregistrées au lieu de choisir uniquement la plus puissante.
- Analyse les données visibles des 5 héros : niveaux, étoiles, puissance, arme exclusive et équipement.
- Classe jusqu'à 4 actions prioritaires et indique **quoi améliorer**, **quoi prendre gratuitement** et **quel type de pack payant éviter/privilégier** selon le goulot détecté.
- Affiche un niveau de confiance pour éviter de recommander un achat à partir d'un scan incomplet.
- Compare les 4 escouades avec puissance, qualité des données et rôle (priorité principale / secondaire / à conserver / à scanner).
- Le Drone est intégré à l'ordre de priorité sans passer devant un écart héros plus important.
- Si les détails héros ne sont pas assez visibles, WarBoost recommande d'abord un nouveau scan plutôt qu'un achat.
- Le moteur Vision demande plus explicitement les détails visibles des 5 héros sur les captures d'escouade.
- Conserve V1.2.3 : chaque scan reste verrouillé sur Escouade 1, 2, 3 ou 4 et ne peut plus écraser une autre escouade.
- FR, EN-GB, EN-US, ES, DE, JA, ZH et AR conservés. PRO/Stripe, Supabase, galerie Android et Hybrid Sync conservés.
- Cache PWA incrémenté pour livrer le nouveau moteur PRO aux installations existantes.

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


## V1.4.4 — Presentation Ready safeguards
- Aucun placeholder `Hero 1`, `Hero 2`, etc. n'est persisté comme identité réelle.
- Les données lisibles (puissance, niveau, étoiles, équipement) sont conservées même si le nom du héros reste inconnu.
- Les captures d'escouade déclenchent un second passage strict d'identification des portraits, puis une vérification indépendante.
- Les noms proposés restent soumis à confirmation du joueur avant validation définitive.
- Un scan incomplet ne doit pas effacer un nom de héros déjà confirmé.
