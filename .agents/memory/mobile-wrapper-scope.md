---
name: WarBoost mobile preparation boundaries
description: User constraints for Capacitor preparation and separation of web/store billing.
---

Préparer Android/iOS avec Capacitor sans réécrire le web ni casser la PWA.
L'identifiant proposé est fr.warboost.app, à valider avant soumission.
Ne pas générer de clé de signature, certificat, provisioning, achat développeur ou soumission.
Les icônes/splash doivent provenir des assets WarBoost existants, jamais de Last War/FUNFLY.

**Why:** L'utilisateur a explicitement limité la demande à la préparation des stores.

**How to apply:** Continuer à travailler uniquement sur public-beta-safe-launch, sans push,
déploiement ni changement de production ; distinguer projets générés, simulations et vrais builds.

La vente mobile doit rester OFF : Stripe réservé au web, aucun checkout/portail web
proposé par le natif tant que StoreKit / Google Play Billing ne sont pas intégrés.

**Why:** L'utilisateur exige une architecture store séparée sans intégration d'achat dans cette passe.

**How to apply:** Préserver les droits PRO des testeurs et l'indépendance des rangs Alliance.
Ne pas confondre suppression du compte et résiliation d'un abonnement externe.
