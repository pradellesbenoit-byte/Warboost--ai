# Audit ciblé des portraits — Formation actuelle

## Banque DVA et validation

Le chargement serveur vérifie les fichiers et atlas par SHA-256, la présence de
chaque référence dans un atlas et la correspondance avec le registre interne.
La banque reste disponible, avec les 31 héros de base couverts.

| Identifiant attesté | Apparence | Atlas |
| --- | --- | --- |
| dva.normal.fandom | normal | primary-1 |
| dva.normal.official | normal | supplementary-1 |
| dva.normal.lastwarwiki | normal | supplementary-1 |
| dva.awakening.cpthedgehog | awakening | supplementary-2 |

Le recadrage Awakening reste le recadrage rectangulaire attesté « New Appearance »
du manifeste. Les atlas conservent le ratio des images, avec redimensionnement,
marges et étiquettes ; aucune nouvelle image ou variante n'a été ajoutée.
Une attestation de source n'est jamais une vérification du matching de Vision.

## Changements

- Conservation du candidat brut/canonique, de la confiance brute, du niveau final,
  de la variante retournée/normalisée, de l'identifiant retourné/validé, des détails
  visuels retenus/écartés et des motifs de rejet dans la preuve de chaque slot.
- Libellé lisible et volet diagnostic replié dans la revue, avec contenu échappé.
- Normalisation des seuls espaces périphériques et de la casse des identifiants,
  à condition qu'un identifiant vérifié unique corresponde. Aucun rapprochement
  flou, URL, nom de fichier deviné ou variante incompatible accepté.
- Clarification du prompt : exclure le drone, utiliser les cinq lignes « Détails
  du héros » comme ordre des slots, comparer les portraits répétés de la même
  capture et ne pas confondre équipements et portraits.
- Seuils et règles de fusion inchangés : une arme nommée ne crée aucun slot.

## Tests Vision réels effectués

Deux requêtes réelles ont utilisé les six captures déjà présentes dans
`attached_assets` (cinq armes puis la formation) et les quatre atlas chargés
par le serveur. Aucune sauvegarde de profil/cloud n'a été faite.

1. Avec la première clarification du prompt, la sortie proposait, dans l'ordre :
   vide, Carlie, Lucius, Morrison, DVA. DVA était liée au slot 5 avec confiance
   0,90 et référence `dva.normal.fandom`. La comparaison visuelle avec les lignes
   de détail révèle un décalage des propositions et une confusion avec le drone :
   ce résultat ne constitue PAS une réussite de reconnaissance/association.
2. Avec la clarification explicite des cinq lignes de détail et de l'absence de
   placeholder pour le drone, les six sous-types sont corrects et le total vaut
   44,43 M, mais les cinq candidats portraits sont absents. DVA et les autres
   armes restent non reliées. Le diagnostic est `no_candidate`, avec confiance,
   variante et référence non renseignées. Ce n'est pas un rejet d'une référence
   DVA valide par le serveur.

Le motif historique exact de la tâche précédente n'est pas reconstituable sans
sa réponse Vision brute. La nouvelle normalisation des identifiants corrige une
fragilité testée, mais rien ne prouve qu'elle était la cause de ce rejet historique.

## Limite et prochaine validation

## Résultat du passage avec des vues agrandies

Deux passages réels supplémentaires ont utilisé les mêmes six captures locales
et les quatre atlas vérifiés. Chacun a d'abord classé les cinq captures d'arme et
la capture formation à l'index 5. Après cette classification, une seconde
requête facultative a reçu l'image formation inchangée et cinq recadrages
agrandis provenant exclusivement des portraits à gauche des cinq lignes
« Détails du héros ». Chaque recadrage portait l'index 5 et son slot 0 à 4 ;
les atlas ont été transmis à nouveau. Le passage ne s'exécute que pour une
unique capture `formation_details`. Une erreur ou un lot ambigu conserve le
résultat de première passe.

Comparaison visuelle des cinq lignes et des portraits de la rangée héroïque
(en excluant le drone) avec les fichiers originaux attestés :

| Slot | Héros canonique | Référence retournée et vérifiée | Variante |
| --- | --- | --- | --- |
| 1 | Carlie | `carlie.normal.fandom` | normal |
| 2 | Lucius | `lucius.normal.fandom` | normal |
| 3 | Morrison | `morrison.normal.fandom` | normal |
| 4 | DVA | `dva.normal.fandom` | normal |
| 5 | Skyler | `skyler.normal.fandom` | normal |

Vision a écrit « Schuyler » au slot 5 ; l'alias est normalisé en Skyler par le
catalogue existant. Les cinq propositions pleine image et zoom ont concordé,
y compris DVA au slot 4. Elles correspondent aux portraits actuellement visibles
dans la capture joueur, et non à une composition sauvegardée plus ancienne.
Chaque proposition validée est restée de niveau medium et `requires_confirmation`
est resté vrai ; le score brut déclaré par Vision (0,99) n'est pas une précision
calibrée et ne contourne pas la confirmation.

La puissance totale de 44,43 M est restée inchangée. Les cinq armes sont restées
dans l'ordre de leurs captures et ne servent qu'à corroborer une identité déjà
proposée par le portrait ; elles ne déterminent ni les héros ni l'ordre des slots.
Aucun handler de profil ou d'enregistrement cloud n'a été appelé.

