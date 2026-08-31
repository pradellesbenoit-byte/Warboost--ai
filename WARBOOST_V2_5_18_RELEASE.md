# WarBoost V2.5.18 — Shop Decision Integrity

Base: V2.5.17 Context Source Relevance.

## Correction ciblée
- Boutique IA et Diagnostic PRO utilisent désormais la même hiérarchie EX : `exclusive_comparison` est la source de vérité pour les cibles de fragments universels.
- Les recommandations Boutique sont séparées en trois canaux principaux : monnaies du jeu, diamants/premium et argent réel.
- Une référence payante en EUR/USD/GBP ne peut jamais être présentée comme un prix actuel : elle affiche la date d’observation et « prix actuel non vérifié ».
- Une offre en argent réel n’est éligible à une recommandation forte que si trois preuves sont réunies : prix actuel vérifié, contenu actuel vérifié, rapport coût/gain vérifié, depuis un scan récent ou une source officielle autorisée.
- Les plans/matériaux d’équipement affichent leur cible actuelle si elle est connue ; sinon ils indiquent explicitement que le héros/équipement exact reste à confirmer.
- Les groupes payants restent visibles séparément sans fausser le classement des ressources accessibles avec les monnaies du jeu.

## Non-régression
- Classement EX 5 héros, DVA inconnue non inventée, explications de rang et sources méta par sujet conservés.
- Aucune quantité exacte de fragments ou de gain futur inventée.
- Escouade 1 principale, historique joueur, scans et données cloud protégés.
- VS dimanche/préparation, Saison inter-saison et R5/R4 prudent conservés.
- 23 langues explicites + Auto conservées.
- Bêta privée, consentement, paiement bêta désactivé et absence d’accès Last War non autorisé conservés.

## Données / déploiement
- Aucune migration Supabase V2.5.18.
- Aucun `DROP`, `TRUNCATE`, reset ou effacement de données.
- Cible de validation : branche `publisher-demo` / Preview uniquement avant toute Production.
