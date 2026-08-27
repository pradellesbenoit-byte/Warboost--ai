# WarBoost V2.4.3 — Situational Utility Priority

## Pourquoi ce correctif
V2.4.2 empêchait correctement les coffres génériques de dépasser une ressource directe. La Preview a ensuite révélé un autre cas : `50 Endurance` pouvait encore entrer en TOP 3 alors que le Diagnostic PRO demandait d'abord des ressources de progression directes.

Une ressource utile n'est pas nécessairement une ressource prioritaire maintenant.

## Nouvelle règle
WarBoost distingue désormais les **ressources de progression directe** des **utilités situationnelles**.

Utilités situationnelles surveillées :
- Endurance ;
- boucliers ;
- téléporteurs ;
- transfert ;
- accélérations de construction ;
- accélérations de recherche ;
- accélérations de formation ;
- accélérations de soins ;
- accélérations génériques.

Sans contexte confirmé, elles restent derrière les ressources qui répondent directement au Diagnostic PRO.

### Endurance
- sans Saison/contexte : plafond prudent ;
- Saison active : plafond **76/100** ;
- besoin explicite d'Endurance détecté par un futur contexte Saison/événement : plafond contextuel relevé, sans forcer l'achat.

### VS / utilités tactiques
Les boucliers, téléporteurs et accélérations peuvent retrouver de la valeur lorsqu'ils correspondent au jour VS ou à un objectif explicite. Le classement redevient alors contextuel au lieu d'être bloqué de manière permanente.

## Régression reproduisant le profil Preview
Référentiel Boutique, Diagnostic PRO dominé par les armes exclusives :
1. Fragment d'Arme Exclusive Universel — **100/100**
2. Plan d'Équipement (MR) — **93/100**
3. Pièce de Drone — **81/100**

`50 Endurance` — **76/100** avec Saison active sans besoin explicite.

Le `Coffre de Campagne (UR)` reste plafonné à **70/100** par la règle V2.4.2.

## Multilingue
Le garde-fou et ses explications sont traduits dans les **22 langues WarBoost**. EN-GB et EN-US partagent l'anglais.

## Inchangé
- référentiel Boutique : 164 entrées / 163 nommées / 137 avec prix / 15 familles ;
- 27 prix inconnus ou masqués restent volontairement non inventés ;
- 31 héros / 31 portraits ;
- logique EX10 / EX20 / EX30 ;
- accumulation multi-boutiques ;
- Scan ;
- activité Alliance ;
- méta ;
- CSS / Publisher UI ;
- Supabase.
