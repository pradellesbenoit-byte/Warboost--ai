# WarBoost V2.4.2 — Direct Resource Priority

V2.4.2 est un micro-correctif de fiabilité Boutique IA basé sur la V2.4.1 validée en Preview.

## Correction
Un coffre générique ou dont le contenu n'est pas détaillé (ex. `Coffre de Campagne (UR)`) ne peut plus remonter devant une ressource de progression directe simplement parce qu'il est UR.

- catégories opaques protégées : `campaign_chest`, `chest` ;
- score plafonné à 70/100 tant que le contenu reste inconnu ;
- les ressources directes conservent leur score calculé par Diagnostic PRO + goulot + VS/Saison ;
- si le contenu d'un coffre est identifié plus tard, il doit être classé dans sa vraie catégorie (Drone, EX, EXP, etc.) et le plafond ne s'applique plus ;
- aucune disponibilité ni contenu de coffre n'est inventé.

## Multilingue
L'explication du garde-fou est fournie dans toutes les langues actuellement proposées par WarBoost, avec les variantes anglaises toujours supportées.

## Invariants conservés
- catalogue V2.4.0 : 164 entrées / 163 nommées / 15 familles ;
- Diagnostic PRO → Boutique V2.4.1 ;
- 31 héros / 31 portraits ;
- EX 10/20/30 ;
- multi-scan Boutique ;
- Alliance reliability ;
- Scan, méta, CSS, Publisher UI et Supabase inchangés.

Voir `WARBOOST_V2_4_2_RELEASE.md`, `BUILD_VERIFICATION_V2_4_2.txt` et `PATCH_MANIFEST_V2_4_2.txt`.
