# WarBoost V2.4.1 — Diagnostic → Boutique Alignment

## Pourquoi ce correctif
En V2.4.0, le Diagnostic PRO pouvait recommander trois armes exclusives alors que le classement de référence Boutique plaçait un Plan d'Équipement (MR) devant les fragments d'Arme Exclusive. Les deux moteurs utilisaient de bons signaux mais n'étaient pas assez liés entre eux.

## Nouveau comportement
La Boutique IA reçoit maintenant le TOP 3 du Diagnostic PRO et en déduit les familles de ressources prioritaires :
- `exclusive_weapon_shards`
- `gear_materials`
- `hero_shards`
- `drone_components`
- `hero_xp`

Si une famille apparaît au moins deux fois dans le TOP 3, elle devient la famille dominante et obtient un bonus d'alignement. Les autres familles de progression rares reçoivent une petite pénalité de prudence, sans être supprimées.

### Cas validé
Diagnostic PRO : 3 priorités Arme exclusive.

Classement Boutique de référence obtenu :
1. Fragment d'Arme Exclusive Universel — 100/100
2. Plan d'Équipement (MR) — 93/100
3. 50 Endurance — 89/100
4. Coffre de Campagne (UR) — 88/100
5. Pièce de Drone — 81/100

Le but n'est pas de forcer une ressource à rester n°1 à vie : si le Diagnostic PRO change parce que le compte change, la Boutique IA change avec lui.

## Terminologie
Pour une offre issue uniquement du référentiel daté, `À rechercher` devient **`À vérifier en boutique`**. Cela évite de laisser croire que l'article est actuellement disponible.

## Multilingue
Le nouveau verdict et les explications d'alignement sont fournis dans toutes les options de langue WarBoost actuellement proposées, y compris les variantes anglaises. Les libellés Boutique IA manquants des langues secondaires ont été complétés dans `i18n.js`.

## Ce qui ne change pas
- catalogue boutique V2.4.0 ;
- 31 héros et portraits ;
- logique EX 10/20/30 ;
- `api/scan.js` ;
- moteur méta ;
- activité Alliance ;
- CSS / Publisher UI ;
- schéma Supabase.
