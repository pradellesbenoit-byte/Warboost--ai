# WarBoost V2.5.15

## Bêta privée — fiabilité des explications IA PRO

V2.5.15 conserve la base V2.5.14 et corrige la faiblesse observée dans Diagnostic PRO : plusieurs cartes d’armes exclusives pouvaient chacune affirmer être « le meilleur compromis », alors que l’interface les classait #1, #2 et #3.

### Correctifs V2.5.15

- Les explications « Pourquoi » sont maintenant **liées au classement réel** : seul le n°1 peut être présenté comme leader ; les n°2/n°3 expliquent clairement pourquoi ils restent derrière.
- En cas de score marginal arrondi identique, WarBoost indique explicitement le **départage** (sévérité, ROI, puis impact) au lieu d’inventer un écart.
- Diagnostic PRO construit une **comparaison EX de tous les héros configurés de l’escouade principale**, y compris un héros déjà à EX30 ou un EX manquant.
- Un héros à EX30 est affiché comme **palier 10/20/30 atteint** et n’est pas artificiellement poussé vers un niveau supérieur non modélisé.
- Un EX non lu reste **à vérifier** et n’est jamais inventé.
- Les quantités exactes de fragments restent non affichées tant qu’aucune source visible/officielle validée ne les fournit.
- Les sources méta sont visibles avec leur **type, date, date de connaissance et niveau de confiance**.
- La méta Air est actualisée avec des discussions communautaires datées jusqu’au 30/08/2026. Ces signaux ne sont qu’un ajustement secondaire : les données du compte, le coût relatif jusqu’au palier et le timing restent prioritaires.
- « Profil serveur : Auto / inconnu » devient **« Données insuffisantes (Auto) »** afin de ne pas simuler une analyse serveur inexistante.
- « Adversaire inconnu » devient **« Adversaire non encore disponible »**.
- Le texte d’invitation Alliance précise que les membres rejoignent **l’espace WarBoost de l’alliance**, et non une alliance dans Last War.

### Protections conservées

- Escouade 1 reste la principale lorsqu’elle est configurée par le joueur.
- Les scans/migrations ne doivent jamais effacer les valeurs existantes à cause d’un champ non lu.
- Bêta privée, consentement explicite, masquage des données hors session et paiements désactivés restent inchangés.
- WarBoost n’active aucune source Last War non autorisée et n’automatise pas le gameplay.
- Aucune migration Supabase V2.5.15 n’est nécessaire. Aucun `DROP`, `TRUNCATE`, reset ou suppression destructive n’est ajouté.

### Bêta privée

La liste d’invitation Preview reste configurée côté serveur via `WARBOOST_BETA_EMAILS`; si elle est active, seuls les comptes invités peuvent utiliser les fonctions bêta.

### Déploiement

Cible : Preview / branche de démonstration uniquement tant que les vérifications sont en cours. Ne pas modifier la Production sans validation explicite.
