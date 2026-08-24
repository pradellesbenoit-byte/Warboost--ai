# WarBoost V1.6.3 — AI Multi-source Meta + Shop

- Moteur de décision global conservant le ROI marginal de tous les héros.
- Ajout d’une couche de preuves datées multi-sources (officiel + discussions communautaires récentes + guide communautaire).
- En Saison 6, le moteur augmente le poids du passage de plusieurs héros à EW20 lorsque plusieurs héros principaux restent sous EW20, et pénalise un rush EW30 prématuré.
- Les recommandations équipement et Drone reçoivent un signal méta, sans écraser le ROI propre au compte.
- Le conseiller Boutique applique les mêmes signaux aux fragments EW, blueprints et ressources Drone.
- Les offres non observées restent marquées comme non vérifiées; aucun prix ou stock n’est inventé.
- L’interface reste compacte: 3 décisions principales, avec un indicateur du nombre de sources et de la confiance méta.
- Architecture prête à remplacer la base embarquée par un flux de connaissances approuvé (`WARBOOST_META_FEED_URL`) si un accès officiel/autorisé est disponible ultérieurement.

Important: V1.6.3 n’effectue pas de scraping non autorisé en temps réel. Les preuves embarquées sont datées et doivent être rafraîchies régulièrement côté WarBoost.
