# WarBoost — préparation Capacitor / stores

## Périmètre et architecture

Branche `public-beta-safe-launch` uniquement. Aucun push, déploiement, migration réelle,
soumission, achat de compte, certificat ou clé de signature dans cette passe.

- Application : **WarBoost** ; Android applicationId / iOS bundle ID **fr.warboost.app**.
  Identifiant proposé conformément au domaine, **À VALIDER** (propriété du domaine,
  disponibilité et comptes développeurs) avant première soumission.
- Capacitor 8, Android + iOS, sans réécriture. `app.js` et ses modules restent la source
  de vérité. `npm run build` produit `mobile-dist` depuis les fichiers publics existants.
  Aucun serveur, SQL, secret, fichier Git ou module serveur Supabase dans le bundle.
- **Assets embarqués**, pas de `server.url`, pas de navigation distante dans la WebView.
  API WarBoost exclusivement `https://beta.warboost.fr/api/*` ; Auth/REST uniquement le
  projet HTTPS Supabase fourni par cette API, domaine `.supabase.co` / `.supabase.in`.
  Les redirections HTTP sont refusées. Les autres requêtes distantes sont bloquées.
  Sur iOS, un transport URLSession éphémère spécifique refuse les redirections avant
  toute seconde requête ; le contrôle JS après réponse seul ne suffit pas à protéger un token.
  Le transport Capacitor HTTP natif contourne seulement les contraintes CORS de l'origine
  locale : authentification et autorisation restent vérifiées par le serveur existant.
- Les liens externes HTTPS sont ouverts hors WebView ; schémas dangereux, Stripe et
  domaines Last War/FUNFLY ciblés sont refusés. Aucun accès à une API du jeu.
- PWA : manifeste inchangé ; cache du service worker versionné et nouveaux modules/pages
  publiques précachés pour ne pas casser les imports hors ligne. Le service worker n'est pas enregistré
  en natif : le contenu embarqué ne doit pas être remplacé par un cache web obsolète.
  Les versions web futures et les binaires devront donc être compatibles avec l'API bêta.
- Portrait demandé ; thème sombre / texte clair. iOS cible iPhone (compatibilité iPad
  non certifiée). Android 16 peut ignorer les contraintes d'orientation sur grands écrans :
  vérifier ce comportement sur appareil, ne pas promettre une rotation bloquée universelle.

## Session, reprise, captures et réseau

- Tokens uniquement dans **Keychain iOS**, accessibilité AfterFirstUnlockThisDeviceOnly,
  ou **AES-GCM avec clé Android Keystore** et ciphertext dans le stockage privé de l'app.
  Aucun mot de passe persistant. Pas de migration de tokens depuis localStorage.
  Les écritures natives sont attendues avant de confirmer une connexion ; aucune
  bascule silencieuse vers localStorage si le coffre échoue. La clé Android de chiffrement
  de session est générée sur l'appareil, jamais dans le dépôt : ce n'est PAS une clé de signature.
- iOS efface l'ancien coffre à une réinstallation détectée ; Android désactive la sauvegarde
  automatique. Les données de jeu/captures restent dans le stockage WebView/IndexedDB
  privé existant, sans nouveau chiffrement applicatif de ces données. Les protections OS,
  sauvegardes iOS et appareils compromis doivent être prises en compte : pas de garantie absolue.
- Reprise : signal focus/visibility transmis aux mécanismes existants ; les sessions sont
  relues au démarrage et rafraîchies par l'Auth client. Les erreurs réseau transitoires ne
  sont pas assimilées à une révocation définitive. Bandeau hors ligne ; aucun rejeu
  automatique des requêtes de suppression/achat. Un abort côté JS ne garantit pas
  l'annulation d'une mutation déjà reçue par le serveur.
- Choix volontaire caméra/galerie via Capacitor Camera, injection dans les sélecteurs
  de fichiers existants, confirmation OCR existante conservée. Pas de sauvegarde automatique
  dans la galerie. Android : INTERNET, ACCESS_NETWORK_STATE, CAMERA ; pas de permission
  globale READ_MEDIA_IMAGES, stockage externe, GPS, microphone, contacts ou notifications.
  iOS : Camera / PhotoLibrary avec justification, aucune permission d'ajout à la galerie.
  Tester refus, permission limitée, annulation, très grosses images et capture réelle.
- Icônes et splash issus uniquement de `assets/warboost-icon-512.png` (WB), sans nouvel
  asset Last War/FUNFLY. `npm run mobile:assets` régénère les tailles natives.

## Suppression et pages publiques

