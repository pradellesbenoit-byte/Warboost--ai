# Chargements WarBoost — inventaire et validation

Cette passe est une modification de présentation et de feedback. Elle ne change
ni les requêtes métier, ni les délais, ni les autorisations, ni les données.

## Emplacements et durée réelle

| Opération | Emplacement du W | Fin de l’attente |
| --- | --- | --- |
| Préparation des fichiers joueur, compression, stockage temporaire | Statut WarBoost Scan | Préparation terminée, erreur ou sélection devenue obsolète |
| Scan joueur, formation, technologie, captures multiples | Statut WarBoost Scan | Fin de tout le lot, erreur, annulation de la revue ou timeout |
| Scan roster multi-captures | Statut du scan roster | Fin du lot, erreur ou réponse devenue obsolète |
| Validation/import roster OCR ou texte | Bouton d’import activé par le joueur | Réponse canonique traitée ou échec ; bouton réactivé |
| Diagnostic/conseils joueur, alliance, VS et saison | Bouton/contenu de conseils correspondant | Fin de la requête, refus, erreur ou timeout |
| Actualisation des connaissances | Bouton d’actualisation | Fin de la requête |
| Recherche du plan d’un événement | Bouton Recalculer le plan | Fin de la recherche bornée |
| Synchronisation manuelle | Boutons de synchronisation existants | Réponse analysée ou erreur |
| Sauvegarde cloud du profil et restauration via `/api/state` | Indicateur de synchronisation existant | Réponse analysée ou erreur, y compris lecture du JSON |
| Import des participations | Bouton Importer pendant la sauvegarde cloud | Fin de la sauvegarde ; le parsing local instantané n’est pas animé |
| Connexion, inscription, vérification email, renvoi du code, mot de passe oublié | Message du formulaire de connexion | Sortie du `finally` du parcours existant |
| Support, invitations, gestion de grade et contrôles d’accès cloud | Bouton/statut existant, sinon indicateur de synchronisation | Réponse, refus ou timeout du transport existant |

Les opérations purement locales et immédiates (navigation, filtres, calculs
synchrones, parsing de texte) n’affichent pas un faux chargement. Les sauvegardes
`keepalive` lors de la fermeture ne créent pas d’affichage hors écran. L’écran
initial avec les personnages n’est pas remplacé ni modifié.

Le W est décoratif, non interactif, intégré via le même attribut aux éléments
existants. Les messages restent ceux des handlers, sans faux pourcentage ni temps
estimé. `aria-busy` et `aria-live` sont restaurés après l’opération. Les attentes
imbriquées partagent le même emplacement ; une ancienne fin ne masque pas une
nouvelle attente. Le mouvement réduit arrête la rotation. Aucun badge flottant
n’est créé.

## Import Alliance : ce qui constitue un succès

- Le verrou existant `rosterImportInFlight` reste actif ; double soumission refusée.
- Le bouton est désactivé immédiatement, avec « Mise à jour de l’alliance en cours… ».
- HTTP 200 sans preuve de persistance canonique reste un résultat non confirmé.
- « Alliance mise à jour » exige la confirmation existante et aucune modification
  locale concurrente restée en attente.
- Refus, conflit 409, réponse ambiguë et timeout conservent les données locales et
  l’état en attente ; le message safe inclut le code expurgé et l’action conseillée.
- Aucune retentative automatique supplémentaire, aucun contournement de rôle ou de
  version, aucune écriture du profil personnel ajoutée au patch roster.

## Tests effectués

- `test:analysis-indicator` : concurrence, lot imbriqué, fin obsolète, succès/refus/
  409/timeout/annulation, boutons, lecture du JSON, 276 vérifications de messages
  localisés (23 variantes de locale pour 22 langues).
- `test:roster-sync-feedback` : 25 groupes, dont le handler d’import réel avec
  transports contrôlés ; puis 14 groupes roster-only/auth/version/persistance.
- `test:scan-timeouts` : 8 cas ; aucun changement de délai.
- Tests de revue, mixed captures, provenance, cibles des quatre escouades,
  autorisations Alliance, anti-rollback roster, isolation auth mobile, i18n et
  recherche de plans : réussis.
- `npm run check`, build web, test du build web, build des assets mobiles et test du
  wrapper : réussis.
- Navigateur : composant réel et CSS réels avec DOM/transports synthétiques à
  360/390/430 px ; attente, double clic, activation clavier, fin succès/refus/409/
  timeout/annulation, français long, arabe RTL et mouvement réduit réussis.
  Aucun débordement horizontal ni badge de chargement flottant. Le démarrage réel
  non connecté quitte l’écran initial sans erreur JavaScript. Ce test n’est pas
  une validation du parcours R4 authentifié, ni un test sur téléphone physique.

Les fixtures et transports sont synthétiques. Aucun vrai appel Vision payant,
aucune écriture de roster/profil dans Supabase, aucune connexion à un vrai compte
R4/R5 n’a été effectuée. Le build mobile est celui des assets web embarqués,
pas une compilation APK/AAB ni une archive iOS. Les tests de téléphone physique
et du roster authentifié réel restent à faire par le propriétaire.
