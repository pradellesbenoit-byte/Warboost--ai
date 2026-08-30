# WarBoost V2.5.12

## Private Beta Reliability

V2.5.12 transforme la base stable V2.5.11 en **bêta privée gratuite**, sans ouvrir la commercialisation et sans modifier les données joueur existantes.

### Accès bêta

- Badge **BÊTA PRIVÉE** visible dans l’interface.
- Connexion WarBoost obligatoire pour les modules de bêta.
- Liste d’invitation serveur par e-mail via `WARBOOST_BETA_EMAILS`.
- Si la liste est configurée, un compte non invité est bloqué côté interface **et côté API**.
- Tant que `WARBOOST_BETA_EMAILS` n’est pas configuré, la Preview reste volontairement en mode de préparation : les comptes connectés peuvent tester, mais **le lien ne doit pas être partagé avec des bêta-testeurs externes**. `/api/health` indique alors `beta.access_enforced: false`.

Exemple Vercel :

```text
WARBOOST_BETA_EMAILS=testeur1@example.com,testeur2@example.com
```

Les doublons et différences de casse sont neutralisés. Aucun e-mail d’invitation n’est stocké dans le dépôt GitHub.

### PRO pendant la bêta

- **WarBoost PRO est inclus gratuitement** pour les comptes admis à la bêta.
- Le paiement est désactivé dans l’interface et côté serveur.
- Toute tentative de checkout API renvoie `BETA_PAYMENT_DISABLED`.
- Les diagnostics Stripe sont également indisponibles pendant cette bêta.

### Consentement et données

- Consentement bêta explicite avant les lectures/écritures cloud, scans et appels IA qui utilisent les données du compte.
- Consentement enregistré localement **par compte WarBoost**, afin qu’un autre utilisateur du même appareil n’hérite jamais du consentement précédent.
- Consentement révocable depuis la case de l’interface.
- Les mécanismes historiques de sauvegarde, récupération locale/cloud et migration restent actifs : une mise à jour ne doit jamais forcer le joueur à rescanner ou ressaisir ses données.
- **Aucune migration Supabase V2.5.12** n’est nécessaire.

### Retours bêta

Un bouton **Retour bêta** permet au testeur de partager volontairement un bug, une idée, un écran peu clair ou une donnée incorrecte via les applications de son appareil. WarBoost ne joint automatiquement ni pseudo, ni e-mail, ni capture, ni données de compte, ni User-Agent complet. Les diagnostics optionnels sont limités à la version, langue, écran, état d’accès bêta et état du consentement.

### Non-régression conservée

V2.5.12 conserve les fonctions validées auparavant : Escouade 1 principale, Scan/OCR, Diagnostic PRO et Plan Joueur 7 jours sans quantités inventées, Boutique IA Pertinence/Confiance/Disponibilité, Alliance R5/R4, VS avec reset serveur UTC−2, Saison 6 terminée / entre-saisons, 31 héros, 23 choix de langue explicites + Auto, voix par grade et protections cloud.

### Positionnement Last War

WarBoost reste un compagnon indépendant. L’intégration officielle Last War reste **en attente d’autorisation** et aucune fonction ne doit laisser croire à un accès officiel non accordé.
