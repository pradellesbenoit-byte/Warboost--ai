---
name: OCR review boundary
description: Why actionable Vision results require explicit review before merging into saved player state.
---

Treat an OCR response as a proposal, not a saved fact. Any value that can affect advice must be reviewed and correctable before it replaces confirmed state; missing or unreadable fields must leave prior confirmed values intact. A pending review belongs to the account and capture that produced it, so late responses cannot attach to a different image or session.

**Why:** The provider could mark a result as requiring confirmation while the browser still merged it immediately. Partial and asynchronous results then risked replacing reliable values or being reviewed against a different visible capture.

**How to apply:** For new scan types, define the exact actionable fields that can be staged, show their origin and scan time without implying the screenshot itself is recent, and commit only fields the user has reviewed. Keep permission-sensitive alliance roles under server-side verification; a screenshot or local edit is not proof of R4/R5 authority.

Any human-readable OCR editor that hides an internal encoding must round-trip an untouched value without dropping supported details. Do not blank unrelated OCR text merely because it resembles that encoding.

**Why:** A readable equipment editor can silently lose a second rarity, and a broad "technical text" filter can erase a shop description when the player confirms the form unchanged.

**How to apply:** Test untouched and corrected submissions separately for multi-valued fields, plus OCR text that resembles an internal key. A live language change must retranslate the review without resetting its inputs or replacing its current scan status.

Account isolation also applies to transient media labels and progress, not only to saved facts and pending responses.

**Why:** Suppressing a late result and clearing image references can still leave the previous account’s filename and progress visible in an existing drawer.

**How to apply:** Account transitions must invalidate request bindings and clear the rendered capture list, preview, review status and busy controls before restoring the new owner’s pending captures.

Une confirmation d’escouade peut enregistrer des champs fiables sans confirmer toute
la composition. Les identités incomplètes, inconnues ou en double restent en attente ;
elles ne permettent ni transfert positionnel d’attributs ni effacement des confirmations.

**Why:** L’utilisateur demande que les scans partiels utiles ne soient plus bloqués par
des héros ou champs secondaires incomplets, sans sacrifier les données déjà confirmées.

**How to apply:** Distinguer la confirmation des valeurs de celle d’une nouvelle composition.
Une identité exacte permet d’enrichir un héros connu ; seule une composition complète et
sans ambiguïté autorise son remplacement. Les champs omis ne reçoivent pas de fraîcheur nouvelle.

Les héros déjà confirmés du profil sont des indices de lecture, jamais une preuve de
la composition actuellement visible. Ne pas identifier un héros par un portrait
non étayé, sa position, son niveau, ses étoiles ou la liste des héros du profil. Une sauvegarde
partielle ne doit pas être annoncée comme une confirmation complète.

**Why:** L’utilisateur demande de renforcer la lecture des formations difficiles sans
inventer d’identité ni afficher « Confirmé » lorsque des héros attendent encore validation.

**How to apply:** Exiger un indice textuel réellement visible et une association sans
ambiguïté pour utiliser le contexte confirmé. Garder explicites la confiance OCR et
les éléments non résolus ; un score non fourni reste non fourni, pas un score inventé.

Dans Formation actuelle, un portrait comparé à une référence vérifiée peut
préremplir un nom proposé, avec confiance explicite et confirmation obligatoire.
Un titre d’arme compatible peut le corroborer, jamais créer sa présence dans un slot.
Les captures du lot sont analysées ensemble ; les textes des armes ne doivent
jamais être présentés comme OCR de la capture formation.

**Why:** l’utilisateur demande désormais la reconnaissance automatique des portraits
avec la banque existante et une requête Vision multi-images unique, sans retaper
les noms fiables. Cela autorise des propositions visuelles étayées, pas des identités
enregistrées automatiquement.

**How to apply:** séparer source OCR et preuve portrait ; conserver les inconnus,
la provenance des confirmations et la confirmation finale, même à forte confiance.

Un écran individuel d’arme est une preuve complémentaire, jamais une preuve de
présence ou de position dans l’escouade. Le niveau d’arme n’est pas celui du
héros. Sur tous les écrans d’armes exclusives, ignorer le grand nombre sous le
niveau : ne pas l’extraire, le garder comme OCR brut, l’afficher comme puissance
éditable, l’enregistrer comme puissance d’arme, ni le transférer au héros. Pour
un bonus affichant une prévision verte après une flèche, lire seulement la valeur
actuelle à gauche.

**Why:** l’utilisateur a explicitement autorisé l’analyse des écrans réels et
précisé que ce grand nombre ne doit jamais être enregistré comme puissance d’arme
ou puissance de héros.

**How to apply:** appliquer la règle aux prompts, au sanitizer API et à chaque
étape de revue/sauvegarde, y compris Formation actuelle. Garder les bonus et
identités séparés et demander confirmation avant sauvegarde. Ne pas modifier les
données de profil déjà persistées sans autorisation.

La puissance individuelle d’un héros absente de la formation est optionnelle :
elle ne doit pas être listée comme manquante ou restant à confirmer.

**Why:** l’utilisateur demande « Ne marque pas la puissance de l’arme exclusive »,
en citant les écrans Skyler niveau 1 et DVA niveau 28 ; seuls nom, niveau et
bonus/statistiques fiables de l’arme lui sont utiles.

**How to apply:** ignorer cette valeur dès l’extraction et aux frontières de revue,
conserver la puissance totale de formation et les puissances de héros confirmées
par une autre source fiable, sans effacer de données persistantes préexistantes.

Le scan joueur d’escouade expose uniquement « Formation actuelle » : une formation
et jusqu’à cinq armes dans un lot de six captures. La numérotation interne ne doit
pas être réintroduite dans ce parcours ; les autres données d’escouade restent conservées.

**Why:** l’utilisateur veut scanner l’escouade qu’il souhaite améliorer, sans devoir
choisir un numéro, puis vérifier ses cinq armes dans une seule fiche.

**How to apply:** réserver la limite de six à ce parcours, garder les limites des
autres scans, et exiger une association explicite du joueur pour toute arme non reliée.