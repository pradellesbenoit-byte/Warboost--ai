# Réparation ciblée du scan — 11 octobre 2026

Travail local sur `public-beta-safe-launch`, sans rollback, modification de
profil joueur, push ni déploiement. Aucun changement d'interface ou de Technologie.

## Pertes constatées et réparations

- L'arbitrage OCR/portrait utilisait la confiance portrait brute même lorsqu'un
  plafond de désaccord capture/zoom existait. Le plafond s'applique désormais
  avant la distinction signal fort/faible. Les seuils ne sont pas abaissés.
- Deux références attestées de variantes différentes du **même héros canonique**
  ne constituent plus un conflit de noms. La variante reste incertaine, les deux
  observations sont conservées et l'accord ne renforce pas la confiance.
- Le masque du recadrage cachait tout le bas du portrait : la comparaison
  visuelle avec les pixels d'origine a montré une perte de nez/moustache.
  Les masques ciblent maintenant le texte Lv et les étoiles, pas toute la zone.
- Un essai Tank sur JPEG a été classé `formation_overview`, contrairement au PNG
  d'origine : aucun second passage ni équipement n'était alors retourné.
  La réponse Vision demande désormais explicitement le titre du dialogue et
  les cinq lignes de détail. Une vue d'ensemble n'est reclassée en détails que
  si titre reconnu et cinq lignes disposent chacun d'une confiance >= 0,90.
  Un overview sans ces preuves n'est pas recadré comme des détails.
- Le second passage ne relisait que les portraits. Il inclut désormais des vues
  des quatre équipements de chaque ligne, dans la **même requête optionnelle**.
  Le lien image/ligne/pièce est explicite. Les seuils d'équipement sont inchangés.
  Les lectures partielles sont conservées, les contradictions restent illisibles,
  un vrai niveau 0 reste 0 et une absence de lecture ne devient jamais 0.

Le premier résultat reste disponible si le passage optionnel échoue ou manque
de temps. Une ancienne donnée préservée n'est pas présentée comme nouvellement lue.

## Essais réels Vision, code final

Appels effectifs de `openaiVision`, puis `sanitizeFormationBatch`, avec les atlas
locaux. Pas de réponse fournisseur simulée dans ces essais. Conversion JPEG
Sharp reproduisant les contraintes dimension/budget du client ; **ce n'est pas
un test du sélecteur de fichiers sur un téléphone ni un encodage canvas identique**.
Pas d'enregistrement dans un profil.

### Tank historique

Source : capture Tank privée utilisée lors de l'essai historique, non distribuée
dans le dépôt. Les tests automatisés utilisent désormais une géométrie synthétique.
Ordre attendu documenté par l'audit précédent : Murphy, Williams, Kimberly,
Marshall, Stetmann. Ce n'est pas une confirmation de la capture actuelle du joueur.

Dernier essai après correction du masque : environ 27,1 s.

| Ligne | Résultat final | Capture entière / zoom | Équipements |
| --- | --- | --- | --- |
| 1 | Murphy proposé | Murphy / Murphy | 4 pièces, Lv.40 |
| 2 | vide, conflit | Marshall / Williams | 4 pièces, Lv.40 |
| 3 | vide, conflit | DVA / Kimberly | 4 pièces, Lv.40 |
| 4 | Marshall proposé | Marshall / Marshall | 4 pièces, Lv.40 |
| 5 | Stetmann proposé | Stetmann / Stetmann | 4 pièces, Lv.40 |

Puissance totale : **35,19 M**. Les cinq niveaux 155 et cinq étoiles sont
conservés. Les deux identités conflictuelles ne sont pas forcées.
Les essais précédents ont aussi produit des propositions erronées avec des
scores élevés : la reconnaissance Tank complète **n'est pas validée**.

### Avion, formation + cinq armes

Sources : six captures privées utilisées lors de l'essai historique
(formation Avion et cinq armes). Elles ne sont pas distribuées dans le dépôt.
La suite automatisée utilise des images synthétiques et des réponses simulées ;
elle ne prétend pas répéter cet essai réel.

Dernier essai après correction du masque : environ 34,0 s.
Formation ordonnée proposée : **Carlie, Lucius, Morrison, DVA, Skyler**.
Puissance **44,43 M**, cinq héros niveau 155 / cinq étoiles, quatre équipements
Lv.40 par héros. Armes associées : Skyler niveau 1, Lucius niveau 1, Carlie niveau 5,
Morrison niveau 10, DVA niveau 28. Ces valeurs proviennent de cet essai, pas de
constantes de production. Confirmation du joueur toujours nécessaire.

## Contrôles automatisés

Tous terminés avec code de sortie 0 :

- `npm run test:scan-loss-boundaries` : 11 vérifications, dont plafonds,
  conflits, zéro/inconnu, variantes et routage. Pixels réels pour les crops,
  réponses simulées pour les identités/niveaux des fixtures.
- `node scripts/verify-formation-vision-batch.mjs` : 29 vérifications, fournisseur
  simulé, batch multi-images, groupes/slots, portraits, référence et masque.
- `npm run test:hero-recognition`, `test:portrait-diagnostics`,
  `test:equipment-scan`, `test:squad-scan-evidence`, `test:squad-provenance`,
  `test:squad-scan-review`, `test:scan-review`, `test:hero-slot-integrity`,
  `test:scan-timeouts`.
- `npm run check`, `npm run build`, `npm run test:web-build`,
  `npm run build:mobile`, `git diff --check`.

Le build mobile est celui des assets web mobiles, pas un APK/AAB ni une archive iOS.

## Restant à valider

- Résoudre sans forçage les deux conflits Tank ; le zoom est juste sur cet essai,
  mais n'est pas une preuve indépendante permettant d'annuler un conflit fort.
- La capture actuelle signalée par le joueur, notamment Héros 2, n'a pas été
  identifiée avec certitude parmi les assets : fournir l'original pour ce cas exact.
- Parcours complet sur téléphone, rendu de revue et confirmation réelle,
  avec un compte de test et sans risquer les profils des joueurs.
- Équipements réellement Lv.0, flous/partiellement illisibles et autres
  dispositions d'écran : cas simulés couverts, captures réelles encore nécessaires.
