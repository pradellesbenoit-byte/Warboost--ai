# WarBoost V2.4.9 — Adaptive Ranking Reliability

## Objet

Correctif de fiabilité après validation visuelle de V2.4.8 Preview.

## Corrigé

- le moteur adaptatif ne remplace plus le pool de candidats du Diagnostic PRO ;
- le Diagnostic lit désormais `hero_profiles` par identité de héros ;
- les données du même héros peuvent suivre le héros entre les escouades sans héritage par slot ;
- une EX inconnue reste inconnue et peut déclencher une action de vérification ;
- le Drone ne doit plus devenir la seule priorité apparente simplement parce que les EX de l'escouade courante ne sont pas présentes dans le slot ;
- les cartes non-héros disposent d'une grille mobile correcte ;
- le compteur du résumé devient `Options comparées : {count}` et est traduit dans les 23 choix de langue explicites.

## Conservé

- moteur contextuel V2.4.8 : objectif, contexte serveur/compte connu, VS/Saison, rendement marginal, certitude, condition et date ;
- mémoire héros V2.4.7 et protection anti-doublon ;
- Kimberly EX19 comme donnée confirmée lorsqu'elle existe dans les sources fiables ;
- 31 héros / 31 portraits ;
- Saison 6 Awakening / Reshape ;
- Boutique IA et ses garde-fous ;
- Alliance ;
- Supabase et API de scan sans changement de schéma.

## Règle de fiabilité

WarBoost préfère une demande de vérification à une recommandation inventée. Le TOP 3 n'est rempli que par des actions réellement construites à partir de données fiables.
