# WarBoost V2.3.7 — Mobile Finish

V2.3.7 part de la V2.3.6 fonctionnellement validée. Aucun changement de règle de décision du Diagnostic PRO ou de classification d’activité Alliance n’est introduit.

## Finitions intégrées

- Roster R5/R4/R3/R2/R1 : hauteur maximale et défilement interne tactile, pour éviter qu’un grade de 70 membres allonge toute la page.
- Les accordéons restent fermés par défaut et conservent leur état tant que le drawer Alliance reste ouvert.
- Libellé de fraîcheur naturel : « Mis à jour il y a 5 j » au lieu de « Mettre à jour 5 j ».
- Le même libellé est utilisé pour les escouades et le roster Alliance.
- Plan de guerre IA : présentation en lignes séparées, texte plus court, décision inchangée.
- Diagnostic PRO mobile : le badge Impact/ROI/Sources passe sous le titre sur petit écran pour éviter les coupures inutiles.
- Cache PWA renouvelé afin d’éviter l’affichage d’anciens CSS/JS après mise à jour.
- Métadonnées applicatives alignées en V2.3.7.

## Non-régression attendue

- 31 héros et alias conservés.
- Paliers EX : 10 / 20 / 30 inchangés.
- Un seul portrait par carte Diagnostic PRO.
- Activité Alliance : une donnée ancienne reste « À actualiser » et n’est jamais transformée automatiquement en inactivité.
- Plan de guerre et écran Activité continuent d’utiliser la même classification.
- Aucune modification du schéma Supabase.
