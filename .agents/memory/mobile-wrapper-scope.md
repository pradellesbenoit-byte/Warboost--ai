---
name: WarBoost mobile preparation boundaries
description: User constraints for Capacitor preparation and separation of web/store billing.
---

Préparer Android/iOS avec Capacitor sans réécrire le web ni casser la PWA.
L'identifiant proposé est fr.warboost.app, à valider avant soumission.
Ne pas générer de clé de signature release, certificat iOS, provisioning, achat développeur ou soumission.
Pour les APK de test demandés par l'utilisateur, la signature debug automatique et éphémère
du runner est autorisée, mais aucun keystore n'est committé ou livré comme artifact.
Les icônes/splash doivent provenir des assets WarBoost existants, jamais de Last War/FUNFLY.

**Why:** L'utilisateur a limité la préparation stores puis demandé explicitement un APK
debug installable, avec interdiction de générer/committer un keystore release.

**How to apply:** Continuer à travailler uniquement sur public-beta-safe-launch, sans push,
déploiement ni changement de production ; distinguer projets générés, simulations et vrais builds.

La vente mobile doit rester OFF : Stripe réservé au web, aucun checkout/portail web
proposé par le natif tant que StoreKit / Google Play Billing ne sont pas intégrés.

**Why:** L'utilisateur exige une architecture store séparée sans intégration d'achat dans cette passe.

**How to apply:** Préserver les droits PRO des testeurs et l'indépendance des rangs Alliance.
Ne pas confondre suppression du compte et résiliation d'un abonnement externe.

La sortie de publication web doit rester distincte du bundle natif, même si les deux
utilisent les mêmes sources.

**Why:** Le build mobile transforme les pages et désactive les comportements réservés
au web ; l'utiliser comme sortie Vercel risquerait de modifier la bêta/PWA.

**How to apply:** Vérifier les deux builds et garder la synchronisation Capacitor liée
au build natif lors des modifications des commandes de publication.
