# WarBoost V2.5.1 — Squad Swap Reliability

## Objectif
Permettre au joueur de permuter deux escouades depuis le panneau Joueur sans perdre, dupliquer ni transférer les caractéristiques des héros par position.

## Changements
- Bouton latéral `⇄` sur chaque escouade enregistrée.
- Choix explicite de l'escouade cible avant permutation.
- Échange atomique du payload complet des deux escouades : puissance, 5 héros, progression connue, EX, équipement, Éveil et états de fiabilité.
- Les IDs/noms de destination restent `Squad 1..4`; le contenu complet est déplacé.
- `updated_at` et `composition_changed_at` sont rafraîchis sur les deux destinations pour rendre l'échange fiable avec la synchronisation cloud.
- Les registres globaux par identité (`hero_profiles`, `exclusive_weapons`, `hero_progression`) ne sont pas permutés ni reconstruits par slot.
- Cibles limitées aux escouades qui possèdent déjà des données; Escouade 4 vide n'est pas proposée.
- Correction du texte Diagnostic PRO : « coût restant » devient « distance au prochain palier » lorsque le coût réel en fragments est inconnu.
- Nouvelles chaînes de permutation traduites pour tous les choix de langue de l'interface.

## Non-régression attendue
V2.5.0 hero-history recovery, anti-duplication, Scan, Boutique IA, Saison 6 Awakening/Reshape, Alliance et moteur adaptatif restent inchangés sauf les fichiers explicitement listés dans le patch.
