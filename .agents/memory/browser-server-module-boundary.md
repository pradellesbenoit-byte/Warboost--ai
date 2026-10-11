---
name: Frontière des modules navigateur et serveur
description: Pourquoi les contrôles Node et les builds copiés ne suffisent pas à valider le démarrage du navigateur.
---

Un module partagé avec le navigateur ne doit pas charger statiquement une
dépendance Node/native. Le traitement serveur doit rester isolé ou chargé
paresseusement derrière une garde d'environnement.

**Why:** les tests Node, les vérifications de syntaxe et les builds web/mobile
réussissaient alors qu'un import natif empêchait l'évaluation de toute
l'application navigateur. L'écran de chargement HTML restait affiché avant
même le démarrage de l'authentification.

**How to apply:** vérifier la résolution des imports des sources web non
bundlées, puis observer le démarrage réel dans un navigateur. Un build réussi
ou une capture prise pendant l'animation initiale ne prouve pas que l'accueil
devient utilisable. Ne pas effacer sessions ou profils pour corriger une erreur
de chargement de modules.
