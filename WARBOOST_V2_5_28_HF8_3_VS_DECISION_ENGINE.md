# WarBoost V2.5.28 HF8.3 — VS Decision Engine

Date: 2026-09-11
Base: WarBoost V2.5.28 HF8.2 — VS Live Coach
Target: `public-beta-safe-launch` Preview only

## Objectif
HF8.3 transforme VS Live Coach d'un écran qui explique surtout le score/classement en un moteur de décision qui répond d'abord à : **que faire maintenant sans gaspiller les ressources ?**

## Nouveau moteur VS
- Décision principale : SCANNER / ÉCONOMISER / SURVEILLER / PROTÉGER L'AVANCE / POUSSER / POUSSER FORT.
- Urgence : inconnue / faible / moyenne / élevée / critique.
- Affiche ce qui peut être utilisé aujourd'hui et ce qui doit être conservé.
- Propose un délai de prochain scan adapté à la situation.
- À partir de deux scans du même jour VS, calcule les gains des deux alliances, leur rythme horaire et une projection conditionnelle de rattrapage.
- Une projection n'est jamais présentée comme un résultat garanti : elle suppose que le rythme observé reste inchangé.
- Le classement brut devient secondaire et replié dans **Détails du scan**. Il n'est jamais une raison autonome de dépenser.
- Une ligne absente du classement visible n'est jamais considérée inactive.

## Cas réel de non-régression
Fixture issue du scan joueur :
- ALL FOR 1 [ALL4] #884 : 1 440 270 940
- Fire and Brimstone [Mep] #872 : 667 494 056
- écart : +772 776 884
- situation : forte avance
- décision attendue : ÉCONOMISER
- urgence : faible
- second scan demandé pour mesurer le rythme adverse
- le rang #3 du joueur reste du contexte, pas un objectif de dépense.

## Sécurité / bêta
- Paiements toujours désactivés pendant la bêta.
- Aucun accès API Last War non autorisé, aucun scraping, aucune automatisation de gameplay.
- Scan fourni volontairement par le joueur + cloud WarBoost uniquement.
- 12 fonctions Vercel serverless conservées.
- Aucune migration Supabase HF8.3.
- Aucune suppression de données, aucun `localStorage.clear()`.
- Les protections HF7 Alliance, HF8 Commercial Readiness et HF8.1 PRO visible restent présentes.

## UX Safe Launch
Le libellé ambigu `Désactivé · Safe Launch` est remplacé par une formulation explicite : **Accès Last War désactivé · Safe Launch actif**.
