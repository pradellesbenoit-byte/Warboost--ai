# WarBoost V2.5.14

## Bêta privée — fiabilité Cloud/Auth

V2.5.14 conserve toutes les protections validées en V2.5.13 et corrige le défaut observé sur la Preview : `/api/cloud-config` était correctement configuré, mais la connexion pouvait afficher à tort « Cloud non configuré » lorsque le client Supabase chargé depuis un CDN externe n'était pas disponible.

### Correctif V2.5.14

- Suppression de la dépendance navigateur à `cdn.jsdelivr.net/@supabase/supabase-js` pour l'authentification.
- Client d'authentification WarBoost local au dépôt, basé uniquement sur l'API Supabase Auth HTTPS.
- Compatibilité avec la clé de session Supabase existante `sb-<project-ref>-auth-token` afin de préserver les sessions lorsque c'est possible.
- Distinction claire entre : configuration cloud absente, endpoint de configuration inaccessible, initialisation du client impossible et service d'authentification/réseau inaccessible.
- Les erreurs réseau de connexion, inscription et validation OTP sont interceptées proprement au lieu d'être confondues avec une configuration absente.
- Le client renouvelle le jeton d'accès à partir du refresh token quand nécessaire.
- Le cache Service Worker passe en V2.5.14 et inclut le nouveau module d'authentification local.

### Confidentialité et conservation des données

Les protections V2.5.13 restent inchangées : les données privées sont masquées hors session, pour un compte non invité ou sans consentement. Elles restent conservées et doivent réapparaître après reconnexion du bon compte. Les données d'un compte ne doivent jamais être exposées à un autre compte utilisé sur le même appareil.

Aucune migration Supabase V2.5.14 n'est nécessaire. Aucun reset, `DROP`, `TRUNCATE` ou effacement de données n'est introduit.

### Bêta privée

- Badge BÊTA PRIVÉE.
- Liste d'invitation serveur via `WARBOOST_BETA_EMAILS`.
- PRO inclus gratuitement pour les bêta-testeurs admis.
- Paiements désactivés pendant la bêta.
- Consentement explicite avant cloud, scan et IA.
- Toujours 12 fonctions API pour rester compatible avec le déploiement actuel.

### Non-régression conservée

Escouade 1 principale, Scan/OCR, Diagnostic PRO, Boutique IA prudente, Plan Joueur 7 jours sans quantités inventées, Alliance R5/R4, VS avec reset serveur UTC−2, Saison 6 terminée / entre-saisons, 31 héros, 23 choix de langue explicites + Auto, voix par grade et protections de migration/cloud.

### Positionnement Last War

WarBoost reste un compagnon indépendant. L'intégration officielle Last War reste en attente d'autorisation. Aucune fonction ne doit laisser croire à un accès officiel non accordé ou automatiser le gameplay.

### Déploiement

Cible actuelle : branche `publisher-demo` uniquement. Ne pas modifier `main`, `warboost.fr` ou la Production pendant les tests V2.5.14.
