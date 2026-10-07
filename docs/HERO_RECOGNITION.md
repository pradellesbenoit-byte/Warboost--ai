# Reconnaissance d’escouade : roster entier, sans priorité

## Identités

`lib/heroes.js` reste la source des 31 identités. `lib/hero-recognition.js`
construit la bibliothèque et les mêmes règles pour chaque héros :

- Tank (13) : Kimberly, Marshall, Williams, Murphy, Stetmann, Mason, Violet,
  Scarlett, Monica, Richard, Farhad, Gump, Loki.
- Aircraft (9) : DVA, Morrison, Carlie, Lucius, Schuyler, Sarah, Cage, Ambolt, Maxwell.
- Missile (9) : Tesla, Fiona, Swift, Adam, McGregor, Venom, Elsa, Kane, Braz.

Schuyler conserve l’identité interne historique `Skyler` et les anciens alias.
Les sélecteurs affichent Schuyler. Cela évite de dupliquer un héros ou de casser
les compositions et attributs déjà enregistrés.

La recherche OCR utilise le **roster entier**, pas seulement les noms d’un profil.
Aucun héros, type, rareté, emplacement ou composition antérieure n’est prioritaire.

## Apparences et limites réelles

Chaque identité possède les mêmes emplacements de références extensibles :
portrait normal, arme exclusive, Awakening, promotion SSR→UR, autre apparence.
Ce sont des **contextes possibles**, pas une affirmation que toutes ces variantes
existent pour chacun des 31 héros. Leur disponibilité et leurs références restent
`unverified` tant qu’une capture/source fiable ne les documente pas.

Les SVG actuels sont des illustrations WarBoost, PAS des références Last War.
Aucune galerie officielle ou référence visuelle validée n’a été fournie dans cette
passe. Aucun portrait de référence ou changement d’apparence n’a été inventé.
Le modèle Vision peut proposer une identité à partir d’au moins deux détails
visibles, mais cette proposition visuelle seule reste à confirmer : ce n’est pas
une correspondance de portrait certifiée ni une mesure de précision calibrée.

Les labels de variantes sont ramenés à la même identité : DVA normale,
DVA arme exclusive et DVA Awakening ne créent jamais trois héros.

## Confiance et validation

- Texte complet ou fragment unique du roster, confiance déclarée >= 0,88 :
  proposition forte, toujours revue avant l’enregistrement.
- Confiance déclarée >= 0,70 et < 0,88 : proposition « à confirmer ».
- Portrait seul suffisamment décrit : proposition plafonnée à 0,84, donc
  confirmation manuelle obligatoire, même si le modèle annonce une valeur élevée.
- Confiance faible, score invalide, nom inconnu, fragment ambigu ou indices
  contradictoires : identité vide et choix manuel.
- Quand texte et portrait concordent, leur confiance combinée reste conservatrice :
  elle ne dépasse pas le plus faible des deux scores. Aucun bonus arbitraire.

Les cinq sélecteurs proposent chacun les 31 héros, y compris sur un scan partiel.
Le joueur peut corriger chacun avant de cliquer sur la confirmation finale.
Une proposition moyenne ne peut pas devenir une composition confirmée sans le
marqueur de revue explicite du parcours utilisateur : accepter chaque nom proposé
avec « Je confirme ce héros », ou choisir un autre héros dans son sélecteur.
Un clic final sans cette acceptation laisse ces identités en attente et permet
d’enregistrer uniquement les champs indépendants fiables. Les doublons restent bloquants
pour une composition complète ; les champs fiables indépendants restent enregistrables.

Les compositions héritées sans preuve explicite restent archivées, jamais des indices
Vision ou des valeurs automatiquement restaurées. Les garde-fous propriétaire,
capture, identifiant d’escouade, fraîcheur et conservation des données confirmées restent
actifs. Aucun accès direct à Last War, nouvel appel de service, paiement ou droit
bêta/PRO n’est ajouté.

## Extension et validation future

Ajouter un héros à `HERO_DEFINITIONS` étend automatiquement la bibliothèque,
le prompt, les sélecteurs et le matching de texte. Ajouter un contexte à
`HERO_APPEARANCE_CONTEXTS` étend les emplacements et labels sans changer l’algorithme.
Pour de vrais portraits de référence, renseigner identité, variante, provenance,
date et validation de chaque référence, puis intégrer un comparateur vérifiable ;
ne jamais accepter une simple affirmation `reference_verified` du fournisseur.

Les tests synthétiques couvrent les 31 identités et les contextes, pas la précision
réelle sur leurs portraits. Avant de promettre une reconnaissance visuelle exhaustive,
il reste à obtenir des captures autorisées et à mesurer chaque apparence réelle.
