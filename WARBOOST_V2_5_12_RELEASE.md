# WarBoost V2.5.12 — Private Beta Reliability

## Objectif

Préparer une bêta privée gratuite à partir de la V2.5.11 stable, sans commercialisation active et sans perte de données joueur.

## Ajouté

- Badge BÊTA PRIVÉE et état d’accès bêta dans le compte.
- Liste d’invitation serveur `WARBOOST_BETA_EMAILS`.
- Contrôle d’invitation côté API sur les fonctions qui lisent, écrivent ou analysent les données joueur.
- Consentement explicite avant cloud / scan / IA, enregistré par compte sur l’appareil et révocable.
- WarBoost PRO inclus gratuitement pour les bêta-testeurs admis.
- Paiement et checkout bloqués côté serveur (`BETA_PAYMENT_DISABLED`).
- Bouton de retour bêta utilisant le partage de l’appareil, sans ajout automatique du pseudo, e-mail, capture ou données de compte.
- `/api/beta` pour l’état d’accès et `/api/health` enrichi avec les garde-fous bêta.

## Sécurité / confidentialité

- Les e-mails invités restent dans les variables d’environnement Vercel, jamais dans le dépôt.
- Un autre compte utilisant le même appareil ne récupère pas le consentement du compte précédent.
- Le rapport de retour n’ajoute pas le User-Agent complet.
- Les routes sensibles refusent les comptes non invités lorsque l’allowlist est configurée et refusent les appels sans consentement lorsque celui-ci est requis.
- Aucune migration de schéma ou suppression de données Supabase.

## Important avant partage externe

La bêta n’est réellement privée que lorsque `WARBOOST_BETA_EMAILS` est configuré dans l’environnement Vercel de la Preview utilisée. Vérifier ensuite `/api/health` :

- `version: "2.5.12"`
- `beta.mode: "private"`
- `beta.access_enforced: true`
- `beta.payments_enabled: false`

Tant que `beta.access_enforced` vaut `false`, ne pas partager le lien à des testeurs externes.
