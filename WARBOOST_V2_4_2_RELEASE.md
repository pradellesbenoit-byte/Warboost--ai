# WarBoost V2.4.2 — Direct Resource Priority

## Pourquoi ce correctif
En V2.4.1, le Diagnostic PRO et la Boutique IA étaient bien alignés sur les familles de ressources prioritaires. Un cas restait toutefois trop optimiste : un coffre générique de rareté élevée, comme `Coffre de Campagne (UR)`, pouvait encore obtenir un score élevé alors que son contenu exact n'était pas connu.

La rareté affichée ne suffit pas à prouver qu'un coffre résout le goulot du joueur.

## Nouvelle règle
WarBoost distingue maintenant :

- **ressource directe et connue** : fragments d'Arme Exclusive, Pièce/Composant de Drone, Plan d'Équipement, EXP identifiée, etc. ;
- **coffre générique / contenu opaque** : catégories `campaign_chest` et `chest` tant que leur contenu n'est pas détaillé.

Un coffre opaque est plafonné à **70/100**. Il ne peut donc plus dépasser une ressource directe simplement parce qu'il est UR.

Si le contenu est ensuite identifié, WarBoost doit reconnaître sa vraie catégorie (Drone, EX, EXP, équipement...) et le plafond disparaît automatiquement.

## Cas de régression validé
Sur un scan Campagne de test avec les besoins du profil de référence :

- `Pièce de Drone` : **81/100** ;
- `Coffre de Campagne (UR)` : **70/100** ;
- `Coffre d'EXP de Héros` : reconnu comme EXP, donc **non opaque**.

Le coffre générique reçoit aussi une explication : son contenu n'étant pas détaillé, WarBoost place une ressource directe et vérifiable devant lui.

## Multilingue
Le message du garde-fou est traduit dans les **22 langues WarBoost**. Les variantes EN-GB et EN-US partagent la traduction anglaise, soit 23 options de locale testées.

## Ce qui ne change pas
- catalogue Boutique V2.4.0 : 164 entrées / 163 nommées / 15 familles ;
- 27 prix volontairement inconnus ou masqués ;
- alignement Diagnostic PRO → Boutique V2.4.1 ;
- 31 héros / 31 portraits ;
- paliers EX10 / EX20 / EX30 ;
- accumulation multi-boutiques ;
- `lib/shop-catalog.js` ;
- `lib/data-freshness.js` ;
- `api/scan.js` ;
- méta, activité Alliance, CSS, Publisher UI et Supabase.
