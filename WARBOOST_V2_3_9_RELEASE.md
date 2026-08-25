# WarBoost V2.3.9 — VS Timing Reliability

Base : V2.3.8 validée sur `publisher-demo`.

## Pourquoi cette version
Le détail « Pourquoi » pouvait afficher au jour VS 5 ou 6 : « conserve cette ressource pour le jour 4 », alors que le jour 4 du cycle courant était déjà passé. Le même risque existait pour le Drone après le jour 1.

## Correction
- Timing VS désormais **conscient du cycle**.
- Jours avant la fenêtre optimale : attente dans le cycle courant.
- Jour optimal : `spend_now`.
- Jours après la fenêtre optimale : recommandation explicite vers le prochain cycle (`next_cycle:true`), avec garde-fou ROI Saison/goulot.
- Texte paid exclusive plus prudent et orienté coût/gain.
- Pas de changement du moteur de classement validé.
