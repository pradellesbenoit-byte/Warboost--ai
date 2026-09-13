WARBOOST V2.5.28 — HF8.6.13 VERIFIED CLOUD ACCESS RESTORE

BASE OBLIGATOIRE
- WarBoost V2.5.28 HF8.6.12 déjà déployé sur public-beta-safe-launch.
- Ne pas appliquer sur main / publisher-demo.

CAUSE CORRIGÉE
- L'état cloud pouvait être présent et intact mais rester masqué si /api/pro échouait temporairement ou arrivait dans le mauvais ordre.
- /api/state vérifie déjà côté serveur l'identité, l'invitation et le consentement. Une réponse 200 devient donc la preuve autoritative permettant de restaurer et afficher les données.

PROTECTIONS
- Une lecture /api/state réussie réactive immédiatement l'affichage des données privées.
- Un échec réseau/5xx de /api/pro ne transforme plus un joueur déjà vérifié en faux compte bloqué/vide.
- Une révocation ou expiration réelle reste bloquante (403 fail-closed).
- Au démarrage, si le consentement est accepté, WarBoost tente la restauration /api/state même si /api/pro est temporairement indisponible.
- Les retry online/retour au premier plan utilisent également /api/state comme autorité.
- Toutes les protections HF8.6.12, HF8.6.11 et HF8.6.10 restent actives.

IMPORTANT POUR LES TESTEURS
- Utiliser de préférence https://beta.warboost.fr. Chaque URL *.vercel.app possède son propre stockage local/session navigateur.
- Ne pas rescanner ni vider les données si un écran semble vide : les données cloud doivent être restaurées.

INSTALLATION
1. Décompresser le ZIP.
2. Envoyer son CONTENU à la racine de public-beta-safe-launch en conservant les dossiers.
3. Remplacer uniquement les fichiers présents dans ce patch.
4. Ne supprimer aucun autre fichier et ne faire aucune migration Supabase.
5. Attendre Vercel Ready.
6. Ouvrir beta.warboost.fr, fermer/réouvrir une fois si le Service Worker se met à jour.

VALIDATION AVANT LIVRAISON
- npm run check : PASS
- npm run verify complet V2.5.28 -> HF8.6.13 : PASS
- HF8.6.12 Cloud Restore Guard : PASS
- HF8.6.13 Verified Cloud Access Restore : PASS
- Révocation réelle 403 reste bloquée : PASS
- Erreur temporaire ne masque plus un accès déjà vérifié : PASS
