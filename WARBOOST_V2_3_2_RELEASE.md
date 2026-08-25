# WarBoost V2.3.2 — Diagnostic PRO intelligent

Cette version améliore le cerveau du Diagnostic PRO sans charger davantage l'interface.

## Changements
- Compare réellement les 5 héros de l'escouade principale avant de produire le TOP 3.
- Compare les prochains paliers EX10 / EX20 / EX30 selon la valeur marginale, le coût restant, le rôle du héros et le timing.
- Donne plus de poids à un passage EX10 → EX20 utile qu'à un rush EX30 prématuré.
- Le Drone n'est plus placé automatiquement pour diversifier les catégories : il doit battre une amélioration héros en rendement.
- Plusieurs améliorations d'armes exclusives peuvent apparaître dans le TOP 3 si elles sont réellement meilleures.
- Ajoute dans « Pourquoi » une comparaison concise avec les autres héros.
- Affiche le nombre de niveaux restant jusqu'au prochain palier EX.
- Ne fabrique pas un coût en fragments si WarBoost ne possède pas encore une table officielle/validée.
- Conserve le timing VS / Saison et les signaux méta multi-sources.
- Interface principale inchangée et volontairement compacte.

## Moteur
`warboost-ai-smart-v2.3.2`

## Déploiement
Patch minimal : remplace seulement `app.js`, `package.json` et `api/advice.js`.
La V2.3.1 Serverless Fix reste intacte : aucune nouvelle fonction Vercel n'est ajoutée.
