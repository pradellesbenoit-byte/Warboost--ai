# WarBoost V2.5.8 — R5/R4 Tactical Reliability

## Correctif principal
Le test réel d'une alliance avec 94 membres « à actualiser » a révélé que V2.5.7 pouvait encore utiliser ces membres anciens pour remplir Défense, Groupe mobile et Réserve.

V2.5.8 applique une règle stricte :
- seuls les membres **actifs confirmés** peuvent recevoir un rôle tactique ;
- `refresh` et `unknown` ne sont jamais transformés en affectation ;
- si aucun actif n'est confirmé, les actions tactiques restent vides et le Plan B demande l'actualisation du roster ;
- si quelques actifs sont confirmés, seuls eux peuvent apparaître dans les groupes.

## Mobile / lisibilité
- noms limités à 6 par groupe avec `+N` ;
- titres et listes séparés proprement ;
- plus de concaténation du type « DéfenseNom » ou « RéserveNom » ;
- exemple CSV neutralisé.

## Données / cloud
Aucune migration Supabase. Les protections V2.5.4 et V2.5.7 sont conservées.
