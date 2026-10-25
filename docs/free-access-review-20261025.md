# Note de suivi

Ce rapport conserve les preuves de la préparation au commit `9db63dd`.
La suite « espace WarBoost autonome + budget configurable » est décrite dans
[`free-workspace-budget-review-20261025.md`](free-workspace-budget-review-20261025.md).
Le plafond fixe et la restriction au seul brouillon décrits ci-dessous sont
historiques ; ne pas utiliser ce rapport seul comme procédure d'installation.

# FREE sans code et multi-alliance — préparation locale

## État

- Branche `warboost-free-access-review-20261025`, base commerciale `14c500465b3ec32cb7b5c91dd055e2d250330a7d`.
- Reprise du commit `ac6d4b0cd9d2896c9199fb15fc49eebf6d837161`, sans réimporter les anciens commits/ZIP privés.
- Préparation locale uniquement : aucun push, déploiement, compte ou appel Supabase/Stripe/Vision réel.
- **GO pour revue locale, NO-GO pour publication sans revue SQL et recette réelle autorisées.**

## Politique conservée

Inscription personnelle FREE sans code, invitation, parrainage ni autorisation administrateur : e-mail confirmé côté serveur + consentement. Pseudo et serveur requis, alliance facultative. PRO et autorité d'alliance restent séparés. Les grants historiques bêta, sauvegardes et sessions ne sont pas modifiés. Pas de paiement LIVE ; le prix de 4,99 € n'est pas activé.

Les scans personnels FREE utilisent une réservation persistante : 3/jour/compte, 30/jour UTC partagés. Réservation avant fournisseur, après validation d'image ; échec consommé, pas de remboursement/retry automatique. Le compteur global survit à la suppression d'un compte. PRO acquis garde son chemin et les protections antérieures, sans nouvel octroi automatique.

## Nouveauté : fondateur WarBoost ≠ R4/R5 vérifié

Depuis Compte, tout joueur confirmé disposant d'un profil cohérent peut créer/retrouver **un espace provisoire privé** pour son serveur/tag, sans prouver un grade du jeu.

- Table séparée `wb1_alliance_founder_spaces`, un espace par compte.
- Aucun insert/update dans `wb1_alliances`, aucun membership ni rôle R4/R5, aucun lien de compte créé.
- Aucun accès aux profils, événements, membres ou rosters existants. Le brouillon ne peut pas servir de preuve canonique pour les anciennes API.
- Plusieurs fondateurs peuvent préparer leur propre brouillon pour le même scope : aucun premier déclarant ne réserve ce scope globalement.
- Si un espace canonique existe : retour minimal « espace existant », puis demande d'adhésion sans code. Aucun détail privé de cet espace n'est renvoyé.
- Brouillon explicite : maximum 100 noms, grades du jeu facultatifs et **déclarés**, pas de défaut R1. Seuls `name` et `declared_game_role` sont acceptés. Aucun player_id, lien de compte ou privilège.
- Identité de scope immuable : changement du profil refuse la réaffectation automatique de l'ancien brouillon ; il reste conservé en base. Une gestion explicite d'archivage/changement de scope pourra être préparée ultérieurement.
- Création idempotente ; sauvegarde avec révision/CAS. Conflit ou réponse perdue : pas de nouvelle création, pas de faux succès, saisie conservée. Rechargement d'un brouillon modifié exige confirmation.
- Les réponses tardives ne sont pas appliquées à un autre compte ; une saisie plus récente n'est pas remplacée par l'accusé d'une ancienne sauvegarde. Déconnexion/changement de compte masque et vide le DOM privé.

**Limite volontaire :** ce n'est pas encore une alliance collaborative vérifiée. Le fondateur peut préparer son roster privé, pas publier un roster officiel, approuver des adhésions ou commander les événements au titre de R4/R5. Sans source indépendante Last War, aucune promotion automatique n'est justifiable. Une future procédure de promotion devra être revue séparément ; elle ne peut pas absorber ni remplacer un espace existant.

## Alliances existantes

Demandes sans code, fondées sur le profil cloud de l'acteur authentifié. L'approbation exige un owner existant ou un R4/R5 déjà lié au roster canonique. Identité exacte unique, scope inchangé, grade canonique connu, absence de lien étranger ou marqueur de retrait.

Verrou utilisateur, puis alliance, demande et profil : sérialisation des validations concurrentes. Roster, membership et demande modifiés atomiquement ; `roster_updated_at` avance pour CAS. Une ancienne demande approved sans membership correspondant ne produit plus un faux succès et ne réintègre personne.

