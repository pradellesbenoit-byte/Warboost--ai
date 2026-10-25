# Correctif ciblé : localisation FREE et espaces

Branche : `warboost-free-access-review-20261025`.
Base distante vérifiée avant intervention : `330fa64056abfc85c6c6cc7db0752cd3c769d8d8`.

## Cause et changements

La notice était traduite, mais `freeAccessCopy` ne contenait que FR/EN. Les 20
autres langues obtenaient les boutons, instructions et erreurs anglais.
Le sous-titre `tagline` utilisait encore les anciennes tables de traduction.

- Les 26 entrées du parcours FREE/espace disposent maintenant d'une traduction
  dans chacune des 22 langues. Les notices existantes fournissent les statuts et
  avertissements communs ; les autres libellés ont leur propre traduction.
- Variantes `en-GB`/`en-US` et codes régionaux normalisés ; repli anglais uniquement
  pour une langue non prise en charge, pas pour les 22 langues disponibles.
- Rendu centralisé des boutons, instructions, consentement et champs facultatifs.
  Les erreurs déjà affichées sont conservées sous clé et variables, puis retraduites
  immédiatement au changement de langue ; ni pseudos ni saisies ne sont traduits.
- Le sous-titre, le badge et le pied de page indiquent l'accès libre sans code.
  Le texte de sécurité maintenant localisé conserve expressément la désactivation
  de l'accès externe au jeu Last War.
- Aucun changement aux rôles, autorisations, quotas, droits PRO, stockage, SQL,
  données des comptes ou configurations de déploiement.

## Vérifications

Environnement vidé, valeurs synthétiques `.invalid`, bloqueur réseau Node chargé.

- `node --require ./scripts/release/no-network.cjs --test scripts/workspace-mobile-feedback.test.mjs scripts/free-access.test.mjs scripts/free-workspace.test.mjs`
  : **104 PASS, 0 FAIL, 0 ignoré**.
- Couverture des 26 clés dans 22 langues, résolution effective des clés d'en-tête,
  consentement et sécurité, absence de repli anglais pour une locale prise en charge.
- Véritable handler `applyLanguage` dans un DOM simulé : FR → ES → FR → AR → ES,
  choix manuel conservé, direction RTL, boutons, notices, erreur déjà affichée et
  statuts/décisions mis à jour, saisie `Player I ; R3.` intacte et aucun grade accordé.
- `npm run check`, syntaxe du nouveau module, `git diff --check` : PASS.
- `npm run build:web` : PASS, 8 pages et 155 modules navigateur.

Les tests n'établissent pas un rendu Android réel ni une validation linguistique
par des locuteurs natifs. Aucune requête Supabase, Vision, Stripe ou autre API
applicative ; aucun serveur, compte, migration ou déploiement. Seule la branche de
revue est destinée au push ; `main`, la démo et la configuration Vercel restent intacts.