`security.html`, `privacy.html`, `legal.html`, `delete-account.html` sont embarquées et
accessibles sans connexion, même hors ligne. Les liens vers le compte/support ouvrent
la même application locale. Suppression dans le compte : deux confirmations, challenge
serveur, utilisateur authentifié uniquement. Nettoyage des données de cet utilisateur,
et du coffre de session correspondant, sans effacer le coffre d'un autre compte.

**Non activée réellement par cette passe** : l'API bêta publiée doit recevoir le code
serveur et les migrations de suppression doivent être autorisées/appliquées MANUELLEMENT.
La présence du bouton ne prouve pas cette activation. Tests actuels : serveur synthétique,
transport natif simulé, PostgreSQL PGlite, aucun vrai compte supprimé.
Les références Stripe existantes nécessitent une assistance ; compléter le support public
hors connexion avant les stores. Voir `SECURITY_TRUST_REVIEW.md`.

## Facturation

**Mode commercial OFF dans l'app native.** Aucun checkout ni portail Stripe proposé :
garde de rendu, CSS et refus des POST `/api/pro` dans le transport mobile. Aucun lien
de contournement vers achat web. Les droits PRO gratuits existants restent inchangés.
Stripe reste web uniquement ; son fonctionnement serveur n'a pas été modifié.

Le futur abonnement numérique natif devra utiliser **StoreKit / Google Play Billing** :
adaptateur par plateforme, restauration d'achats, validation serveur signée des reçus/
purchase tokens, notifications stores, annulation/renouvellement et entitlement commun
indépendant des rôles Alliance. Rien de cela n'est implémenté ou activé ici.

## Android — produire un AAB plus tard

Projet Gradle `android/` : applicationId fr.warboost.app, versionCode 1 / versionName 1.0
(À VALIDER), SDK min 24 / cible 36, release sans signingConfig embarquée.

1. Installer Android Studio, JDK compatible Gradle (Capacitor 8 : JDK 21), SDK 36.
2. `npm ci && npm run mobile:assets && npm run mobile:sync`.
3. Ouvrir `npx cap open android` ; compiler/debugger sur appareil puis auditer permissions
   du manifeste fusionné et URLs effectives. Configurer local.properties hors Git.
4. Incrémenter versionCode à chaque upload. Utiliser Play App Signing et une clé d'upload
   gérée hors dépôt/Secrets CI autorisés. Ne jamais commiter keystore ou mot de passe.
5. `cd android && ./gradlew bundleRelease` dans cet environnement équipé ; fournir la
   signature d'upload via Android Studio/CI externe autorisée. Sans signature, un éventuel
   AAB non signé n'est pas soumis à Play. Vérifier Android lint et appareils avant upload.

**Ici : aucun JDK/SDK Android disponible, aucun AAB produit ni compilation Java confirmée.**
`cap doctor` valide la cohérence Capacitor Android, pas un build Gradle.

## iOS — archive plus tard

Projet `ios/App/App.xcodeproj`, dépendances Swift Package Manager, coffre natif inclus dans
Sources, manifeste PrivacyInfo.xcprivacy dans Resources. Portrait iPhone, mode sombre.

1. Mac + Xcode 26 minimum pour Capacitor 8 ; `npm ci && npm run mobile:sync`.
2. `npx cap open ios` ; résoudre SPM, choisir une équipe autorisée et valider fr.warboost.app.
3. Contrôler version/build, privacy manifests agrégés et permissions ; tester sur iPhone.
4. Configurer signature dans Xcode / équipe, certificats et provisioning **hors dépôt**.
5. Product > Archive (Release, appareil générique), Validate App, puis export/upload
   uniquement après autorisation de soumission. Pas d'équipe fictive renseignée.

**Ici : Linux, pas de Xcode, aucune archive/IPA ni compilation Swift confirmée.**

## Fiche App Store Connect / Google Play Console (brouillon)

| Champ | Proposition / état |
|---|---|
| Nom | WarBoost |
| Sous-titre Apple | Prépare tes objectifs de jeu |
| Description courte Play | Organise tes scans, ta progression et les événements de ton alliance. |
| Catégorie Apple suggérée | Utilitaires |
| Catégorie Play suggérée | Outils |
| Éditeur / identité juridique | **À RENSEIGNER** |
| Adresse juridique / contact développeur | **À RENSEIGNER** |
| URL support publique hors connexion | **À RENSEIGNER** — ne pas utiliser un espace qui impose un compte |
| URL confidentialité prévue | https://beta.warboost.fr/privacy.html |
| URL suppression prévue | https://beta.warboost.fr/delete-account.html |
| URL sécurité prévue | https://beta.warboost.fr/security.html |
| Site / marketing | https://warboost.fr — propriété/contenu à valider |
| Copyright / détenteur des droits | **À RENSEIGNER** |
| Classification d'âge / pays disponibles | **À RENSEIGNER** après questionnaires |
| Comptes développeurs / Team ID | **À RENSEIGNER**, aucun achat effectué |

