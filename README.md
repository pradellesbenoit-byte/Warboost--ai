# WarBoost V2.4.0 — Decision Integrity + Boutique IA

Cette version part de la V2.3.9 validée sur `publisher-demo` et regroupe deux améliorations qui vont ensemble tant que l'accès officiel Last War est en attente :

1. **Decision Integrity** : WarBoost tient compte de l'âge des données avant de conseiller une dépense.
2. **Boutique IA multi-shop** : WarBoost connaît désormais un référentiel daté construit à partir des captures Last War fournies et conserve plusieurs scans récents de boutiques pour les comparer ensemble.

## Règle de sécurité
Le référentiel n'est **pas** traité comme un catalogue live officiel. Il sert à reconnaître les articles, les familles de boutiques et les prix/limites observés. La disponibilité actuelle doit venir d'un scan récent ou, plus tard, d'un accès officiel autorisé.

## Couverture du référentiel
- 164 entrées de référence
- 163 articles/offres nommés
- 15 familles de boutiques / écrans
- Prix, limites et rotations enregistrés uniquement lorsqu'ils étaient visibles
- 27 entrées sans prix courant exploitable parce que l'article était affiché VENDU, le prix était hors capture ou masqué

Voir :
- `WARBOOST_V2_4_0_RELEASE.md`
- `SHOP_CATALOG_AUDIT_V2_4_0.md`
- `BUILD_VERIFICATION_V2_4_0.txt`
