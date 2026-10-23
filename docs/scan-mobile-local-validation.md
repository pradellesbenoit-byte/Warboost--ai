# Scans mobiles — validation locale et recette réelle à venir

## Portée et résultat

Branche de travail : `public-beta-safe-launch`, base
`1358af3f162a406d192f4c938854e5172428056c`.
Aucun appel Supabase, OpenAI, Stripe ou mail ; aucun compte créé ; aucun SQL
ni secret modifié ; aucune publication. Diagnostic externe non réactivé.
Pas de démarrage du Preview normal : il peut encore utiliser la production.

**PASS local, NO-GO pour déclarer le scan réellement validé sur Android.**
Le DOM est simulé ; les listeners et fonctions sont extraits du véritable
`app.js`, sans réécriture de leur logique. Le démarrage complet du navigateur,
ses permissions galerie, son tactile et ses vrais pixels ne sont pas testés.

## Défaut reproduit puis corrigé

Une sélection commence à décoder une capture pour l'escouade 1. Avant la fin,
le joueur choisit l'escouade 2. Le changement incrémente la révision de saisie,
mais le handler du fichier ne vérifiait que la révision de fichier : le décodage
ancien pouvait donc apparaître sous la nouvelle cible.

Le handler vérifie maintenant ensemble la révision de fichier, la révision de
saisie et le propriétaire, après ses attentes et avant ses publications.
Une erreur ancienne ne doit pas remplacer le statut courant non plus.
Les captures **déjà chargées** restent transférables entre cibles avec nouvelle
confirmation explicite de l'escouade, conformément au comportement historique.
Ni sauvegarde, API Vision, clé, classe de héros, ni mise en page modifiée.

Premier essai de régression : **14 PASS / 1 FAIL**, sur le changement de cible
pendant décodage. Après correction et extension : **19 PASS / 0 FAIL**.

## Validations réellement exécutées

Toutes les commandes ont été lancées avec environnement vidé (`env -i`),
clé OpenAI factice uniquement pour les tests qui l'exigent, et préchargement de
`scripts/fixtures/block-external-network.mjs`. Le bloqueur refuse fetch/HTTP/
HTTPS/TCP/TLS réels ; les tests fournisseur injectent leurs réponses en mémoire.
Il n'est pas importé par l'application. Ce n'est pas un conteneur d'isolation OS.

**19 suites npm distinctes réussies, 0 échec final :**

| Suite `test:*` | Preuve locale |
|---|---|
| `scan-handlers-mobile` | 19 tests Node : listeners fichier/cible/analyse/annulation/effacement/retrait individuel ; courses decode/Vision/restauration ; compte changé |
| `squad-scan-targets` | 19 groupes ; 4 cibles ; parsing/revue/confirmation ; stockage simulé ; rollback sur échec local et refus de revue périmée ajoutés pour chaque cible |
| `formation-vision-batch` | 36 groupes + 6 groupes d'arbitrage ; 80 cas capture/zoom ; pixels géométriques synthétiques à 3 tailles |
| `hero-recognition` | 44 scénarios, noms/variantes/références/confidence et formulaire de confirmation |
| `portrait-diagnostics` | 23 contrôles, banque de références et observations simulées |
| `equipment-scan` | 10 groupes, niveaux partiels, vrai zéro, indices clairsemés, conflit sans emprunt au voisin |
| `scan-loss-boundaries` | 11 groupes, recadrages et normalisation |
| `squad-mixed-captures` | 25 groupes, formations/armes et preuves complémentaires |
| `squad-provenance` | 12 groupes, identité explicite et fusion |
| `squad-scan-review` | 21 scénarios, incertitude expliquée et confirmation protégée |
| `squad-scan-evidence` | 11 groupes, preuves et états partiels |
| `squad-restore` | sérialisation, ancienne/nouvelle version cloud simulée, déplacement vers vide restant vide, pas de duplication |
| `hero-slot-integrity` | cinq positions matérialisées ; réparation de doublons sans perte silencieuse |
| `hero-power-sync` | unités, puissance inconnue/0 non inventée, total incomplet à confirmer |
| `exclusive-power-persistence` | puissance et armes exclusives, fusion/rechargement simulés |
| `scan-review` | revue, présentation, markup, Drone, Technologie et sélecteur |
| `technology-center` | états et rendu du centre Technologie |
| `squad-review-status` | 25 groupes, 414 entrées localisées, diagnostic sans écriture |
| `scan-timeouts` | 8 groupes, délais et raffinement optionnel simulés |

Ces groupes et scénarios ont des granularités différentes : ne pas les additionner
comme un nombre unique de parcours réels. Ils couvrent Tank, Avion, Missile,
compositions mixtes, 5 héros × 4 pièces, références ambiguës et valeurs inconnues.
Les tests Technologie couvrent plusieurs captures, un vrai 0 %, Niveau Max
sans inventer 100 %, Verrouillée sans inventer 0 %, fraîcheur et revue éditable.

**6 validations supplémentaires PASS :** `npm run check`, `npm run build`,
`npm run test:web-build`, `npm run build:mobile`, `npm run test:mobile-wrapper`,
`npm run test:safe-launch-i18n`.
Build web : 8 pages / 149 modules. Build web mobile : 7 pages / 144 modules ;
pas un APK ni une validation Play Store. I18n : 23 locales / 22 langues,
pas une relecture humaine.

