# Technologie compacte — revue locale

## Périmètre

- Worktree TEST : `.local/warboost-free-access-review-20261025`.
- Base : `0d5bb58e051d96010441a8cf90f1a614898a36b4`.
- Livraison limitée à l'interface Technologie, ses libellés, son CSS, ses tests et cette note.
- Les six fichiers préexistants « nouveautés octobre » sont exclus et leur SHA256 est comparé avant/après.

## Comportement

- Catalogue complet de 18 lignes ; aucun éditeur initialement ouvert, un seul éditeur après toucher une ligne.
- Chaque résumé utilise uniquement la valeur enregistrée : vrai 0 %, vrai 100 %, Niveau Max, Verrouillée ou Non renseigné.
- Enregistrer et Annuler sont présents seulement dans l'éditeur ouvert ; aucune sauvegarde automatique.
- Dates valides `updated_at`, sinon `confirmed_at`, formatées à l'affichage selon langue et fuseau du navigateur. Exemple Europe/Paris : `28/10/2026 à 06:48`. Aucun horodatage stocké n'est modifié ; aucune date absente n'est inventée.
- Source manuelle ou scan affichée si explicitement disponible. Une source absente n'est pas devinée.
- Brouillons distincts des données confirmées, signalés comme non enregistrés. Conservation en mémoire pendant repli/changement de ligne ; copie de brouillon en sessionStorage du même onglet et du même joueur pour une actualisation. Jamais de synchronisation cloud de ces brouillons.
- Effacement des brouillons sur changement de compte/reset de confidentialité. Une empreinte de base conservée oblige toujours à refuser une écriture devenue obsolète après retour cloud.
- Si sessionStorage est indisponible, le brouillon reste en mémoire et un garde `beforeunload` demande confirmation de sortie. Le navigateur décide de montrer cette confirmation ; aucune garantie de récupération après destruction d'onglet/processus ou effacement du stockage.
- 22 langues pour les contrôles, les noms, le signalement du brouillon et la source scan ; arabe RTL. Grille mono-colonne, retours à la ligne et cibles tactiles ≥44 px.
- Aucune modification des règles de fusion, des fonctions de sauvegarde/cloud, des valeurs, des escouades, des drones ou armes.

## Vérifications effectuées hors réseau

Le préchargeur `scripts/release/no-network.cjs` interdit les connexions réseau des processus de validation ; environnement nettoyé, sans clés.

```
node --require ./scripts/release/no-network.cjs --test \
  scripts/technology-manual.test.mjs \
  scripts/verify-technology-scan.mjs \
  scripts/verify-scan-review.mjs
```

- Résultat final : **55 PASS, 0 FAIL, 0 ignoré**, dans 3 fichiers (53 tests manuels, 2 scripts de régression).
- Quatre nouveaux tests : liste compacte/éditeur unique ; conservation et restauration du brouillon ; états/dates/sources/22 langues ; conflit cloud après restauration.
- Tests existants conservés : sauvegarde/annulation/validation, contrôle du propriétaire, comptes A/B, zéro/Max/effacement durable, cloud simulé, conservation escouades/drone/armes.
- Premier passage : 51 PASS / 1 FAIL, dû à une clé synthétique `squad1` au lieu de la clé canonique `team_1` dans le nouveau test. Fixture corrigée ; aucun changement de règle métier pour contourner le test.
- `npm run check` : PASS.
- `npm run build:web` : PASS, 8 pages et 160 modules navigateur.
- `git diff --check` : PASS.

## Limites et livraison

- DOM/événements et stockage simulés : pas de test Android/iPhone réel ni de capture visuelle du nouveau rendu.
- Aucun serveur/Preview démarré, aucun appel Vision, Supabase ou Stripe, aucune donnée joueur consultée.
- Aucun déploiement demandé. La livraison Git est limitée à la branche de revue TEST et ne constitue pas une validation production.
- Le test historique `verify-v2.5.28-hf8-6-12.mjs`, connu en échec sur la base, n'a pas été relancé ni déclaré réparé.
