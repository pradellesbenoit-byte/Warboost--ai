# WarBoost V2.5.28 HF8.6.6 — Scan Persistence Reliability

## Pourquoi ce correctif
Un nouveau bêta-testeur pouvait se connecter et synchroniser son profil WarBoost, mais les captures choisies dans WarBoost Scan n'étaient conservées que dans la mémoire JavaScript de la page. Une actualisation, une fermeture de l'application, le retour du navigateur ou certains parcours Android faisaient donc disparaître la capture et obligeaient le joueur à la sélectionner à nouveau.

La vérification du compte bêta réel a confirmé que le cloud fonctionnait : compte autorisé, profil présent, pseudo/QG et état de synchronisation enregistrés. En revanche, les données de puissance/Drone/escouades restaient vides lorsque l'analyse n'avait pas extrait de valeur utile. Le problème n'était donc pas une absence générale de sauvegarde Supabase : il fallait fiabiliser à la fois la capture temporaire locale, la validation du résultat de scan et la livraison cloud.

## Corrections HF8.6.6
- Capture WarBoost Scan persistée dans IndexedDB sur l'appareil jusqu'à 48 h.
- File multi-captures du scanner de roster persistée elle aussi jusqu'à 48 h (limite locale 60 Mo).
- Stockage temporaire cloisonné par compte WarBoost afin d'éviter qu'un changement de compte n'affiche la capture d'un autre joueur.
- Une capture réussie n'est plus effacée immédiatement après l'analyse : elle peut être réutilisée ou supprimée manuellement.
- Bouton « Effacer la capture de cet appareil ».
- Si le navigateur bloque le stockage local persistant, WarBoost avertit le joueur au lieu de prétendre que la capture sera conservée.
- Un résultat de scan sans donnée utile pour le type demandé n'est plus présenté comme « enregistré » : la capture reste disponible pour réessayer.
- `localStorage` défaillant/quota privé ne bloque plus la tentative de sauvegarde cloud.
- Les échecs de sauvegarde WarBoost Cloud passent en état en attente et sont retentés automatiquement.
- Une tentative de sauvegarde est également déclenchée au retour réseau, lors du passage en arrière-plan et à la fermeture de la page mobile.
- Service worker/PWA : cache HF8.6.6, mise à jour forcée du worker et rechargement contrôlé lors du changement de version.
- Texte de confidentialité mis à jour : l'image brute peut rester temporairement sur l'appareil mais n'est pas enregistrée dans le profil cloud WarBoost.

## Ce qui reste dans le cloud
Le profil structuré extrait/confirmé (profil, QG, puissances, Drone, escouades, héros, progression, etc.) continue à être enregistré dans `wb1_profiles` et les snapshots de progression. Les images brutes de scan ne sont pas ajoutées à Supabase par HF8.6.6.

## Compatibilité / sécurité
- Toutes les protections HF8.6.5, HF8.6.4, HF8.6.3, HF8.6.2 et antérieures sont conservées.
- Safe Launch reste actif : aucune API Last War non autorisée, aucun scraping, aucune automatisation de gameplay.
- Aucun nouveau fichier de migration Supabase.
- Toujours 12 fonctions Vercel serverless.
- 23 choix de langues explicites + Auto restent pris en charge.

## Test d'acceptation mobile
1. Se connecter avec un compte bêta.
2. Choisir une capture dans WarBoost Scan.
3. Fermer puis rouvrir `beta.warboost.fr` : l'aperçu doit revenir.
4. Lancer l'analyse. Si aucune donnée utile n'est extraite, la capture doit rester disponible et aucun faux « enregistré » ne doit être affiché.
5. Si des données sont extraites, fermer/rouvrir l'application : les valeurs structurées doivent rester dans le profil.
6. Répéter avec deux captures du roster : la file doit survivre à la fermeture/réouverture jusqu'à import ou expiration.
