# WarBoost V2.5.13

## Private Beta Privacy Fix

V2.5.13 part de la V2.5.12 validée et renforce la bêta privée **sans supprimer ni réinitialiser les données joueur**.

### Confidentialité bêta

- Les données privées du joueur (identité Last War, QG, puissance, Drone, escouades, Alliance, roster, VS, Saison et Diagnostic PRO) restent enregistrées mais sont **masquées** tant que les trois conditions ne sont pas réunies :
  1. session WarBoost connectée ;
  2. compte autorisé par la bêta privée ;
  3. consentement bêta accepté pour ce compte.
- Une déconnexion ne supprime aucune donnée : elle ferme seulement l'affichage privé.
- Le consentement reste enregistré par compte WarBoost sur l'appareil.
- Les états locaux sont isolés par compte : les données d'un ancien utilisateur du même navigateur ne peuvent pas être adoptées par un autre compte.
- Les anciennes données locales non encore rattachées à un compte restent migrables au premier compte légitime, afin de préserver la compatibilité des versions antérieures.

### Corrections d'interface

- Accueil Saison : une Saison 6 terminée affiche désormais **Saison 6 terminée / Entre-saisons** au lieu de laisser croire que la saison est active.
- Diagnostic PRO : les clés internes comme `season_phase_interseason` ne sont plus affichées au joueur.
- VS le dimanche : lundi Jour 1 est présenté comme le **prochain** jour de score, pas comme le jour courant.

### Bêta privée conservée

- `WARBOOST_BETA_EMAILS` reste la liste d'autorisation serveur.
- WarBoost PRO reste inclus gratuitement pour les bêta-testeurs admis.
- Paiement / checkout restent désactivés pendant la bêta.
- Consentement obligatoire avant cloud, scan et IA utilisant les données du compte.
- Retour bêta sans ajout automatique du pseudo, de l'e-mail, des captures ou des données du compte.
- Exactement **12 fonctions API** : compatible avec la limite Vercel Hobby utilisée par cette Preview.

### Fonctions validées conservées

Escouade 1 principale, 4 escouades, Drone, armes exclusives, Scan/OCR, Diagnostic PRO, Boutique IA, Plan Joueur 7 jours sans quantités inventées, Alliance R5/R4 et roster prudent, VS avec reset serveur UTC−2, cycle Saison active/terminée/entre-saisons/inconnue, 31 héros, 23 langues explicites + Auto, voix par grade et protections cloud.

### Données / Supabase

**Aucune migration Supabase V2.5.13 n'est nécessaire.**

Ne pas relancer `schema.sql`, ne pas vider les tables et ne pas effacer le stockage local pour installer cette version.

### Déploiement

Cible : branche GitHub **`publisher-demo` uniquement**. Ne pas modifier `main` ni `warboost.fr`.

Après déploiement de la Preview, vérifier `/api/health` :

- `version: "2.5.13"`
- `beta.mode: "private"`
- `beta.access_enforced: true`
- `beta.payments_enabled: false`
- `serverless_functions: 12`
- `safeguards.signed_out_private_data_masked: true`
- `safeguards.invited_without_consent_private_data_masked: true`
- `safeguards.private_state_preserved_not_deleted: true`
- `safeguards.cross_account_local_state_isolated: true`

### Positionnement Last War

WarBoost reste un compagnon indépendant. L'intégration officielle Last War reste **en attente d'autorisation**. Aucune fonction ne doit laisser croire qu'un accès officiel a été obtenu.