Ces URLs sont proposées à partir du domaine demandé ; leurs contenus publics actuels
n'ont pas été certifiés par cette passe et les changements locaux n'ont pas été déployés.

### Description longue proposée

WarBoost aide à organiser la progression de jeu et les événements d'alliance.
Renseigne volontairement ton profil et choisis les captures à analyser. Relis et confirme
les résultats avant leur prise en compte. Consulte tes priorités, suis tes escouades et
prépare les participations aux événements avec ton alliance.

L'application conserve les informations que tu fournis et confirme, avec une distinction
entre les données locales et celles synchronisées. Une connexion est nécessaire pour les
scans IA, les fonctions cloud et la suppression du compte. Les pages Sécurité et
Confidentialité expliquent les données traitées et les moyens d'exercer tes droits.

WarBoost ne demande jamais ton mot de passe Last War, n'accède pas directement à ton
compte de jeu et n'utilise aucune API Last War non autorisée. WarBoost est un outil
indépendant, non affilié, non sponsorisé et non approuvé par Last War ou FUNFLY.

La phase bêta ne propose aucun achat dans l'application. Les conseils sont indicatifs :
ils ne garantissent aucun résultat en jeu.

## Matrice de données — base pour Data Safety et App Privacy

| Données réellement traitées | Usage / caractère | Local / serveur / fournisseurs | Conservation / action |
|---|---|---|---|
| Email, identifiant compte WarBoost | Authentification, récupération, droits ; nécessaires au compte | Supabase Auth ; email/ID dans session native sécurisée | Jusqu'à suppression, cycles techniques à confirmer |
| Mot de passe WarBoost | Auth uniquement ; jamais Last War | Transmission HTTPS à Supabase, gestion Auth fournisseur ; jamais persisté en clair par l'app | Selon Auth fournisseur ; aucune copie locale |
| Tokens d'accès/rafraîchissement | Session, nécessaires à la connexion | Keychain/Keystore, mémoire ; vérification serveur | Révocation/suppression/déconnexion ; dates propres aux tokens |
| Pseudo Last War, serveur/alliance, rang, QG, héros, puissances, technologies, drone, escouades | Profil/progression volontairement fourni et confirmé | Stockage local, Supabase profil/snapshots/roster | Compte jusqu'à suppression ; historique collectif conservé/délié |
| Disponibilités/participations événements | Organisation d'alliance, facultatif | Local/cloud, visible aux membres autorisés selon droits existants | Compte/historique partagé selon suppression et demandes |
| Captures choisies (caméra/galerie) | OCR IA ou support, facultatif | IndexedDB en attente ; transit serveur/OpenAI pour OCR ; Supabase Storage pour support | Validité locale 48h, nettoyage à l'accès ; support jusqu'à suppression ; rétention OpenAI à confirmer |
| Tickets, messages, pièces jointes, contexte de diagnostic volontaire | Support et sécurité, facultatif | Supabase support / Storage | Jusqu'à suppression ; pas de purge périodique promise |
| IP / journaux techniques / erreurs | Exploitation et sécurité fournisseurs | Hébergement, Supabase, OpenAI ; périmètre exact à auditer | Durées/régions/contrats **À CONFIRMER** |
| Statut PRO, références techniques Stripe TEST déjà existantes | Entitlements serveur ; pas de nouvel achat mobile | Backend existant, Stripe web TEST ; aucun numéro de carte conservé | Suppression accompagnée si références Stripe ; obligations à finaliser |

Pas de GPS, contacts, microphone, publicité ciblée ni nouveau SDK analytics ajouté.
Les captures peuvent contenir des données de tiers : informer l'utilisateur et éviter
les informations inutiles avant envoi. Les déclarations sont **liées au compte**, non
utilisées pour du tracking publicitaire. OpenAI et autres sous-traitants doivent être
qualifiés selon leurs contrats ; ne pas cocher arbitrairement « aucune collecte »,
« aucune donnée partagée » ou « toutes les données temporaires ». Les APIs natives
UserDefaults utilisées pour détection de réinstallation sont déclarées CA92.1.
PrivacyInfo.xcprivacy décrit les catégories principales, à valider avec l'archive finale
et les manifestes des plugins ; les formulaires consoles restent à remplir manuellement.

## Checklist captures et revue

- Images issues de vrais builds autorisés, pas de capture simulée présentée comme native.
- Téléphone Android et formats iPhone demandés actuellement par les consoles.
- Accueil WarBoost, profil anonymisé, capture choisie/confirmation OCR, Diagnostic PRO,
  organisation d'événement/alliance autorisée, compte/sécurité et double suppression.
