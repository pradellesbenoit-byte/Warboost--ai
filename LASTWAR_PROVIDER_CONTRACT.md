# WarBoost V1.4 — Contrat d'intégration Last War « approval-first »

WarBoost V1.4 est préparé pour une future intégration officielle **en lecture seule**, mais n'active aucun accès Last War non autorisé.

## Principe

1. Le joueur se connecte à WarBoost.
2. Il déclenche volontairement une synchronisation.
3. WarBoost transmet uniquement une demande de lecture à une source officiellement autorisée.
4. Les données reçues sont normalisées puis fusionnées avec le profil WarBoost.
5. WarBoost analyse et conseille ; il n'exécute aucune action dans le jeu.

## Source officielle prioritaire

Variable serveur : `WARBOOST_LASTWAR_OFFICIAL_URL`

Jeton serveur optionnel : `WARBOOST_LASTWAR_OFFICIAL_TOKEN`

Ces variables ne doivent être configurées **qu'après accord de Last War / FirstFun** ou selon leurs instructions techniques.

WarBoost envoie notamment :

```json
{
  "player_id": "warboost-user-id",
  "identity": {"name":"Pseudo","server_id":"884","hq_level":31},
  "alliance": "ALL4",
  "consent": {
    "granted": true,
    "scope": "read_only_account_analysis",
    "source": "warboost_authenticated_user"
  },
  "requested_fields": [
    "player", "squads", "heroes", "exclusive_weapons", "gear",
    "drone", "technology", "profession", "season", "vs", "alliance"
  ]
}
```

Réponse recommandée :

```json
{
  "provider": "lastwar-official",
  "capabilities": ["player", "squads", "drone", "season"],
  "state": {
    "player": {"name":"Pseudo","server_id":"884","hq_level":31,"power_m":184.6},
    "drone": {"level":157,"power_m":8.2,"updated_at":"2026-08-23T09:00:00Z"},
    "squads": [],
    "alliance": {"tag":"ALL4"},
    "vs": {"week":34,"day":4,"opponent":"RIVAL"},
    "season": {"number":7,"day":18,"profession":"Engineer","progress_pct":51}
  }
}
```

## Connecteur partenaire approuvé

Variable : `WARBOOST_LASTWAR_PROVIDER_URL`

Secret serveur optionnel : `WARBOOST_PROVIDER_SECRET`

Ce chemin est réservé à un connecteur explicitement approuvé ou fourni dans le cadre d'un partenariat.

## Ancienne source publique

`WARBOOST_PUBLIC_LASTWAR_URL` est conservée uniquement pour compatibilité technique et reste **désactivée par défaut**.

Elle ne peut être utilisée que si `WARBOOST_ALLOW_LEGACY_PROVIDER=true` est explicitement défini et si WarBoost dispose d'un cadre d'utilisation autorisé.

## WarBoost Scan

`POST /api/scan` reste la source principale tant que l'accès officiel n'est pas disponible.

- utilisateur WarBoost authentifié ;
- image redimensionnée avant analyse ;
- extraction des seuls champs visibles ;
- les champs absents ne remplacent pas les données existantes ;
- confirmation manuelle des identités de héros lorsque la reconnaissance est ambiguë.

## Fusion et provenance

La V1.4 conserve dans `sync` :

- `provider` ;
- `provider_kind` ;
- `access_status` ;
- `capabilities` ;
- `official_last_sync` ;
- les sources `official`, `public`, `scan`, `alliance`.

Les escouades, le Drone et la boutique utilisent les dates `updated_at` afin qu'une information plus ancienne n'écrase pas une donnée plus récente.

## Limites intentionnelles

WarBoost V1.4 :

- ne demande pas les identifiants Last War du joueur ;
- ne stocke pas de mot de passe Last War ;
- n'automatise pas le gameplay ;
- ne modifie pas le client du jeu ;
- n'active pas une source non autorisée par défaut.
