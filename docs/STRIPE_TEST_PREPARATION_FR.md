# Stripe TEST uniquement — préparation WarBoost

## Limites
Branche : public-beta-safe-launch. Aucun push/déploiement automatique. Ne jamais modifier demo-lastwar-presentation.
Le code refuse LIVE, les clés live et les événements livemode=true. Aucun secret n'est envoyé au navigateur.
Le mode par défaut reste OFF : les modifications ne configurent aucun secret, aucune variable ni aucun compte Stripe.

## Migrations — application MANUELLE seulement
Utiliser une base Supabase TEST isolée, pas la base de production. Sauvegarder/auditer les lignes historiques.
1. Migration existante du registre `wb1_beta_invites`, si absente.
2. `supabase/migration_v2_5_28_hf8_commercial_readiness.sql`.
3. `supabase/migration_v2_5_32_stripe_test_01.sql`.
4. `supabase/migration_v2_5_32_stripe_test_02_beta_cohort.sql`.

La première nouvelle migration fixe la date de gel de cohorte à sa première application. La seconde inscrit les comptes existants avec une invitation valide émise avant ce gel. Ne pas appliquer en production dans cette phase.
Les anciens comptes autorisés par configuration legacy/support peuvent obtenir leur droit persistant à leur prochaine vérification serveur : seul le serveur service_role peut attester cette source, et le compte doit précéder le gel. Vérifier cette cohorte avant d'activer TEST ; toute extension ultérieure de l'ancienne allowlist doit être auditée.
Un compte créé après le gel ne reçoit pas automatiquement un droit bêta. Une attribution exceptionnelle se fait explicitement dans le registre serveur.
Réexécuter les migrations ne réactive pas un grant révoqué et ne redéfinit pas la date de gel.
Les statuts/identifiants Stripe historiques non vérifiés ne sont pas convertis en abonnements test : réconciliation manuelle nécessaire.
L'absence des migrations préserve la bêta actuelle en OFF (raison beta_migration_pending), mais bloque TEST. Aucun démarrage ne lance une migration.

## Dashboard Stripe TEST — à faire manuellement
- Sélectionner le mode TEST / sandbox Stripe ; ne fournir/configurer aucune clé live.
- Créer un produit WarBoost PRO actif et son prix récurrent : EUR, 499 centimes, tous les 1 mois, prix fixe per_unit/licensed.
- Configurer le portail TEST : résiliation en fin de période, reprise avant échéance, modification du moyen de paiement, affichage des factures test. Ne pas autoriser de changement vers un prix non prévu.
- Configurer une destination TEST HTTPS `/api/pro?action=webhook` sur le bon environnement bêta.
- Événements : checkout.session.completed, checkout.session.async_payment_succeeded, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_succeeded, invoice.payment_failed.
- API requêtes épinglée : 2025-02-24.acacia ; choisir si possible cette version pour l'endpoint. Le lecteur accepte aussi l'échéance portée par l'item d'abonnement.
- Remboursements/litiges ne révoquent pas arbitrairement PRO : politique et traitement à compléter avant LIVE.

Dans le gestionnaire sécurisé de l'hébergement TEST, configurer manuellement les noms suivants (jamais les valeurs dans le chat ou le dépôt) :
- STRIPE_SECRET_KEY : clé TEST uniquement ; STRIPE_WEBHOOK_SECRET : secret du webhook TEST.
- STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRODUCT_PRO : références non secrètes du produit/prix TEST.
- WARBOOST_COMMERCIAL_MODE=test.
- WARBOOST_APP_URL : URL HTTPS permanente du domaine bêta, sans query/fragment/identifiants. Domaine demo refusé.
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY : base TEST correspondante.
Les conditions légales complètes ne sont pas requises pour les simulations TEST, mais LIVE est indisponible même si tous les champs sont renseignés.

## Politique serveur
- BETA_FREE : grant bêta actif, prioritaire, sans abonnement nécessaire.
- PRO_PAID : abonnement TEST active/trialing, prix/produit attendus, échéance valide et future.
- FREE : pas de droit ; past_due/unpaid/canceled/incomplete/incomplete_expired/paused ou échéance invalide/passée n'ouvrent pas PRO.
- cancel_at_period_end ne retire pas PRO avant l'échéance si le statut reste actif ; suppression/canceled retire le droit Stripe.
- Le compte personnel/cloud est accessible avec authentification et consentement. Les API scan/advice exigent un droit PRO serveur.
- Les invitations, associations, rôles R4/R5 et contrôles d'alliance ne sont pas remplacés par Stripe.
- Retour Checkout : message seulement, aucune mutation de droits. Recharger le statut serveur après livraison du webhook.
- Pas de grace period past_due. Le portail reste utilisable pour rétablir le paiement test.

## Tests automatisés vs tests Stripe réels
`npm run test:billing` utilise un PostgreSQL WASM isolé et des réponses Stripe simulées, sans accès réseau à Stripe/Supabase.
Il exécute les migrations réelles et leurs RPC, les contrôles serveur, la concurrence, les webhooks et les transitions d'abonnement.
Ce PASS ne prouve pas l'acceptation d'une carte ni 3DS chez Stripe.

À exécuter MANUELLEMENT après configuration TEST (consigner résultat et identifiants de test sans secret) :
1. Carte Stripe test acceptée, carte refusée, carte nécessitant 3DS (réussi puis annulé).
2. Deux onglets/double clic : même session ou réponse préparation en cours ; un seul abonnement.
3. Retour succès sans webhook : FREE ; livraison valide ensuite : PRO TEST.
4. Répéter/réordonner les événements ; indisponibilité DB puis nouvelle livraison.
5. Renouvellement test réussi puis échoué ; reprise après régularisation.
6. Portail : moyen de paiement, résiliation fin de période, reprise, échéance atteinte, suppression.
7. Deux comptes isolés ; ancien bêta gratuit ; nouveau compte sans code bêta ; FREE refusé par scan/advice.
8. Vérifier console/réseau navigateur sans secret, URLs de retour, statut après rechargement.
Utiliser exclusivement les moyens de paiement documentés par Stripe pour TEST ; aucune vraie carte ni paiement live.

## Avant LIVE — non prêt
Tous les champs de la section À COMPLÉTER de legal.html ; notamment vendeur/adresse/immatriculation, support/hébergeur, CGV/preuve d'acceptation, renouvellement/résiliation/rétractation/remboursement/litiges, TVA/HT/TTC/factures, médiation, privacy/conservation.
Les attributs legal_ready indiquent la présence de configuration, pas une validation juridique.
Rapprochement des factures, surveillance/alertes webhook, gestion refunds/disputes, réconciliation périodique et tests live contrôlés devront faire l'objet d'une phase séparée expressément autorisée.