- Pas d'email réel, token, code bêta, nom de tiers non autorisé, achat Stripe ou données privées.
- Icône 512 Play, 1024 Apple ; feature graphic Play à préparer depuis assets WB.
- Ne pas afficher Last War/FUNFLY comme marque de WarBoost ; auditer les droits des
  visuels de héros existants avant de les utiliser dans l'app ou dans le marketing.
- Vérifier caméra réelle, galerie limitée/refusée, fermeture forcée/reprise, expiration Auth,
  réseau intermittent, déconnexion/suppression, liens externes, accessibilité et appareils.
- Fournir à la revue un compte de démonstration autorisé sans secrets dans ce dépôt.
- Apple 4.2 : un wrapper n'assure pas l'acceptation ; démontrer une utilité et intégration
  mobile suffisantes, tester sur appareil, retirer tous les champs provisoires.

## Blocages avant soumission

Support public hors connexion / identité juridique ; contrats et rétentions fournisseurs ;
activation serveur et suppression réelle sur un compte jetable de TEST autorisé avant
production ; migrations manuelles seulement ; revue de l'alerte statique sécurité résiduelle ;
compilation réelle Android/iOS, tests physiques, signatures externes, captures stores,
questionnaires et audit des contenus/IP. Facturation store non intégrée : vente mobile OFF.

Références consultées : https://capacitorjs.com/docs/config ;
https://capacitorjs.com/docs/getting-started/environment-setup ;
https://developer.apple.com/app-store/review/guidelines/ ;
https://support.google.com/googleplay/android-developer/answer/13327111 .

## Vérifications locales

- `npm run build`, `npm run check`, `npm run test:mobile-wrapper`,
  `npm run test:account-deletion` : PASS.
- `npx cap sync` : Android et iOS synchronisés. `npx cap doctor` : configuration Android
  cohérente ; Xcode absent. Ces commandes ne compilent aucun binaire natif.
- Audit npm : zéro vulnérabilité après sélection d'un CLI 8.4.3 compatible, les plateformes
  et core restent 8.5.2. Le CLI 8.5.2 introduisait une dépendance dev xcode/uuid signalée ;
  aucun contournement du firewall ni override de sécurité n'a été utilisé.
- Navigateur, bridge NATIF SIMULÉ uniquement : connexion/persistance/reprise, caméra factice,
  réseau hors ligne avec refus de suppression, deux confirmations, coffre vide après
  suppression, conservation d'un autre compte et blocage de lien Stripe : PASS.
  Un défaut de reseeding appartenait à la fixture seule, corrigé sans changement de l'app.
- Ensemble des scripts `test:*` exécuté avec secrets retirés du processus ; le test
  d'import API utilise une configuration Supabase fictive, sans requête authentifiée réelle.
  Résultat final : **49/52 PASS**, trois échecs historiques ; le runner global retourne 1.
  `git diff --check` : PASS (0), aucun défaut de whitespace signalé.
  Trois assertions historiques restent en échec, préexistantes au wrapper :
  `test:qg35-coach` (ancien marqueur SW absent), `test:roster-diagnostic` (ancienne syntaxe
  de source roster), `test:alliance-ui-targeted` (ancien attendu de table Alliance).
  Aucun test n'a été affaibli pour masquer ces écarts ; ils restent à réconcilier avant release.

## Fichiers locaux de cette passe

- Configuration : `capacitor.config.json`, `.gitignore`, `package.json`, `package-lock.json`.
- Web existant : `app.js`, `reset-password.js`, `lib/browser-auth.js`,
  `lib/account-deletion-ui.js`, `privacy.html`, `sw.js`.
- Mobile partagé : `lib/mobile-policy.js`, `lib/mobile-runtime.js`,
  `mobile/capacitor-entry.js`, `mobile/native.css`.
- Scripts : `scripts/build-mobile-web.mjs`, `scripts/generate-mobile-assets.mjs`,
  `scripts/verify-mobile-wrapper.mjs`, `scripts/verify-mobile-regressions.mjs`,
  `scripts/serve-account-deletion-fixture.mjs`.
- Android : projet `android/` généré, Gradle et wrapper, manifeste,
  `app/src/main/java/fr/warboost/app/MainActivity.java`,
  `app/src/main/java/fr/warboost/app/WarBoostSecureStorage.java`, thèmes et ressources WB.
- iOS : projet `ios/` généré, Xcode/SPM, `App/App/WarBoostViewController.swift`,
  `App/App/Info.plist`, `App/App/PrivacyInfo.xcprivacy`, storyboards et ressources WB.
- Documentation : ce fichier ; index mémoire et notes de périmètre/vérification.
- Sortie `mobile-dist` et copies `public` natives ignorées par Git, régénérées avec build/sync.
  Pas de nouveau changement des migrations SQL ou du code serveur paiement.
