# WarBoost V2.5.2 — Primary Squad Reliability

## Objectif
Faire respecter la permutation comme choix réel de l’escouade principale : lorsque l’Escouade 1 contient des données, elle reste la cible par défaut du Coach IA, du Diagnostic PRO, de la Boutique IA et du contexte méta, même si une escouade secondaire est plus puissante.

## Changements
- Politique centrale `Squad 1 first` ajoutée dans `lib/squad-identity.js`.
- Coach IA : affiche désormais `Priorité : Escouade 1` après permutation.
- Si une autre escouade est plus puissante, elle est signalée séparément sans remplacer la priorité choisie.
- Diagnostic PRO : `focus_squad` reste 1 lorsque l’Escouade 1 est configurée.
- Boutique IA : les besoins héros/EX/équipement sont calculés depuis l’Escouade 1 choisie.
- Méta S6/EX : les héros principaux viennent de l’Escouade 1 choisie et non de l’escouade la plus puissante.
- Métadonnées de diagnostic : politique de sélection et escouade la plus puissante exposées séparément pour audit.
- Les textes de la nouvelle indication sont traduits dans les 23 choix de langue explicites + Auto.
- Les taglines obsolètes sont réalignées sur V2.5.2.

## Fallback sûr
Si l’Escouade 1 ne contient encore aucune donnée, WarBoost peut utiliser temporairement la meilleure escouade configurée disponible. Dès que l’Escouade 1 est renseignée, elle redevient automatiquement la priorité choisie.

## Non-régression attendue
La permutation complète V2.5.1, la mémoire par identité, les scans EX persistants, la récupération historique, Saison 6 Awakening/Reshape, Alliance, Boutique IA, les 31 héros et les protections anti-invention restent conservés.
