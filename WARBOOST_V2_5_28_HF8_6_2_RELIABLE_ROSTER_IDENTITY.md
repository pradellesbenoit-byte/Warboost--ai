# WarBoost V2.5.28 HF8.6.2 — Reliable Roster Identity

## Problème corrigé
Un joueur déjà connu pouvait être interprété comme nouveau lorsque l’OCR ramenait le tag d’alliance dans le pseudo ou lorsque sa puissance avait fortement évolué.

## Exemple réel protégé
- Membre connu : `xXx Kaufik ALL4 xXx` · R4 · QG35 · 276 M.
- Nouveau scan : `[ALL4]xXx Kaufik ALL4 xXx` · R4 · QG35 · 320,7 M.
- Résultat attendu et testé : **même joueur**, puissance mise à jour à 320,7 M, ancienne puissance conservée, aucun doublon.

## Sécurité d’identité
1. Nettoyage du tag d’alliance uniquement lorsqu’il est affiché entre crochets devant le pseudo.
2. Matching exact après normalisation pseudo + contexte serveur/alliance.
3. Puissance, QG et grade exclus de la clé d’identité.
4. Fuzzy/OCR proche = suggestion seulement, jamais fusion automatique.
5. Ambiguïté = import bloqué jusqu’à confirmation.
6. Ancien membre exact = réintégration, pas création.
7. Historique de puissance conservé.

## Compatibilité
Patch cumulatif à appliquer sur HF8.6.1. Aucune migration Supabase.
