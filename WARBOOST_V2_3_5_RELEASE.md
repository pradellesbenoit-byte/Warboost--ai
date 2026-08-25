# WarBoost V2.3.5 — Diagnostic PRO Single-Portrait Reliability

## Correctif
- Corrige la répétition d’un même portrait plusieurs fois dans une carte du TOP 3 Diagnostic PRO.
- Le portrait Diagnostic PRO est désormais rendu directement dans `app.js` à partir du champ héros explicite du résultat IA.
- `publisher-ui.js` ne décore plus les cartes Diagnostic PRO et ne gère que le rail visuel des escouades.
- Une carte de priorité contient au maximum un portrait héros.
- Le titre, la cible EX et les détails ne sont plus déplacés ou enveloppés par un observateur DOM.

## Conservé depuis V2.3.4
- Registre central de 31 héros et alias.
- Correspondance Scan ↔ cloud ↔ IA ↔ arme exclusive ↔ portrait.
- Paliers EX 10/20/30 et absence de quantité de fragments inventée.
- Protection/migration des données joueur.
- Boutique IA prudente et intégration officielle Last War en attente.

## Vérifications
- `npm run check` : OK.
- 31 héros / 31 assets : OK.
- 217 contrôles de paliers EX : OK.
- Architecture DOM : aucune observation/réinjection sur `#proPriorityList`.
