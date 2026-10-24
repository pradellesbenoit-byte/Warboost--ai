# Scan formation — positions et arbitrage, 17 octobre 2026

## Portée

Correction locale sur public-beta-safe-launch. Aucun accès Supabase, donnée
de compte, appel Vision payant, migration, push ou déploiement. Aucun changement
de présentation, de sélection des escouades, de stockage ou de sauvegarde.

## Défauts déterministes corrigés

- Le premier passage n'avait pas de numéro de position par héros dans son
  schéma. Il dépendait uniquement de l'ordre du tableau du fournisseur, tandis
  que le zoom employait des numéros de lignes explicites. Le schéma et le
  prompt demandent maintenant slot_index 0..4. Les lignes explicitement
  indexées sont remises dans l'ordre AVANT recadrage/fusion et normalisation,
  en déplaçant l'objet ligne entier, équipements compris. Un index partiel,
  dupliqué, hors plage ou non entier provoque un refus, pas une réaffectation.
  Les réponses historiques sans index, ou avec tous les index null, gardent
  leur ordre historique. Cela ne prouve pas que le fournisseur s'était trompé
  de position sur les anciennes captures Tank.
- Le matcher du zoom n'employait pas le même normaliseur que le reconnaisseur
  pour les candidats accompagnés d'un contexte d'apparence (ex. Williams normal).
  Il pouvait écarter une proposition valide avant l'arbitrage. Les deux chemins
  utilisent désormais recognitionHeroName, sans correspondance floue d'ID de
  référence, ni assouplissement de variante ou de seuil.
- Une proposition visuelle au score élevé MAIS à référence absente, introuvable
  ou d'un autre héros pouvait bloquer un nom OCR indépendant, complet et fort.
  Cette référence invalide ne fait plus veto au nom. La preuve visuelle rejetée
  reste dans le diagnostic et la proposition OCR exige une confirmation humaine.
  Un nom fragmentaire, un nom contradictoire fourni séparément, deux preuves
  fortes valides, ou l'absence de preuve ne sont pas résolus arbitrairement.
- Un conflit fort capture/zoom pouvait encore laisser le nom OCR du premier
  passage entrer dans la normalisation, alors que le diagnostic affichait
  unresolved. Ce nom est maintenant conservé seulement dans la preuve de
  diagnostic du conflit, et non propagé comme identité sélectionnée.

## Deux lignes Tank documentées

Les rapports historiques indiquent Marshall/Williams pour la ligne 2 et
DVA/Kimberly pour la ligne 3. Aucun des défauts ci-dessus ne peut être déclaré
cause certaine de ces deux résultats sans les observations originales complètes.
La reproduction synthétique avec deux références valides et fortes garde ces
deux noms vides et les quatre équipements de chaque ligne, sans injection par
l'arme Kimberly. Le zoom n'est pas une source indépendante et ne gagne pas
automatiquement sur la capture entière.

## Validation effectuée

23 commandes npm distinctes ont réussi à leur dernière exécution :

- test:formation-vision-batch : 36 groupes, dont 6 nouveaux. Cinq compositions
  Tank alternatives/Avion/Missile × quatre cibles d'escouade sont vérifiées dans
  un groupe : 20 combinaisons, chacune avec 20 niveaux d'équipement distincts,
  y compris zéro, et retour de lignes inversé. Ce ne sont pas 20 groupes ajoutés.
- test:hero-recognition : 44 scénarios, catalogue complet de 31 héros.
- test:portrait-diagnostics : 23 contrôles.
- test:scan-loss-boundaries : 11 contrôles, vrais traitements de pixels
  synthétiques avec sharp, reconnaissance simulée.
- test:equipment-scan : 10 contrôles ; zéro, incomplet, illisible,
  association et conservation des champs confirmés.
- test:squad-mixed-captures : 25 ; test:squad-provenance : 12 ;
  test:squad-scan-targets : 19 ; test:squad-scan-review : 21 ;
  test:squad-scan-evidence : 11 ; test:scan-timeouts : 8.
- test:squad-restore, test:hero-slot-integrity, test:scan-review
  (inclut Drone, Technologie et sélecteur), test:player-scan-diagnostic,
  test:safe-launch-i18n (23 locales / 22 langues), test:alliance-authorization,
  test:technology-center (15 tests).
- check, build:web (8 pages / 149 modules), test:web-build,
  build:mobile (7 pages / 144 modules), test:mobile-wrapper.

Un échec intermédiaire de test:hero-recognition attendait qu'une proposition
visuelle sans référence bloque le nom OCR. Le cas est maintenant séparé :
référence non validée => OCR fort à confirmer ; deux preuves fortes avec référence
valide => vide. La suite relancée passe, sans retirer le contrôle de contradiction.

## Limites et validation réelle restante

Les réponses Vision des nouveaux tests sont simulées, les images de géométrie
sont synthétiques. Aucune nouvelle mesure d'exactitude OCR sur vraie capture,
aucun essai physique Android/iOS, aucun APK/AAB ni nouvelle sauvegarde réelle.
La description jointe (35.66M, cinq Lv.155, vingt Lv.40) n'est ni une fixture
pixel accessible identifiée ni une preuve de l'identité des cinq portraits.
Les constantes de test ne sont pas des valeurs par défaut du moteur.

Le moteur ne modifie jamais automatiquement les compositions confirmées. Les
tests existants de provenance, revue et restauration ont été relancés avec succès.
La migration de réparation cloud et son verrou restent intacts. Avant de déclarer
les deux slots Tank réparés en conditions réelles, il faudra rejouer l'original
accessible avec ses sorties fournisseur et vérifier le rattachement des lignes,
sans se contenter d'un score élevé ou du nom attendu.
