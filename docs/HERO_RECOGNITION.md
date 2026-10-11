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

Chaque identité possède des références normales et ses seules variantes visuelles
attestées. Les promotions SSR→UR de Mason, Violet et Scarlett restent à rechercher
et valider ; elles ne disposent pas encore de référence vérifiée.
Les armes exclusives sont classées séparément comme **équipement**, pas comme
évolution visuelle ni comme portrait manquant. EW/EW30 ne devient un contexte
visuel utilisable que si une référence vérifiée atteste un portrait réellement
différent. Sinon, comparer uniquement à l’apparence normale. La structure reste
extensible sans créer automatiquement des variantes pour les 31 héros.

Les SVG actuels sont des illustrations WarBoost, PAS des références Last War.
Une banque privée contient désormais **58 références pour les 31 héros** :
5 visuels nommés du site officiel, 16 images de pages héros `lastwar.wiki` et
31 vignettes du tableau Heroes de Fandom, plus **six recadrages de captures de
jeu nommées** publiées par Cpt Hedgehog : Awakening de Kimberly/DVA/Tesla
et promotions UR de Sarah/Venom/Braz. L’identité a été contrôlée par le
nom de la page/ligne, le libellé de l’image et une comparaison visuelle des
planches. Les images réinterprétées trouvées sur un site complémentaire ont
été rejetées, pas importées. Voir [l’audit détaillé](HERO_REFERENCE_AUDIT.md).
Aucun changement d’apparence non attesté n’a été inventé.
Le modèle Vision peut proposer une identité à partir d’au moins deux détails
visibles, mais cette proposition visuelle seule reste à confirmer : ce n’est pas
une correspondance de portrait certifiée ni une mesure de précision calibrée.

Les labels de variantes attestées sont ramenés à la même identité : DVA normale
et DVA Awakening restent DVA. La présence d’une arme exclusive ne crée ni une
nouvelle identité ni une preuve de changement d’apparence.

## Confiance et validation

### Lots mixtes de formation et d’armes exclusives

Le joueur choisit un seul scan « Formation actuelle », sans numéro d’escouade.
Le lot accepte de 1 à 6 images : une formation obligatoire et jusqu’à cinq armes
exclusives. Il utilise une seule requête Vision structurée pour le lot complet et une seule fiche
de vérification pour tout le lot. Les autres types de scan restent limités à
trois captures ; Technologie conserve sa requête groupée dédiée.

Chaque image joueur est indexée séparément des atlas. La réponse `captures[]`
doit couvrir exactement ces indices, sans doublons, avec sous-type, preuves,
confiances et cinq slots ordonnés pour la formation. Le serveur rejette une
réponse tronquée/incohérente et ne transforme pas un titre d’arme en OCR de formation.
Un portrait relié à une référence vérifiée peut proposer son héros ; un titre
d’arme compatible le corrobore sans créer de slot. Forte confiance = proposition,
moyenne = à confirmer, faible = vide ; la confirmation finale reste obligatoire.
Le catalogue d’associations fourni par l’utilisateur contient treize héros :
il sert d’indice d’identité, jamais de remplissage de nom d’arme/niveau/bonus.
Skyler/Schuyler et Stetmann/Stethmann restent chacun une seule identité canonique.
Les puissances individuelles exigent une capture dédiée explicitement supportée,
hors de ce lot ; aucun champ de puissance individuelle n’est extrait ici.

Le lot entrant est limité à 3 600 000 caractères de données image. La sélection
répartit ce budget entre les fichiers et compresse seulement si nécessaire,
sans réduire les dimensions ; elle n’envoie pas le profil complet pour ce scan.
Les atlas restent privés et sont joints côté serveur. OpenAI reçoit un schéma JSON
strict ; un fournisseur custom doit respecter le même contrat multi-images.
Les tests de transport utilisent un fournisseur simulé, pas une mesure OCR réelle.
Chaque image est classée en `formation_details`, `formation_overview`,
`exclusive_weapon_detail` ou `unknown`. Une arme lisible n’interrompt plus le lot
au motif qu’elle n’affiche pas cinq héros.

La formation reste la source de l’ordre, des niveaux des héros et de la puissance
totale (par exemple 44,43 M). Un écran nommé d’arme fournit une preuve séparée :
texte visible du héros, nom de l’arme, niveau et confiance de lecture. « Skyler »
et « Schuyler » désignent toujours la même clé canonique historique `Skyler`.

Une arme ne prouve jamais l’appartenance à la formation. Son niveau ne rejoint
le champ d’arme que si un unique héros de formation a une proposition d’identité
compatible et suffisamment confiante. Les emplacements inconnus ou en doublon
ne sont pas remplis depuis les armes ; les preuves non reliées ou contradictoires
sont signalées sans être appliquées. Le grand nombre sous le niveau d’arme est
ignoré : aucune puissance d’arme ni puissance de héros n’en est extraite.

