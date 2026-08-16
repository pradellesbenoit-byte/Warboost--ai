# WarBoost V20.3.6 — SMART SCAN FIX

Correctif du Smart Player Scan et du lien Formation → Boutique IA.

## Corrections V20.3.6
- Smart Scan limité à une capture de formation à la fois pour fiabiliser l’envoi ;
- compression locale conservée avant envoi ;
- nouvelle tentative automatique une fois sur erreur réseau/serveur ;
- délai serveur du scan porté à 72 secondes ;
- message d’échec corrigé : WarBoost ne reproche plus au joueur d’avoir envoyé plusieurs captures ;
- bouton « Refaire le scan » et aide capture après un second échec ;
- résultats précédents masqués pendant une nouvelle analyse ;
- Boutique IA verrouillée tant que le Smart Scan n’a pas réussi ;
- Boutique IA affichée uniquement après une formation validée ;
- conservation des priorités héros/équipements avant le Drone lorsque son retard n’est pas prouvé ;
- valeurs non lisibles laissées non renseignées / à confirmer, sans invention.

## Fonctionnalités conservées
- 5 héros maximum ;
- 20 équipements maximum ;
- Drone ;
- Suzerain ;
- score de confiance ;
- priorités intelligentes ;
- Formation → Shop ;
- conseils gratuits + payants selon la formation et le budget.

## Fichiers à remplacer
Racine GitHub :
- index.html
- sw.js

Dossier api :
- player-scan.js
