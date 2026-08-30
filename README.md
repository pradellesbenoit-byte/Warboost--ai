# WarBoost V2.5.16

## Bêta privée — intégrité des sources et classement compte-first

V2.5.16 conserve les corrections de V2.5.15 et corrige le problème détecté dans « Sources méta et date » : certaines cartes utilisaient des intitulés synthétiques, des dates non fiables et des coefficients communautaires opaques capables de modifier trop fortement le classement EX.

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
- Aucune migration Supabase V2.5.16 n’est nécessaire. Aucun `DROP`, `TRUNCATE`, reset ou suppression destructive n’est ajouté.

### Bêta privée

La liste d’invitation Preview reste configurée côté serveur via `WARBOOST_BETA_EMAILS`; si elle est active, seuls les comptes invités peuvent utiliser les fonctions bêta.

### Déploiement

Cible : Preview / branche de démonstration uniquement tant que les vérifications sont en cours. Ne pas modifier la Production sans validation explicite.
