# WarBoost — premier APK Android debug

## Résultat local

Sur `public-beta-safe-launch`, `npm ci`, `npm run build` et `npm run mobile:sync`
réussissent. La tentative réelle `cd android && ./gradlew --no-daemon :app:assembleDebug`
s'arrête avant compilation : `JAVA_HOME is not set and no 'java' command could be found`.
Aucun JDK/SDK Android utilisable n'a été trouvé ici. **Aucun APK local produit**.
Les projets Android ne sont donc pas encore validés par une compilation native.

## Workflow préparé, non exécuté

- Fichier : `.github/workflows/android-debug-apk.yml`
- Nom affiché : **WarBoost Android Debug APK**
- Déclenchement : push effectué par le propriétaire sur `public-beta-safe-launch`,
  ou `workflow_dispatch` avec cette branche sélectionnée. Toute autre branche est ignorée.
- Ubuntu 24.04, Node 22, Java Temurin 21, SDK/platform 36 et build-tools 36.0.0.
- Actions épinglées par SHA ; token implicite GitHub limité à la lecture du code,
  credentials checkout non persistés. Aucun secret personnalisé à configurer.
- Dépendances verrouillées (`npm ci`), checks JS/mobile, checksum Gradle/wrapper,
  compilation debug, lint Android et tâche tests JVM sans appareil.
  Le projet n'a pas encore de tests JVM natifs : cette dernière tâche peut être NO-SOURCE.
- Gradle crée automatiquement un certificat/keystore **debug éphémère dans le runner**,
  jamais ajouté au dépôt, aux caches ou à l'artifact. Aucun keystore release.
- Vérification de signature et de `fr.warboost.app` sur le vrai APK avant upload.
- Aucun AAB, achat développeur, publication Play Store, déploiement ou push par l'Agent.

## Récupération après votre push manuel

1. Committer localement ces changements, puis les pousser vous-même sur
   `public-beta-safe-launch`. Aucun push n'est effectué dans cette passe.
2. GitHub → **Actions** → **WarBoost Android Debug APK** → exécution correspondant au SHA.
   Le push démarre le workflow ; pour relancer : **Run workflow** et choisir
   `public-beta-safe-launch`. Si le workflow n'est pas sur la branche par défaut,
   GitHub peut ne pas proposer ce bouton : le déclenchement push reste disponible.
3. Après succès, section **Artifacts**, télécharger
   `warboost-android-debug-<run_number>-<run_attempt>` (conservation 7 jours).
4. Dézipper : `app-debug.apk` et `build-info.json` avec SHA source, taille et SHA256 APK.
   Chemin runner exact : `android/app/build/outputs/apk/debug/app-debug.apk`.
   Si compilation/lint/signature échoue, aucun artifact n'est annoncé comme réussi.

## Installation et identification

Installer l'APK sur un Android 7+ (API 24+), en autorisant temporairement l'installation
depuis la source choisie, ou `adb install -r app-debug.apk` avec Android Platform Tools.
L'identifiant est `fr.warboost.app`, version native **1.0**, versionCode **1**, à valider
avant release. Un petit indicateur natif affiche version, numéro de build et SHA source
(12 caractères), y compris sur les pages publiques.

Chaque nouveau runner peut signer avec un nouveau certificat debug. Android refuse alors
le remplacement d'une installation précédente avec signature différente. Ne pas désinstaller
sans export/sauvegarde préalable : la désinstallation supprime les données locales.
Utiliser de préférence un téléphone/profil de test et un compte WarBoost jetable.

## Validation téléphone indispensable

- Connexion, fermeture complète/réouverture, reprise réseau ; aucun token plaintext.
- Portrait et thème sombre ; versions/build/SHA visibles et cohérents avec l'artifact.
- Autorisation caméra refusée/acceptée, sélection galerie, annulation et confirmation OCR.
- Pages sécurité/confidentialité/suppression avant connexion et depuis le compte.
- Suppression avec les deux confirmations sur un compte de test seulement, jamais un vrai testeur.
  Le serveur bêta doit déjà exposer le parcours sécurisé et ses migrations autorisées.
- Stripe indisponible dans le natif ; droits PRO existants préservés, vente mobile OFF.
- Liens externes contrôlés et suppression impossible hors ligne.

Cette préparation CI ne constitue pas un build réalisé : seul un run GitHub vert avec
APK vérifié permet d'annoncer **APK DEBUG GÉNÉRÉ**. Aucun changement Supabase production.

## Vérifications réalisées ici

- `npm ci` : PASS, zéro vulnérabilité signalée.
- `npm run build` et `npm run mobile:sync` : PASS, 7 pages/86 modules, Android+iOS synchronisés.
- `npm run test:mobile-wrapper` : PASS (transport/stockage simulés, pas un appareil réel).
- `npm run test:android-debug-ci` : PASS (restrictions CI, checksum JAR/distribution Gradle,
  configuration native et syntaxe Bash des quatre blocs, sans exécuter les actions distantes).
- `npm run check` et `git diff --check` : PASS, sorties 0.
- Gradle debug : tentative réelle, sortie 1, arrêt sur Java absent.
  Compilation, lint et tests JVM Android ne sont pas exécutables ici ; prévus dans la CI.
- Pages web publiques inchangées, application web démarrée normalement après réinstallation.
