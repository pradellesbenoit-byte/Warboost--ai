# WarBoost V2.5.13 — Private Beta Privacy Fix

## Objectif

Fermer le dernier défaut de confidentialité détecté lors de l'audit réel de la V2.5.12 : après déconnexion, les modules étaient verrouillés mais des données locales du compte précédent pouvaient encore rester visibles à l'écran.

## Corrigé

- Masquage de toutes les données privées quand la session n'est pas connectée, quand le compte n'est pas invité ou quand le consentement bêta n'est pas accepté.
- Les données sont **conservées** localement/cloud et réapparaissent après reconnexion du bon compte et consentement.
- Isolation locale par compte WarBoost pour empêcher qu'un deuxième compte sur le même navigateur récupère ou pousse les données du premier.
- Transition d'authentification en mode fermé pendant la revérification de l'allowlist.
- Changement de consentement rerendu immédiatement afin d'appliquer le masque sans rechargement.
- Cache Service Worker renommé V2.5.13 afin d'éviter de servir l'ancienne interface V2.5.12 après déploiement.

## Nettoyage UI

- Saison terminée / entre-saisons correctement résumée sur l'accueil.
- Suppression de l'affichage de clés internes de cycle saisonnier dans le Diagnostic PRO.
- Dimanche VS : lundi Jour 1 est étiqueté comme prochain jour, pas comme jour actuel.

## Non-régression

Tous les contrôles V2.5.12 restent actifs : bêta privée par e-mail, consentement par compte, PRO gratuit pendant bêta, paiement désactivé, 12 API, conservation des données, Escouade 1 prioritaire, Boutique IA prudente, Plan 7 jours, Alliance R5/R4, reset VS UTC−2, cycle Saison et multilingue.

## Base de données

Aucune migration Supabase V2.5.13. Aucun SQL destructif.

## Déploiement

Branche cible : `publisher-demo` seulement. `main` et `warboost.fr` restent inchangés.
