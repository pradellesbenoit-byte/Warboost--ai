# WarBoost V2.5.18

## Bêta privée — Shop Decision Integrity

V2.5.18 conserve le Diagnostic PRO et la pertinence des sources validés en V2.5.17, puis fiabilise la Boutique IA pour qu’elle ne contredise jamais le classement PRO et qu’elle traite séparément les monnaies du jeu, les diamants et les achats en argent réel.

### Correctif V2.5.18 — Boutique IA alignée sur le Diagnostic PRO

- **Une seule source de vérité EX** : la Boutique IA réutilise exactement le classement `exclusive_comparison` du Diagnostic PRO. Si Carlie est n°1 dans le Diagnostic PRO, les fragments universels ciblent Carlie en premier.
- **Canaux de paiement séparés** : monnaies du jeu, diamants/premium et argent réel sont affichés dans des groupes distincts ; un pack en euros n’est plus présenté comme s’il était en concurrence directe avec une ressource Honneur/Alliance.
- **Garde-fou achats réels** : aucune offre en argent réel ne peut recevoir une recommandation forte tant que le prix actuel, le contenu actuel et le rapport coût/gain ne sont pas tous explicitement vérifiés depuis une source actuelle autorisée (scan récent ou source officielle).
- **Prix de référence daté** : un ancien prix en EUR/USD/GBP est affiché comme prix observé avec sa date et comme non vérifié aujourd’hui, jamais comme prix courant.
- **Cible équipement explicite** : les plans/matériaux d’équipement indiquent le héros/équipement visé quand l’information existe ; sinon WarBoost écrit clairement que la cible exacte reste à confirmer.
- **Référentiel payant conservateur** : les références payantes peuvent être montrées dans leur propre groupe, mais restent « à vérifier » tant qu’elles ne sont pas confirmées par une donnée actuelle.
- **Aucune quantité inventée** : fragments, coût exact futur et gain chiffré restent inconnus tant qu’une source visible/officielle validée ne les fournit pas.

### Non-régressions conservées

- Diagnostic PRO : comparaison EX des 5 héros, explications liées au vrai rang, DVA inconnue laissée inconnue, méta communautaire secondaire et sans bonus/malus opaque.
- Sources : filtrage par sujet ; une source Drone ne remonte pas dans une analyse EX.
- Joueur : Escouade 1 reste la principale lorsqu’elle est configurée, données historiques protégées, aucune mise à jour ne doit forcer un rescan.
- VS : dimanche = préparation du Jour 1, adversaire inconnu non inventé.
- Saison : inter-saison/terminée traitée comme historique, aucun conseil S6 actif hors saison.
- Alliance R5/R4 : données anciennes non transformées en rôles tactiques inventés.
- Bêta privée : consentement, isolation des comptes, paiements désactivés et aucune intégration Last War non autorisée.

### Déploiement

V2.5.18 est prévue pour `publisher-demo` / Preview uniquement jusqu’à validation. Aucune migration Supabase n’est requise. Ne pas effacer localStorage, scans, données cloud ou historique joueur.

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