Ce résultat résout le cas de ces six captures, pas la précision générale de
Vision. Les seuils et la confirmation obligatoire n'ont pas été abaissés. Les
autres résolutions/dispositions ainsi que le diagnostic sur téléphone restent à
vérifier ; ne pas compenser par les armes, une ancienne composition, les niveaux,
les étoiles ou les puissances.

## Vérification automatisée

`npm run test:portrait-diagnostics` couvre notamment les quatre références DVA
réelles, confiance forte/moyenne/faible, identifiants manquants/incorrects,
mauvais héros/variante, ambiguïtés, noms contradictoires, alias, armes non liées,
exclusion des clés numériques, transmission à la revue et échappement HTML.

## Comparaison sur une autre composition réelle

La capture Tank privée utilisée lors de l'essai historique montre une seconde
composition, différente de celle documentée plus haut. L’ordre fourni et validé
par le joueur est Murphy, Williams, Kimberly, Marshall, Stetmann. Le total affiché
est 35,19 M ; il n'a pas servi à identifier les portraits.

Les images privées de ces essais ne sont plus distribuées dans le dépôt.
Les tests reproductibles de recadrage utilisent des images synthétiques,
sans valider à nouveau la reconnaissance visuelle sur ces captures réelles.

Un passage Vision réel a reçu uniquement cette capture de formation et la banque
de références attestées. Aucun écran d'arme, ancienne composition, niveau ou
nombre d'étoiles n'a été transmis comme indice d'identité. La revue a utilisé le
traitement courant, y compris les zooms dérivés des cinq lignes de cette même
capture. Résultat par ligne :

| Ligne | Ordre attesté par le joueur | Proposition finale | Décision |
| --- | --- | --- | --- |
| 1 | Murphy | Murphy — `murphy.normal.fandom`, normal, confiance 0,93 | Proposition forte, confirmation joueur toujours requise |
| 2 | Williams | aucune | Non résolu : désaccord entre la capture entière et le zoom de cette ligne |
| 3 | Kimberly | aucune | Non résolu : désaccord entre la capture entière et le zoom de cette ligne |
| 4 | Marshall | aucune | Non résolu : désaccord entre la capture entière et le zoom de cette ligne |
| 5 | Stetmann | Stetmann — `stetmann.normal.fandom`, normal, confiance 0,94 | Proposition forte, confirmation joueur toujours requise |

Les lignes 2 à 4 ont été explicitement laissées vides par le validateur avec le
motif `conflicting_identity` ; aucun choix entre les deux observations n'a été
forcé. Les lignes 1 et 5 concordent avec l'ordre attesté, mais restent des
propositions et non des confirmations. Les scores bruts du fournisseur ne sont
pas une précision calibrée. Les zooms proviennent des pixels de cette même
capture et ne constituent pas des observations indépendantes.

### Contrôle des pixels des cinq portraits

La capture source fait 1008 × 2244 pixels. Les cinq recadrages sont liés à
l'image 0 et aux lignes 0 à 4 ; leur boîte d'origine commence à x=106, avec les
hauts y=1086, 1230, 1367, 1503 et 1643, et mesure 119 × 121 pixels. Le contrôle
visuel de chaque portrait (sans lire le texte, les étoiles, l'équipement ni
l'ordre fourni par le joueur) donne les correspondances d'apparence suivantes :

| Ligne | Détails du portrait visibles dans cette ligne | Référence attestée comparée |
| --- | --- | --- |
| 1 | cheveux bruns ondulés, visage allongé et large sourcil | `murphy.normal.fandom.webp` |
| 2 | cheveux bruns coiffés en arrière, barbe et vêtement bleu/rouge | `williams.normal.fandom.webp` |
| 3 | cheveux blond clair balayés, yeux bleus et boucle d'oreille | `kimberly.normal.fandom.webp` |
| 4 | cheveux blancs, sourcils marqués et moustache blanche | `marshall.normal.fandom.webp` |
| 5 | cheveux blancs, lunettes et longue barbe blanche | `stetmann.normal.fandom.webp` |

Cette comparaison confirme que les pixels des lignes 2 à 4 sont lisibles face
aux références, mais ne reconstitue pas les deux noms candidats du passage Vision :
les réponses brutes pleine image et zoom de cet audit n'ont pas été conservées.
Il serait donc incorrect d'affirmer lequel de ces candidats contredisait les
pixels ou d'en inventer les valeurs. Le conflit reste non résolu malgré le
contrôle visuel de référence. Les recadrages de revue masquent désormais la bande
inférieure où apparaissent le niveau et les étoiles ; ces champs peuvent toujours
être lus séparément sur la capture complète, mais ne sont pas des indices
d'identité. Aucun indice d'arme ou de composition antérieure n'est utilisé.

Le test automatisé sur cette capture utilise des propositions synthétiques avec
des références attestées distinctes pour les lignes 2 à 4. Il vérifie le garde-fou
de conflit, pas la précision d'un nouveau passage Vision réel : les trois identités
restent vides, `unresolved`, avec `requires_confirmation: true`, tandis que les
observations contradictoires restent accessibles dans le diagnostic.

Le premier cas documenté plus haut et cette seconde capture donnent ainsi deux
compositions réelles comparées à leur ordre joueur : cinq propositions concordantes
sur la première, et deux propositions concordantes plus trois conflits non résolus
sur la seconde. L'ordre distinct « Adam, Violet, Tesla, Sarah, Mason » mentionné
pour `1000024165.png` n'a pas été évalué : aucune image de ce nom n'a été reçue.
Cette vérification n'a appelé aucun handler d'enregistrement de profil ou cloud.
