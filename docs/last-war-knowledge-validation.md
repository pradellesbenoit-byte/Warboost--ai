# Compte rendu de validation — connaissances et Diagnostic PRO

## État et périmètre

- Branche : `public-beta-safe-launch`.
- Base conservée : `01c02f4b9fd45abdf3cc386f1b841d30a35aea58`, également observée sur GitHub par `git ls-remote`.
- Modifications locales non commitées ; aucun commit, push, publication, migration ou changement de données de production effectué dans cette passe.
- Sauvegarde locale de la base vérifiée avec `git bundle verify`.
- Branche `demo-lastwar-presentation` inchangée (`f2e5a0227b8a7c89dc6f7fd9b5caf6bf72a8dbae`) ; aucune modification du composant ou des assets de chargement avec personnages.
- Pas de modification des endpoints scan, reconnaissance portraits/équipements, Technologie, invitations, rôles Alliance ou facturation.

## Fonctionnement réellement ajouté

Le serveur du Diagnostic PRO filtre les observations à l'escouade sélectionnée avant d'exécuter le moteur existant. Les identités héritées, champs incertains et registres d'autres escouades ne deviennent pas des preuves. Une alerte d'identité du dernier scan empêche de présenter une ancienne composition comme actuellement confirmée, sans l'effacer du compte.

La confirmation du scan mémorise sa cible et sa date pour la fiche du diagnostic. Le panneau fournit au maximum trois priorités relatives documentées, les champs manquants, les dates par champ quand connues et un plan prudent à sept jours. La confiance d'une source n'est pas la certitude de l'optimalité du classement. Les coûts/ressources et les positions avant/arrière inconnus restent à vérifier.

Les nouvelles commandes/étiquettes sont traduites dans les 22 langues. Le diagnostic et les vérifications utilisent le W existant avec arrêt en `finally`. Les composants de connaissances sont inclus dans le cache PWA ; seules les caches d'assets changent, pas les données/session utilisateur.

## Vérifications réelles des sources

Le script `npm run knowledge:refresh` a réellement vérifié les deux sources officielles activées le 11 octobre 2026 :

- `wiki.lastwar.com` : HTML de type application JavaScript sans contenu d'annonce directement exploitable. Le rendu public consulté séparément permet de repérer trois titres conservés comme **découvertes en attente**, pas comme règles.
- `www.lastwar.com` : site 503 lors de la consultation publique, vérification automatique robots indisponible.

**Zéro nouvelle règle officiellement approuvée/appliquée.** Aucun endpoint privé ni service payant utilisé. Le scheduler reste OFF. Fréquence manuelle bornée à 24 heures, persistance locale du registre par CLI ; cache à la demande seulement en mémoire de processus.

## Contrôles exécutés

- `npm run check`.
- `npm run build:web`.
- `npm run build:mobile` — assets web du wrapper, pas un APK/AAB/archive iOS.
- Toutes les 73 commandes `test:*` de `package.json`, dont :
  - `test:knowledge-guidance` : **36 groupes de vérification** ;
  - `test:player-scan-diagnostic` et `test:diagnostic-disclosures` ;
  - tests de scans, portraits, équipement, cible des quatre escouades, fusion, provenance et review ;
  - tests de Technologie, Alliance, sécurité/autorisation, langues, W animé et arrêt ;
  - `test:web-build`, `test:mobile-wrapper`, `test:beta-api-imports`, `test:prepush-privacy`.
- `git diff --check`.
- Requête HTTP réelle non authentifiée sur `/api/advice?action=knowledge_refresh` : **401 AUTH_REQUIRED**.
- Workflow de développement redémarré et logs inspectés : serveur sur le port 5000.
- Capture navigateur 402 × 874 : écran de chargement existant avec personnages conservé. **La fiche PRO connectée n'est pas validée par cette capture.**

Résultat final : **76 commandes check/build/test réussies, aucune en échec**. Un premier test VM de l'ancien rendu a échoué parce qu'il ne fournissait pas le nouveau helper ; la compatibilité avec les analyses ne contenant pas encore `knowledge_guidance` a été rétablie, puis le test réel relancé et passé. Les anciens tests ne sont pas désactivés.

Les résultats machine et logs sont dans `generated-artifacts/knowledge-validation/`, ignorés de Git et des publications.

## Ce qui n'est pas établi

- Les tests Tank/Avion/Missile et mutations de méta du nouveau moteur utilisent des observations et réponses HTTP **synthétiques**, explicitement identifiées. Aucun vrai appel Vision/OpenAI ni nouveau coût engagé.
- Aucun nouveau test de précision des photos privées, aucun gain réel de puissance, aucune optimalité tactique garantie.
- Pas de fiche PRO connectée testée sur téléphone, pas de validation linguistique humaine des 22 langues.
- Ni SDK/JDK Android ni Xcode disponibles : aucun APK/AAB/archive iOS généré, aucun test physique Android/iOS.
- Avant une veille automatique complète : annonces publiques avec auteur éditeur/date/périmètre attestés, adaptateur autorisé si rendu JavaScript nécessaire, stockage/verrou partagés et scheduler approuvé.

Pour le fonctionnement et le protocole d'approbation des sources : `docs/last-war-knowledge.md`.
