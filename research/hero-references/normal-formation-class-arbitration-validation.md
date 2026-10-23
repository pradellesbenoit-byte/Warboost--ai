# Scan normal des formations — correction ciblée du 18 octobre 2026

## Ce qui est établi et ce qui ne l'est pas

Le scan normal possède déjà les correctifs de positions explicites 0–4,
normalisation des lignes inversées, références de portraits validées, quatre
pièces indexées par héros et revue avant confirmation. Ils sont conservés.
L'API Vision, son modèle, ses clés et ses limites ne sont pas modifiés.

Une lacune reproductible subsistait : `visibleHeroClass` excluait une identité
incompatible au stade final, mais les deux portraits capture/zoom étaient
comparés avant cette exclusion. Une proposition Avion pourtant incompatible
avec une classe Tank explicitement lisible pouvait donc être traitée comme une
contradiction forte et vider la proposition du même slot.

Le filtre négatif existant s'applique maintenant aux deux propositions AVANT
l'arbitrage. Il utilise seulement le champ de classe explicitement lu dans
CETTE ligne, avec le seuil existant. Une déclaration « équipe Tank », la classe
d'un voisin ou une classe illisible/faible ne compte pas. Ni seuil, ni score
augmenté ; une proposition nécessite toujours sa propre référence et ses détails
visuels. Les observations rejetées sont conservées dans la revue, pas logguées.

Cela corrige une branche vérifiable susceptible d'expliquer DVA/Kimberly, PAS
la preuve de la cause historique : aucune observation originale complète n'est
disponible pour ce test réel. Marshall/Williams, tous deux Tank, restent
non résolus si leurs deux lectures admissibles sont fortes. Aucun nom, ordre,
équipement ou arme n'est injecté pour compléter une équipe.

## Changements limités

- `lib/formation-batch.js` : admissibilité des deux portraits filtrée par classe
  visible de leur ligne ; métadonnées de revue du rejet.
- `scripts/verify-formation-class-arbitration.mjs` : cas synthétiques ciblés.
- `package.json` : ajout des cas à la suite formation existante ; lancement DEV
  revenu à `node server.mjs`, SANS diagnostic externe.
- Ce rapport et note de contexte utilisateur en mémoire projet.

Les équipements n'ont pas nécessité une nouvelle modification du moteur :
les tests conservent les quatre pièces avec leurs indices et leurs niveaux,
un vrai zéro, les trous et contradictions, sans emprunter les pièces du voisin.
Une valeur inconnue du nouveau scan ne supprime pas un champ confirmé :
les suites de revue/provenance/restauration vérifient ce comportement existant.

## Vérifications réellement exécutées

22 commandes npm réussies, zéro échec final :

- `test:formation-vision-batch` : 36 groupes existants + 6 nouveaux.
  Les nouveaux comprennent 80 arbitrages : cinq compositions (deux Tank,
  Avion, Missile et mixte) × quatre cibles d'escouade × slots 2/3 × deux sens
  capture/zoom. Ordre inversé, immuabilité et 20 pièces distinctes vérifiés.
  Extraction réelle de pixels synthétiques aux tailles 600×1336, 900×2004
  et 1008×2244, avec contrôle des 20 positions équipement.
- `test:hero-recognition` : 44 scénarios ; `test:portrait-diagnostics` : 23.
- `test:scan-loss-boundaries` : 11 ; `test:equipment-scan` : 10.
- `test:squad-mixed-captures` : 25 ; `test:squad-provenance` : 12.
- `test:squad-scan-targets` : 19 ; `test:squad-scan-review` : 21 ;
  `test:squad-scan-evidence` : 11 ; `test:scan-timeouts` : 8.
- `test:squad-restore`, `test:hero-slot-integrity`, `test:scan-review`
  (inclut Drone, Technologie, sélecteur), `test:technology-center`,
  `test:alliance-authorization`, `test:safe-launch-i18n` : PASS.
  Le contrôle i18n couvre 23 locales / 22 langues ; aucun nouveau texte UI.
- `check`, `build:web`, `test:web-build`, `build:mobile`,
  `test:mobile-wrapper` : PASS. Web : 8 pages / 149 modules.
  Wrapper web mobile : 7 pages / 144 modules, pas une release native.
- `git diff --check` : PASS.

Le Preview normal redémarré répond HTTP 200 sur `/`. La route de configuration
du diagnostic isolé répond 404 : il n'est pas chargé. Capture de démarrage à
390×844, sans connexion joueur ; cela ne valide pas un parcours de scan Android.

## Limites et publication

Les identités OCR/Vision sont SIMULÉES. Les traitements sharp sont réels, mais
sur des rectangles synthétiques, pas des portraits Last War. La description
35.66M / cinq Lv.155 / vingt Lv.40 n'est pas une fixture de reconnaissance.
Ni la fiabilité OCR des différentes langues/tailles non prises en charge, ni
les deux identités historiques Tank ne sont certifiées par ces tests.

Aucun appel Vision, donnée joueur, accès Supabase, écriture cloud, migration,
changement de paiement, push ou déploiement pendant l'intervention.
`demo-lastwar-presentation`, les sources de l'API et les fichiers du diagnostic
isolé sont inchangés. Correctifs laissés locaux pour revue. Toute validation
avec une vraie capture et tout usage facturé restent une étape distincte :
ne pas utiliser un compte réel en Preview comme si ses autosaves étaient isolées.
