# WarBoost V2.5.17 — Context Source Relevance

Base: V2.5.16 Source Integrity Reliability.

## Correction ciblée
- Filtrage des preuves méta selon les domaines réellement présents dans les priorités courantes.
- EX-only => sources `exclusive` uniquement.
- Drone => sources `drone` uniquement quand le Drone est concerné.
- Gear => sources `gear` uniquement quand l’équipement est concerné.
- Le nombre de sources est désormais le nombre de sources **pertinentes affichées**.
- Aucune source hors sujet n’est utilisée pour augmenter artificiellement la confiance ou le compteur.
- Communauté = contexte explicatif seulement ; données du compte = décision numérique.

## Données / sécurité
- Aucune migration Supabase.
- Aucune suppression de données.
- Aucune intégration Last War non autorisée.
- Preview `publisher-demo` avant Production.
