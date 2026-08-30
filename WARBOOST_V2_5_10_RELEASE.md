# WarBoost V2.5.10 — Season Lifecycle Reliability

## Corrigé

- Progression Saison absente : reste inconnue, jamais transformée en `0 %`.
- États distincts : active / terminée / entre-saisons / inconnue.
- Saison terminée : jour, progression, résistance et S6 ne sont plus traités comme actifs.
- Profession : conservée comme dernière profession connue en historique.
- Éveil / Reshape S6 : désactivé dans l'arbitrage IA lorsque S6 n'est pas active.
- Meta S6 : désactivée hors saison active.
- Timing Saison dans Joueur / Boutique : ignoré lorsque la saison n'est pas active.
- Contexte IA : une ancienne profession Saison ne force plus un objectif Saison/PvP quand le cycle est terminé.
- UI Saison : barre masquée si progression non applicable ou inconnue ; état explicite affiché.
- Contrôle manuel : Auto / Active / Terminée / Entre-saisons.
- Scan Saison : `lifecycle` accepté seulement si l'état est visiblement confirmé.

## Comportement entre-saisons

Exemple attendu :

- `Saison 6 · Terminée`
- `Jour —`
- `Chef de guerre` reste la dernière profession connue
- Progression : `Entre-saisons`, pas `0 %`
- Conseil : actualiser lors de l'ouverture de la prochaine saison
- Aucun conseil Éveil S6 actif

## Formation

Le bonus général de formation Last War reste séparé du lifecycle Saison. Les valeurs 3 mêmes types = +5 %, 4 = +15 %, 5 = +20 % PV/ATQ/DEF sont confirmées par le centre d'aide FirstFun et plusieurs guides communautaires ; V2.5.10 ne les supprime donc pas du moteur de composition, mais ne les présente plus comme un conseil S6 lorsque S6 est terminée.

## Données

Aucune migration de schéma Supabase requise. Les champs `season.lifecycle`, `season.lifecycle_source` et `season.ended_at` sont stockés dans le JSON joueur existant. Les anciennes données sont conservées ; la V2.5.10 corrige seulement leur interprétation.
