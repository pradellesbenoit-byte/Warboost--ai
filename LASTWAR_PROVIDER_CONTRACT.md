# WarBoost V1.2 — Contrat Hybrid Sync Last War

WarBoost ne demande pas de token Last War au joueur.

## Source publique optionnelle

Variable : `WARBOOST_PUBLIC_LASTWAR_URL`

WarBoost envoie en POST :

```json
{
  "player_id": "warboost-user-id",
  "identity": {"name":"Pseudo","server_id":"884","hq_level":31},
  "alliance": "ALL4"
}
```

Réponse recommandée :

```json
{
  "provider": "public-source",
  "state": {
    "player": {"name":"Pseudo","server_id":"884","hq_level":31,"power_m":184.6},
    "drone": {"level":157,"power_m":8.2,"updated_at":"2026-08-20T20:30:00Z"},
    "squads": [],
    "alliance": {"tag":"ALL4"},
    "vs": {"week":34,"day":4,"opponent":"RIVAL"},
    "season": {"number":7,"day":18,"profession":"Engineer","progress_pct":51}
  }
}
```

La source publique ne reçoit aucune clé Last War appartenant au joueur.

## WarBoost Scan

`POST /api/scan` est réservé à un utilisateur WarBoost authentifié.

Le navigateur envoie une image redimensionnée. L'analyse est effectuée par :

1. `WARBOOST_VISION_ENDPOINT`, ou
2. `OPENAI_API_KEY` côté serveur.

La sortie est un état partiel. Les champs absents ne remplacent pas les données existantes.

## Cloud alliance

Les membres sont liés à `wb1_alliance_members`. Lors d'une synchronisation, WarBoost recharge leur dernier profil depuis `wb1_profiles` et reconstruit le roster R5/R4.

## Règle de fusion

- Les escouades et le Drone utilisent `updated_at` pour éviter qu'une donnée plus ancienne écrase une donnée récente.
- Les scans n'inventent pas les champs non visibles.
- Les données locales sont conservées si une source publique est indisponible.

## Push de confiance

`POST /api/ingest` reste disponible avec `WARBOOST_INGEST_SECRET` pour une source serveur de confiance.
