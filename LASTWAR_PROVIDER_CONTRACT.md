# WarBoost V1 — Contrat de synchronisation Last War

WarBoost V1 ne dépend pas de LastWar Tools. Le noyau attend une source capable de renvoyer des données normalisées.

## Mode pull automatique

Variable serveur : `WARBOOST_LASTWAR_PROVIDER_URL`

WarBoost envoie :

```json
{
  "player_id": "warboost-user-id",
  "identity": {"name":"Pseudo","server_id":"884","hq_level":31},
  "alliance": "ALL4"
}
```

La source répond :

```json
{
  "provider": "nom-de-la-source",
  "state": {
    "player": {"name":"Pseudo","server_id":"884","hq_level":31,"power_m":184.6},
    "squads": [
      {
        "id": 1,
        "name": "Escouade 1",
        "power": 65.2,
        "updated_at": "2026-08-20T09:30:00Z",
        "heroes": [
          {"name":"DVA","level":150,"stars":5,"power":13.2,"exclusive":"20","gear":"Légendaire"}
        ]
      }
    ],
    "alliance": {"tag":"ALL4","role":"R4","members":[]},
    "vs": {"week":34,"day":4,"our_alliance":"ALL4","opponent":"RIVAL"},
    "season": {"number":7,"day":18,"profession":"Ingénieur","progress_pct":51}
  }
}
```

## Mode push automatique

Une source de confiance peut pousser les données vers `POST /api/ingest` avec :

`Authorization: Bearer <WARBOOST_INGEST_SECRET>`

Le secret est un secret interne WarBoost, jamais un token Last War demandé au joueur.

## Mise à jour planifiée

`GET/POST /api/cron-sync` peut être appelé par un planificateur serveur avec :

`Authorization: Bearer <CRON_SECRET>`

Le serveur parcourt les profils connus et met à jour ceux dont le pseudo et le serveur sont connus.

## Règle importante

Le serveur conserve les dernières données fiables. Une escouade n'est remplacée que si la source fournit une `updated_at` plus récente. Chaque mise à jour est aussi enregistrée dans `wb1_snapshots` pour suivre la progression.
