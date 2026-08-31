# WarBoost V2.5.19

## Bêta privée joueurs — Private Beta Player Safety

V2.5.19 est la version destinée aux **joueurs invités à la bêta privée**. La Publisher Demo destinée à Last War/FirstFun reste figée séparément en V2.5.18.

### Correctif V2.5.19 — anciennes offres payantes isolées

- Les offres payantes issues uniquement du référentiel historique sont placées dans **« Offres payantes historiques à vérifier »**.
- Elles n’ont plus de rang numérique et n’affichent plus de score comme recommandation d’achat actuelle.
- Elles servent uniquement à reconnaître une offre si elle réapparaît ; un **nouveau scan** ou une **source officielle autorisée** doit confirmer sa présence actuelle.
- Les offres payantes actuellement scannées restent dans **« Achats en argent réel »**, mais une recommandation forte reste impossible sans prix actuel, contenu actuel et rapport coût/gain tous vérifiés.
- Diagnostic PRO et Boutique IA conservent la même source de vérité pour les priorités EX.
- Les prix historiques restent datés comme « prix observé » et jamais présentés comme prix actuels.

### Non-régressions conservées

- Données joueur et escouades préservées ; aucune mise à jour ne force un rescan.
- Diagnostic PRO : 5 héros comparés, explications liées au rang, DVA inconnue non inventée.
- Sources méta filtrées par sujet et secondaires aux données du compte.
- VS dimanche = préparation du Jour 1 ; adversaire inconnu non inventé.
- Saison terminée/inter-saison = historique, aucun conseil S6 actif hors saison.
- Alliance R5/R4 : aucun rôle tactique inventé avec des données anciennes.
- Bêta privée : invitation, consentement explicite, PRO inclus sans paiement et aucune intégration Last War non autorisée.

### Déploiement

Cible recommandée : **branche Preview dédiée aux joueurs bêta** (par exemple `private-beta`). Ne pas remplacer `publisher-demo` V2.5.18 et ne pas toucher à `main`/Production. Aucune migration Supabase V2.5.19. Ne jamais effacer localStorage, scans, cloud ou historique joueur.

---

# Historique V2.5.17

## Bêta privée — pertinence des sources et classement compte-first

V2.5.17 conserve l’intégrité des sources de V2.5.16 et ajoute un filtrage par sujet : seules les références réellement pertinentes pour les priorités courantes sont affichées et comptées.


### Correctif V2.5.17 — pertinence par sujet

- Le panneau « Sources méta et date » ne mélange plus les domaines : un diagnostic EX affiche uniquement des sources `exclusive`, un diagnostic Drone uniquement des sources `drone`, et l’équipement uniquement des sources `gear`.
- Le compteur `Sources IA` correspond uniquement aux sources pertinentes réellement affichées.
- Une source valide mais hors sujet ne peut plus gonfler le compteur ni la confiance du diagnostic courant.
- Si aucune source n’est pertinente pour les priorités courantes, WarBoost retourne zéro source plutôt que de remplir la liste avec des références sans rapport.
- Les données du compte restent prioritaires et les sources communautaires restent explicatives, sans bonus/malus numérique opaque.

### Correctifs V2.5.16

- Les cartes de sources utilisent désormais un **titre réel, un éditeur, une date et une URL vérifiable**.
- Une source n’est étiquetée **Officiel** que si elle pointe vers un support officiel Last War vérifié.
- L’ancienne carte « Official Drone development guidance » est remplacée par l’article réel du support Last War sur les coffres de composants Drone de niveau 6/7 ; sa portée est limitée à ce qu’il affirme réellement.
- Les discussions Reddit utilisées comme signaux communautaires restent clairement marquées **Communauté** et sont cliquables depuis WarBoost.
- Les signaux communautaires **n’ajoutent et ne retirent plus directement de points** au score Diagnostic PRO. Ils expliquent le contexte, mais les données du compte, le palier EX, le coût relatif, le rôle, le timing VS/Saison et les mesures enregistrées décident du classement numérique.
- Les coefficients opaques `+4`, `+3`, `-5` qui pouvaient faire basculer artificiellement Lucius/Morrison/Skyler/Carlie sont supprimés du score.
- Les sources réellement utilisées par les priorités affichées remontent en tête de la liste.
- DVA reste explicitement **EX à vérifier** tant qu’aucune valeur fiable n’est enregistrée ; WarBoost ne lui invente ni niveau ni score.
- La confiance « Méta » décrit désormais surtout la **traçabilité des preuves**, pas une certitude universelle sur les opinions communautaires.
- Les protections de V2.5.15 restent présentes : explications « Pourquoi » liées au vrai rang, comparaison des 5 héros, aucune quantité exacte inventée, serveur inconnu non simulé, VS non spéculatif et invitation Alliance non ambiguë.

### Protections conservées

- Escouade 1 reste la principale lorsqu’elle est configurée par le joueur.
- Les scans/migrations ne doivent jamais effacer les valeurs existantes à cause d’un champ non lu.
- Bêta privée, consentement explicite, masquage des données hors session et paiements désactivés restent inchangés.
- WarBoost n’active aucune source Last War non autorisée et n’automatise pas le gameplay.
- Aucune migration Supabase V2.5.17 n’est nécessaire. Aucun `DROP`, `TRUNCATE`, reset ou suppression destructive n’est ajouté.

### Bêta privée

La liste d’invitation Preview reste configurée côté serveur via `WARBOOST_BETA_EMAILS`; si elle est active, seuls les comptes invités peuvent utiliser les fonctions bêta.

### Déploiement

Cible : Preview / branche de démonstration uniquement tant que les vérifications sont en cours. Ne pas modifier la Production sans validation explicite.