Le résultat affiche les sous-types reconnus et les preuves reliées/non reliées.
Les champs de formation lisibles restent dans la vérification, même si les noms
sont absents. Toute sauvegarde passe par la confirmation utilisateur existante ;
ni l’analyse ni la fusion du lot ne modifient directement le profil.

Les armes non reliées apparaissent comme « arme détectée à associer ». Le joueur
peut explicitement confirmer le héros d’un emplacement inconnu/compatible et y
associer une arme, sans changement du profil avant la confirmation finale.
Les armes reliées affichent leur nom, niveau et valeurs fiables dans le même
groupe que le héros, sans champ de puissance d’arme. Les puissances individuelles
absentes de la formation sont optionnelles et ne créent aucun élément manquant ;
la puissance totale lisible de formation reste proposée puis enregistrée après confirmation.
Les bonus non suffisamment confiants ne sont pas proposés comme valeurs fiables.

Compatibilité : ce parcours utilise intérieurement `squads[0]` et la clé historique
`squad1`; les autres escouades enregistrées restent intactes. Les anciens raccourcis
de scan numérotés sont redirigés vers « Formation actuelle », sans exposer ce choix
technique. Une nouvelle composition ne remplace la précédente qu’après confirmation.
Les six captures du parcours restent en mémoire durant la session, sans cache
persistant volumineux ; fermeture complète ou changement de compte les efface.

Le test `test:squad-mixed-captures` couvre notamment une formation de cinq héros
niveau 155 à 44,43 M, DVA arme niveau 28 et Skyler arme niveau 1. Ce sont des
réponses fournisseur synthétiques représentatives, pas une mesure OCR sur les
captures originales de l’utilisateur.

- Texte complet ou fragment unique du roster, confiance déclarée >= 0,88 :
  proposition forte, toujours revue avant l’enregistrement.
- Confiance déclarée >= 0,70 et < 0,88 : proposition « à confirmer ».
- Détecteur générique : portrait seul suffisamment décrit plafonné à 0,84.
  Dans le lot Formation actuelle, une référence vérifiée exacte est obligatoire
  pour un nom proposé par portrait seul ; une confiance >= 0,88 peut alors devenir
  une proposition forte, corroborée si un titre d’arme compatible est disponible.
  La confirmation finale reste obligatoire, même à forte confiance.
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
Cela n’invente pas de référence vérifiée pour un nouveau héros. Après revue des
images sources, compléter les données déclaratives de `lib/hero-reference-index.js`
et importer les fichiers via `scripts/build-hero-reference-assets.mjs`. Une
variante attestée utilise `reviewedVariants` ; l’import incrémental
`--append-reviewed chemin/vers/candidats-revus.json` refuse de remplacer une
référence existante et demande des preuves de variante/changement visuel.
Les planches et leur chargement
s’adaptent au nombre de références sans réécrire le comparateur.
Les fichiers, sources, variantes, dimensions, empreintes SHA-256 et statuts
sont conservés dans `research/hero-references/manifest.json`. Le chargeur serveur
vérifie la banque avant de joindre quatre planches légendées à la requête OpenAI
existante. Les images sont distinctes des captures du joueur. Il n’y a ni appel
supplémentaire de reconnaissance, ni téléchargement Last War à l’exécution.
Les fichiers privés ne sont pas copiés dans le web/PWA ou le bundle mobile.
Vercel les inclut seulement dans la fonction de scan.

Le fournisseur personnalisé de secours ne déclare pas de capacité à recevoir ces
planches : ses propositions restent non vérifiées et à confirmer. Il ne peut pas
hériter de la validation de références envoyées à OpenAI. Une banque absente ou
corrompue est entièrement désactivée ; aucun faux succès de vérification.
Une simple affirmation `reference_verified` du fournisseur n’est jamais acceptée :
l’ID doit appartenir aux références réellement jointes et correspondre au héros
et à la variante. `match_verified` reste faux : la validité de la source ne
certifie pas le résultat du modèle.

Les tests synthétiques couvrent les 31 identités et les contextes, pas la précision
réelle sur leurs portraits. Avant de promettre une reconnaissance visuelle exhaustive,
il reste à obtenir des captures autorisées et à mesurer chaque apparence réelle.
Les références ajoutent des tokens image dans la requête existante ; coût et
latence doivent être mesurés avec de vraies captures. Aucun droit d’usage ou
accord officiel Last War/FUNFLY n’est accordé par cet import.

L’audit des variantes se trouve dans [HERO_VARIANT_AUDIT.md](HERO_VARIANT_AUDIT.md).
Une illustration/tuile « New Appearance » ou « Hero Promotion UR » est une
référence d’apparence, jamais la preuve que le joueur scanné possède cette
évolution. On ne déduit pas le niveau EW, la rareté ou l’Awakening du joueur
à partir de la variante reconnue.
