# Rattachement des scans aux quatre escouades

## Correction locale

- Le sélecteur expose Escouade 1, 2, 3 et 4, avec les traductions existantes.
- La normalisation ne transforme plus `squad2`, `squad3` ou `squad4` en `squad1`.
- La revue des armes, les noms des slots et l'association explicite utilisent
  l'index de l'escouade choisie, pas systématiquement l'index 0.
- Le parcours secondaire de confirmation des cinq noms conserve aussi cette cible.
- La liste des fichiers, l'aperçu, le titre de revue, ses métadonnées et le bouton
  de confirmation affichent la cible.
- Le joueur confirme que les captures concernent cette escouade. Un numéro absent
  de l'image n'est jamais présenté comme une détection OCR.
- Changer entre deux escouades conserve les images, annule l'ancienne revue et
  invalide les réponses en cours. Il faut confirmer la nouvelle cible et relancer
  l'analyse, pour utiliser le bon contexte et les bonnes confirmations.

Un lot garde une seule cible : une formation et jusqu'à cinq armes complémentaires
de cette formation. Pour une autre escouade, effectuer une analyse distincte.
Les historiques « Formation actuelle » déjà stockés dans l'escouade 1 restent
à cet emplacement ; aucune migration ne redistribue leurs données.

Les contrôles d'accès bêta/authentification existants restent inchangés.
Le code actuel n'avait pas de restriction supplémentaire propre à l'escouade 4 ;
elle reste une escouade optionnelle, sans nouveau droit PRO.

## Vérifications automatisées

Tous les contrôles finaux ci-dessous passent :

- `npm run test:squad-scan-targets` : 15 contrôles. Les quatre cibles sont testées
  séparément, ainsi que les scans successifs, modifications, relecture du stockage
  isolé, anciennes données, hints d'identité, armes et réponses obsolètes.
- `node --test scripts/verify-scan-type-selector.mjs` : 2 tests ; libellés vérifiés
  dans les 23 variantes de langue proposées.
- `npm run test:player-scan-diagnostic`.
- `npm run test:squad-mixed-captures` : 25 contrôles.
- `node scripts/verify-formation-vision-batch.mjs` : 29 contrôles.
- `npm run test:scan-loss-boundaries` : 11 contrôles.
- `npm run test:hero-recognition` : 44 scénarios.
- `npm run test:equipment-scan` : 10 contrôles.
- `npm run test:squad-provenance` : 12 scénarios.
- `npm run test:squad-restore`.
- `npm run test:squad-scan-review` : 21 scénarios.
- `npm run test:scan-review`.
- `npm run test:hero-slot-integrity`.
- `npm run test:scan-timeouts` : 8 contrôles.
- `npm run check`, `npm run build`, `npm run test:web-build`,
  `npm run build:mobile`, `git diff --check`.

Un premier passage de l'ancien test VM de revue échouait car son environnement
isolé ne fournissait pas le nouveau contrôle de cible. Le test charge maintenant
le contrôle réel, avec une cible confirmée dans son DOM simulé, et passe.

## Limites

Ces tests utilisent des observations OCR simulées, les modules réels et un DOM/
stockage isolés. Aucun compte réel ni écriture Supabase ne sert à ces validations.
Les quatre tests du handler de confirmation isolent notamment le writer et la
fusion générale du profil ; les contrôles de provenance/restauration complètent
la vérification de la fusion existante.

Le moteur Vision, les recadrages et les seuils n'ont pas été changés dans cette
passe. Les deux conflits Tank documentés dans `hero-references/scan-repair-validation.md`
ne sont donc pas annoncés comme résolus.
Le build mobile vérifie les assets web mobiles, pas un APK/AAB ou une archive iOS.

## Contrôle navigateur mobile

Le Preview répond et les handlers réels ont été exercés à 360 et 430 px :
quatre choix distincts, libellé de cible correspondant, deux PNG synthétiques
acceptés (2/6), conservation des deux fichiers lors du passage de l'escouade 2
à la 3 et remise à zéro de l'accord. Analyse sans accord affiche l'avertissement ;
zéro requête `/api/scan` observée.

Sans connexion, le panneau reste hors écran et le déclencheur ouvre le compte.
Les mesures DOM ne montrent pas de débordement horizontal, mais ne prouvent pas
le rendu visuel du panneau ouvert. Aperçu image, revue visible et confirmation
sur un téléphone connecté restent donc à vérifier. Aucun scan Vision réel,
compte créé ou enregistrement joueur n'a été effectué par ce contrôle navigateur.
