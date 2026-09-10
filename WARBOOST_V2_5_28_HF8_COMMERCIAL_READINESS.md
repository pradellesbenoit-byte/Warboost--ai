# WarBoost V2.5.28 HF8 — Commercial Readiness

Date : 2026-09-10  
Base exacte : `WarBoost_V2.5.28_HF7_SERVER_ALLIANCE_INVITE_GATE_FULL.zip`  
SHA-256 base HF7 : `dd4894999d2e01a51fd0a91cc70901433e0f9acb8b1187c3e2852ceaad4a9827`

## Objectif
HF8 prépare WarBoost à devenir un produit commercial sans transformer la bêta actuelle en version payante. La bêta publique sur invitation reste le mode par défaut : **PRO inclus pour les testeurs invités et aucun paiement possible**.

L'objectif commercial préparé est **WarBoost PRO à 4,99 € / mois**, avec droits d'abonnement contrôlés côté serveur. Le prix de l'offre Alliance R5/R4 n'est volontairement pas fixé dans HF8 : il devra être décidé après mesure de l'usage réel par les alliances.

## Paiement : verrouillage avant mise en ligne
Le code de préparation commerciale est côté serveur. Un paiement ne peut être initié que si toutes les conditions suivantes sont vraies :
- `WARBOOST_COMMERCIAL_MODE=live` ;
- domaine WarBoost HTTPS stable ; les domaines temporaires `*.vercel.app` sont refusés pour l'activation commerciale ;
- identité légale vendeur et adresse support configurées ;
- URL des conditions et URL de confidentialité sur domaine stable ;
- configuration du prestataire de paiement complète ;
- base Supabase commerciale prête.

Même avec ces variables, WarBoost contrôle le prix configuré chez le prestataire avant d'ouvrir le checkout : **499 centimes, EUR, récurrence mensuelle, prix actif**. En cas d'écart, l'achat échoue en mode sécurisé.

## Abonnements et données de paiement
- Les droits PRO sont calculés côté serveur depuis l'état d'abonnement.
- Le client ne peut pas s'attribuer lui-même un abonnement PRO.
- Le portail de gestion d'abonnement est prévu côté serveur.
- Les webhooks utilisent une signature HMAC horodatée avec comparaison en temps constant.
- La table `warboost_billing_events` sert de registre d'idempotence pour éviter de retraiter le même événement.
- WarBoost ne stocke pas les numéros de carte bancaire.

## Supabase HF8
Migration : `supabase/migration_v2_5_28_hf8_commercial_readiness.sql`.

La migration est additive/idempotente. Elle :
- conserve/complète `warboost_subscriptions` ;
- crée le registre privé `warboost_billing_events` s'il manque ;
- active RLS ;
- réserve les mutations d'abonnement au rôle serveur ;
- ne contient aucun `DROP TABLE`, `TRUNCATE` ou `DELETE FROM`.

**Pendant la bêta HF8, cette migration n'est pas nécessaire pour que les testeurs continuent à utiliser PRO gratuitement. Elle devient obligatoire avant tout test de paiement live.** Les anciennes lignes d'abonnement éventuellement présentes doivent être auditées avant le passage commercial ; HF8 ne les efface ni ne les réinterprète automatiquement.

## Safe Launch et Last War inchangés
- Bêta publique sur invitation.
- PRO inclus gratuitement pour les testeurs autorisés.
- Paiements désactivés par défaut.
- Aucun accès/API Last War non autorisé.
- Aucun scraping.
- Aucune automatisation de gameplay.
- Les données Last War proviennent uniquement des informations fournies/confirmées par les joueurs et des sources autorisées/publiques utilisées comme contexte.

## Fonctionnalités préservées
HF8 conserve les garanties validées en HF7 :
- Diagnostic PRO personnalisé au joueur, TOP 3 principal et comparaison détaillée des héros ;
- Scan avec identité héros/équipements protégée ;
- Boutique IA alignée avec le Diagnostic et prudence sur les offres payantes ;
- Drone, VS et Saison ;
- Alliance R5/R4, suivi des événements et historique ;
- isolation exacte par pseudo Last War + serveur + alliance ;
- invitations Alliance R5/R4 avec refus des outsiders ;
- service client, mot de passe oublié et invitations bêta ;
- 23 langues explicites + Auto ;
- 12 fonctions Vercel serverless.

## Important
HF8 est une **version de préparation commerciale**, pas l'autorisation d'encaisser immédiatement. Le passage à la vente nécessite encore un domaine permanent, une configuration légale/fiscale adaptée, la configuration du prestataire de paiement, la migration HF8, un test de paiement réel en environnement contrôlé, puis un smoke test complet avant ouverture commerciale.