Le serveur/tag déclaré seul ne permet pas à `getAllianceRoster` de charger les autres profils. Le nouveau parcours ne montre plus de demande de code/invitation générale. Quelques IDs DOM anciens restent cachés uniquement pour compatibilité de démarrage ; ils ne constituent pas un accès.

## SQL proposé — NE PAS installer sans accord

- `supabase/migration_free_access_preparation.sql`
- `supabase/audit_free_access_preparation.sql` (transaction read-only, catalogue/ACL, aucune identité renvoyée)

Quatre nouvelles tables privées sous RLS sans policy client ; accès direct révoqué à PUBLIC, anon, authenticated **et service_role**. Cinq RPC publiques uniquement EXECUTE service_role, helper manager privé non exposé. SECURITY DEFINER avec search_path pg_catalog, objets qualifiés et propriétaires contrôlés. Aucun SQL dynamique ni trigger auth.users, aucun changement des anciennes tables ou grants PRO.

Migration transactionnelle et rejouable : IF NOT EXISTS + remplacement des seules fonctions proposées, verrou de migration, timeouts, audit de types/non-null/PK/unique/FK/CASCADE/RLS/ACL/propriétaires. Une collision de schéma incompatible fait échouer la transaction. Aucune suppression, troncature ou remise à zéro des données. La suppression d'un profil cascade ses demandes/consommations/brouillon, mais pas le compteur global.

Avant installation : autorisation distincte, outil ciblé explicitement WarBoost-Test `zaioadmbhqzeihkvdjsd`, validation des droits REFERENCES et ownership, sauvegarde et plan de retour. Ce fichier SQL n'authentifie pas lui-même le projet : ne pas se fier à son nom/commentaire pour choisir une base. Production `jwjqcgexvqradjefskvh` non autorisée ici. Ne pas réappliquer les migrations opérateur déjà installées.

Sans installation, les nouvelles RPC renvoient une indisponibilité explicite ; aucun appel IA n'est alors déclenché. Pas de promesse d'ouverture effective aujourd'hui.

Rollback à revoir avant toute installation : retirer temporairement les nouvelles opérations via l'application et révoquer leurs EXECUTE service_role, sans DROP de table ni suppression de données/memberships. Conserver sauvegarde personnelle FREE et grants historiques. Les transactions déjà autorisées peuvent terminer : prévoir une fenêtre maîtrisée. Aucune restauration réelle démontrée ici.

## Vérifications locales finales

Environnement vidé (`env -i`, PATH/HOME et variables synthétiques si nécessaires), bloqueur `scripts/release/no-network.cjs` sur les tests Node ; aucun fournisseur contacté.

- `scripts/free-access.test.mjs` : **31 PASS, 0 FAIL**, dont handlers navigateur réels sous DOM/VM simulé, FREE/PRO, e-mail, comptes A/B, quatre escouades, nouveaux brouillons et refus.
- `verify-roster-scan-mobile` : **13 PASS** ; `verify-scan-handlers-mobile` : **19 PASS** ; `verify-precommercial-auth` : **18 PASS**.
- **81 tests Node** au total ci-dessus.
- `verify-free-access-sql` : **17 groupes PASS**, PostgreSQL natif **16.15** jetable, socket Unix seulement, propriétaire non-superuser. Deux connexions réelles pour quota et CAS fondateur ; réexécution sur tables remplies, audit read-only, ACL et altérations adverses.
- `verify-stripe-test` : **21 scénarios PASS**, PostgreSQL embarqué et fournisseur simulé. Aucun Stripe TEST/LIVE réel.
- Cinq scripts PASS : identité, autorisations alliance, isolation mobile, retrait roster, roster partagé.
- `npm run check`, `npm run build:web`, syntaxe et `git diff --check` : PASS. Build : 8 pages, 152 modules navigateur.

Deux erreurs SQL locales ont été détectées pendant la préparation (expression CASE et variable `tag` ambiguë), puis corrigées avant le passage natif final. Elles n'ont jamais été appliquées sur une base réelle.

## Encore non validé

Installation sur Supabase PostgreSQL 17, droits exacts du projet, e-mails/OTP/magic links, vrais JWT/RLS A/B, inscription réelle sans code, parcours Android/iPhone, pixels Last War, limites anti-abus Auth/CAPTCHA du fournisseur, sauvegarde réellement restaurable. Aucun Preview normal démarré.

Prochaine étape : revue/autorisation SQL TEST, puis essai réel isolé avec comptes fictifs sous accord séparé. Ni main, ni warboost.fr, beta.warboost.fr ou demo ne sont modifiés par cette préparation.
