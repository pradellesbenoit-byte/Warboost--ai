# WarBoost V2.4.5 — Squad Identity Reliability

## Priorité corrigée : fusion des scans d’escouade
V2.4.4 pouvait confirmer de nouveaux noms de héros après un scan tout en conservant, lorsque certaines valeurs n’étaient pas relues, les attributs du héros qui occupait auparavant le même slot. Cela pouvait également laisser le héros dans son ancienne escouade et créer un doublon.

V2.4.5 remplace cette logique par une fusion liée à l’identité du héros :
- aucune donnée de niveau, étoiles, puissance, arme exclusive, équipement ou Awakening n’est transmise d’un ancien occupant de slot à un nouveau héros ;
- les valeurs visibles du scan ne sont appliquées qu’après confirmation de l’identité du héros du slot ;
- un héros déplacé est retiré de son ancienne escouade ;
- l’ancienne escouade est marquée comme devant être resynchronisée si sa composition devient incomplète ;
- un contrôle anti-doublon est exécuté sur les quatre escouades ;
- une migration idempotente répare les doublons V2.4.4 existants en conservant l’emplacement le plus récent et en restaurant, quand disponible, le dossier d’identité du héros depuis son ancien doublon et ses données EX/Awakening globales.

## Diagnostic PRO
- Une escouade marquée à resynchroniser n’est pas choisie comme escouade principale si une escouade fiable existe.
- Les besoins Boutique IA suivent la même règle.
- La fraîcheur d’une priorité d’arme exclusive utilise maintenant la date la plus récente entre l’arme exclusive du héros, sa progression héros et l’escouade.
- Un scan EX effectué à l’instant n’affiche plus artificiellement l’âge de l’ancien scan d’escouade.

## Boutique IA
- Le double titre « Boutique Last War · Conseiller IA » est supprimé.
- Si le scan reconnaît exactement un article et sa boutique mais ne lit pas le montant, WarBoost peut montrer le montant connu du référentiel uniquement sous forme `réf.` / `ref.`. Il ne le présente jamais comme prix live confirmé.
- Le Fragment d’Arme Exclusive Universel de la Boutique Honneur conserve la référence 2 500 médailles d’Honneur lorsque la correspondance est forte.

## Saison 6
Les règles Awakening / Reshape de V2.4.4 sont conservées : seuil EX20 avant Awakening lorsqu’il s’applique, arbitrage ROI, bonus de formation mono-type, garde hybride, Awakening Swap et absence de projection de puissance inventée.

## Langues
La version reste compatible avec les 22 langues cibles. Les nouveaux libellés de fraîcheur « mis à jour à l’instant » disposent d’une traduction pour chaque langue prise en charge.
