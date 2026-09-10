# WarBoost V2.5.28 HF8.2 — VS Live Coach

## Objectif
Rendre le VS suffisamment utile pour justifier une vraie valeur PRO : WarBoost ne se contente plus d'afficher le Jour VS. Il analyse la situation réellement visible sur un scan et aide le joueur à décider **s'il doit pousser, surveiller ou économiser ses ressources**.

## Nouveautés
- Carte d'accueil renommée **VS Live Coach**.
- Bouton **Scanner le VS maintenant** dans le tiroir VS.
- Extraction VS étendue : thème, compte à rebours, serveurs, tags, alliances, scores exacts visibles, pourcentages, rang/score du joueur et classement visible.
- Situation live : forte avance, avance, faible avance, duel très serré, faible retard, retard ou fort retard.
- Écart de score et part du score calculés à partir des nombres scannés.
- Contexte personnel : rang actuel, score personnel et écart vers le rang immédiatement supérieur quand cette ligne est visible.
- Tendance multi-scan : comparaison de deux captures du même Jour VS, avec gains de chaque alliance sur l'intervalle.
- Décision IA contextuelle liée au Jour VS et au Diagnostic PRO.
- Un `0–0` non confirmé devient **Score non synchronisé**, jamais un faux score réel.

## Garde-fous
- Aucune donnée non visible n'est inventée.
- Une capture partielle ne permet pas de conclure qu'un joueur est inactif.
- Aucun résultat final, récompense future ou score futur n'est prédit comme certain.
- Le Jour/Semaine ne sont pas déduits d'un simple thème si ces champs ne sont pas réellement visibles ou déjà connus de façon fiable.
- Les captures servent à l'analyse ; les protections de confidentialité/persistance existantes restent inchangées.

## Exemple de validation
Capture du 10/09/2026 :
- #884 [ALL4] ALL FOR 1 : 1 440 270 940
- #872 [Mep] Fire and Brimstone : 667 494 056
- Répartition visible : 68 % / 32 %
- `les gladiateurs81` : #3, 43 195 000
- #2 visible : `Cyril°68°`, 53 395 524

Résultat attendu : `strong_lead`, écart alliance 772 776 884, écart personnel vers #2 = 10 200 524, conseil de ne pas dépenser uniquement pour gonfler le score lorsque l'alliance possède déjà une avance très confortable.

## Compatibilité
HF8.1 PRO Visible UX, HF8 Commercial Readiness, HF7 Alliance Invite Gate, Diagnostic PRO, Boutique IA, Scan, Saison, Support, Auth, 23 langues + Auto et 12 fonctions serverless restent conservés. Aucun changement Supabase n'est requis pour HF8.2.