## Ce qui n'est pas démontré

- Aucune capture originale du joueur chargée ni inspectée. Les descriptions
  « 35.66M, Lv.155, vingt Lv.40 » ne sont pas des pixels exploitables.
- Pas de mesure de précision réelle des portraits Tank, Marshall/Williams ou
  DVA/Kimberly. Aucun héros ni ordre fixe imposé.
- Pas de certitude spécifique sur la lecture réelle de puissance Carlie/Swift.
- Pas de scan réel ni de coût Vision engagé ; modèles et clés normaux inchangés.
- Le stockage et la fusion sont exercés avec les modules réels mais des adaptateurs
  de sauvegarde simulés, pas le parcours complet de l'UI cloud.
- Effacer une **capture** ne supprime pas une escouade confirmée. Le test d'escouade
  volontairement vidée concerne l'opération explicite de déplacement/vidage et
  sa persistance, pas un nouveau bouton de suppression.
- Deux ouvertures successives du sélecteur remplacent la sélection. Pour envoyer
  deux captures ensemble, choisir les deux dans la même sélection multiple ;
  pas de nouvel append automatique.
- Les limites existantes sont 6 captures par formation et 3 pour Technologie.

## Recette Android simple — ne pas démarrer maintenant

### Préconditions obligatoires

Faire préparer puis vérifier une **origine HTTPS navigateur séparée**, liée
exclusivement à WarBoost-Test, avec les endpoints et clés staging validés.
Un chemin différent sur le Preview normal ne suffit pas. Ne pas employer
le compte réel du joueur ; le compte synthétique supprimé lors du banc ne peut
pas servir à se connecter. Toute création de compte de recette, activation
réseau/Vision et dépense demande un accord distinct.

Le PASS réel antérieur du banc Auth/RLS et des quatre escouades REST est acquis,
mais ne prouve pas cet isolement navigateur. Aucun lien sûr de recette Android
nouvellement mis en service par cette intervention.

### Gestes sur téléphone, une fois ces préconditions levées

1. Ouvrir **le lien de test isolé vérifié**, jamais l'URL bêta ou le Preview normal.
   Vérifier l'indication de test et utiliser uniquement le compte de recette autorisé.
2. Dans le scan normal, choisir **Escouade 1**, sélectionner l'original Tank déjà
   disponible dans la galerie. Vérifier la cible et lancer seulement après accord
   de coût. Avant confirmation, comparer les cinq positions, niveaux et quatre
   pièces par ligne ; conserver toute valeur illisible comme inconnue.
3. Essayer d'abord **Annuler**, puis **Effacer la capture de cet appareil** :
   aperçu et sélection disparaissent, aucune escouade confirmée ne disparaît.
   Une nouvelle analyse après annulation serait un nouvel appel potentiellement
   payant : ne pas la lancer sans autorisation.
4. Pour les essais de reconnaissance autorisés, utiliser Avion en escouade 2,
   Missile en escouade 3 ; changer de cible avant confirmation doit invalider
   l'ancienne revue. Pour la cible 4, réutiliser une des trois captures seulement
   si ce test supplémentaire est autorisé. Pas besoin de nouvelles photos.
   Une arme exclusive non visible ne doit pas être devinée ; sa lecture nécessitera
   une capture où elle est effectivement visible, sous accord distinct.
5. Confirmer uniquement après comparaison, puis recharger : vérifier les quatre
   emplacements et l'absence d'écrasement des autres escouades. Une incertitude
   visuelle doit rester explicitement à vérifier, jamais être confirmée par défaut.
6. Choisir Technologie et sélectionner ensemble les captures originales utiles
   (maximum 3 par lot). Vérifier branche par branche le vrai 0 %, Niveau Max,
   Verrouillée et l'absence de pourcentage inventé. Confirmer puis recharger.

En cas de mélange, nom inventé, retour d'une sélection effacée ou ancienne réponse
qui remplace une nouvelle revue : arrêter, ne pas confirmer et décrire le défaut
sans transmettre de données confidentielles. Aucune consigne de relance payante
automatique.

## Checklist de commercialisation : aucun feu vert global

La matrice unique demeure `docs/web-release-gate.md` et `.json`.

| Jalon | État après cette intervention |
|---|---|
| Auth/RLS et quatre escouades REST staging | PASS réel lors de la campagne précédente, comptes nettoyés ; non relancée |
| Sélection/revue/fusion et boutons scan | PASS local simulé, correctif de course intégré localement |
| Tank/Avion/Missile/Technologie sur Android réel | À valider, aucun original reconnu ici |
| IA PRO : exactitude, sécurité, coûts/quotas | À valider ; aucun appel aujourd'hui |
| Alliance R4/R5, invitations/événements | Recette réelle distincte encore nécessaire ; aucune activation ici |
| Service client et langues sur téléphone | Livraison support et relecture humaine à valider |
| Stripe TEST : checkout/webhook/annulation/accès | Recette externe distincte nécessaire, aucun appel aujourd'hui |
| Stripe LIVE / publication | **NON autorisés, bloqués dans la recette** ; pas d'activation |
| Sauvegarde réelle restaurée / juridique / droits Last War | Preuves toujours nécessaires ; ne pas inventer de validation |

**Verdict commercial : NO-GO**, jusqu'aux preuves réelles manquantes.
