# Import roster : corrections et validation locale

## Périmètre

Branche `public-beta-safe-launch`. Aucun push, déploiement, migration ou appel
authentifié d'écriture vers Supabase pour cette validation. Aucun fichier de
`demo-lastwar-presentation`, aucune capture privée ni donnée réelle ajoutés.

## Corrections

- Le bandeau lit l'erreur sûre effectivement enregistrée dans l'état courant,
  jamais le `null` initial du candidat ni un message fournisseur brut.
- Messages de session, consentement, bêta, droits R4/R5, conflit de version,
  réseau, délai, cloud et format ; conservation locale et action conseillée.
  Si le stockage local échoue, ne pas annoncer une sauvegarde sur l'appareil.
- Le diagnostic dépliable et copiable est limité à cinq événements en mémoire :
  statut HTTP, code reconnu, code technique Supabase formaté, état d'écriture
  et autorisation booléenne. Aucun token, en-tête, URL fournisseur, message SQL,
  réponse complète, pseudo ou profil. Aucune transmission automatique.
- HTTP 200 ne suffit pas : le client vérifie l'accusé de sauvegarde canonique et
  l'état retourné. Une ancienne API reste compatible si elle retourne explicitement
  un roster synchronisé depuis la source canonique.
- Le serveur distingue une écriture canonique attestée d'une finalisation échouée.
  Un échec de snapshot après écriture du roster n'est pas présenté comme un rollback.
  Une relecture échouée après écriture ne retourne plus l'ancien roster comme
  résultat synchronisé ; elle laisse la finalisation en attente.
  Le corps de réponse original reste consultable dans l'onglet Réseau du navigateur ;
  le diagnostic copiable est volontairement une projection sans données personnelles.
- Double clic bloqué ; date d'un snapshot complet en attente conservée lors d'une
  retentative ; version du roster cloud envoyée aussi par la synchronisation globale.
  Un changement canonique détecté donne un conflit avant les écritures.
  Les anciens clients conservent les vérifications d'autorisation et CAS existantes.
  Pas de nouvelle boucle de renvoi automatique de l'import.
- Une version locale modifiée pendant la requête reste en attente même si le
  serveur a confirmé la version envoyée. Pas de faux « synchronisé » global.
- L'absence de confiance OCR reste `null` à travers les fusions successives.
  `0 %` nécessite une valeur réellement présente et correctement parsée.
  Confiance non renseignée : invitation à vérifier les valeurs et le pseudo.
  Aucune hypothèse sur le pseudo signalé, aucune correction automatique.
- Les dictionnaires des 22 langues, les autres scans et le W ne sont pas modifiés.
  Les nouveaux messages roster possèdent leur propre copie dans les 22 langues.
  Cache PWA actualisé uniquement pour les assets ; stockage/session non effacés.

## Tests réalisés

- `npm run test:roster-sync-feedback` : **21 groupes réussis**.
  Exécution des fonctions réelles du client et du handler serveur ; normalisation,
  autorisation et lifecycle roster réels, transports DB et authentification
  contrôlés. Fixtures textuelles synthétiques, pas de vraies captures OCR.
- **21 suites de régression réussies** : squad-scan-review, squad-scan-targets,
  analysis-indicator, portrait-diagnostics, squad-scan-evidence,
  squad-mixed-captures, equipment-scan, account-deletion, beta-activation,
  rank-safety, alliance-authorization, roster-diagnostic,
  rank-canonical-resolution, roster-rank-persistence, roster-anti-rollback,
  rank-provenance, scan-review (inclut Drone/Technologie), technology-center,
  shared-alliance-roster, canonical-roster-count, fresh-launch.
- `npm run check`, build web, test web build, build des assets mobiles et test
  mobile-wrapper réussis. Ce n'est pas une compilation APK/AAB ou archive iOS.
- Contrôle de diff sans erreurs d'espaces.
- Preview redémarré ; requête HTTP réelle sans session à `/api/sync` :
  **401 / AUTH_REQUIRED**, sans écriture ni contournement. Les essais authentifiés
  décrits plus haut restent des transports contrôlés, pas une connexion Supabase réelle.

Le premier test d'absence d'écriture pour un R3 était trop large : un R3 peut déjà
publier sa propre disponibilité. Le test a été corrigé pour préserver ce droit
existant tout en prouvant que le roster demandé n'est pas importé et que les
grades/puissances ne sont pas modifiés. Aucun contournement ajouté.

## Diagnostic réel restant

La réponse de la tentative utilisateur originale n'est pas disponible. Aucune
cause auth/RLS/permissions/réseau n'est donc déclarée certaine. La latence réelle
de `/api/sync` n'a pas été mesurée avec une session R4/R5 ; son délai client
existant de 20 secondes reste inchangé, ainsi que les délais Scan/Vision.

Pour la prochaine tentative autorisée :

1. Utiliser le Preview local actualisé avec le compte légitime ; vérifier le
   pseudo, le grade, le QG et la puissance avant confirmation.
2. En cas d'échec, ouvrir le diagnostic privé sous le bandeau et copier les codes
   expurgés. Conserver le résultat et ne pas répéter immédiatement l'import.
3. Au besoin, relever dans Réseau le statut et les champs `error`,
   `roster_confirmation`, `upstream_code` de `/api/sync`. Ne pas partager le corps
   complet `state`, l'en-tête Authorization, les cookies ou les captures.
4. Un timeout ne prouve pas l'arrêt du serveur. Relire profil et roster cloud,
   vérifier ce qui a réellement été enregistré, puis refaire une revue explicite
   avant toute retentative. Ne pas corriger le problème en élargissant les droits.

Les tests de téléphone authentifié, de synchronisation Supabase réelle et de
concurrence de deux responsables réels restent à effectuer sur une alliance de
test isolée, pas sur le roster de production.
