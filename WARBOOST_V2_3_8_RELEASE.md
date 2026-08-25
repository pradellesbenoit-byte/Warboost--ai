# WarBoost V2.3.8 — Diagnostic Badge Reliability

V2.3.8 part de la V2.3.7 fonctionnellement validée sur `publisher-demo`. Ce correctif est volontairement minimal : il uniformise la présentation des cartes du Diagnostic PRO sans modifier le classement IA, les paliers EX, les héros, le Scan ou la logique Alliance.

## Correctif

- Les cartes TOP 3 affichent désormais toutes exactement le même badge : `Impact · ROI`.
- Le compteur `Sources IA` n'apparaît plus sur une seule carte lorsqu'elle possède un `evidence_id` spécifique.
- Le nombre global de Sources IA reste affiché dans le résumé du Diagnostic, où il représente correctement l'analyse complète.
- Les `evidence_ids` restent conservés dans la réponse IA pour la traçabilité ; aucune donnée de preuve n'est supprimée.
- Aucun nombre de sources n'est inventé pour une carte qui n'a pas d'évidence spécifique.
- Métadonnées applicatives et cache PWA alignés en V2.3.8.

## Non-régression

- Diagnostic PRO : règles de décision inchangées.
- Paliers EX 10 / 20 / 30 inchangés.
- 31 héros, alias et portraits inchangés.
- Alliance Reliability et roster mobile V2.3.7 inchangés.
- Scan et schéma Supabase inchangés.
