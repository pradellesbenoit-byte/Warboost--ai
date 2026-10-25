# Ouverture FREE sans code — préparation locale, non publiée

## Source et statut

- Branche : `warboost-free-access-review-20261025`.
- Base commerciale : `14c500465b3ec32cb7b5c91dd055e2d250330a7d`, main vérifié au démarrage.
- Travail isolé dans `.local/warboost-free-access-review-20261025`, pas dans la branche des anciens commits privés.
- Ni push ni déploiement. Aucun compte, message, paiement ou appel IA réel.
- **NO-GO publication complète** : SQL additionnel non installé, démarrage de nouvelles alliances non vérifié, parcours réel non exécuté.

## Implémenté

1. Compte personnel FREE sans code : e-mail confirmé côté serveur + consentement existant, scoped par compte. Le header/version de consentement existant est conservé pour les sessions antérieures.
2. Le profil exige pseudo et serveur, mais pas d'alliance. Les validations/CAS et données d'escouades restent en place.
3. Le statut bêta par défaut du navigateur ne donne plus PRO. Les grants historiques, cohorte figée, révocations, abonnements TEST et contrôles serveur PRO sont conservés.
4. Scans FREE personnels : profil, escouades 1–4, drone, technologie, exclusives. Validation d'image avant consommation du quota. Réservation serveur atomique : 3/jour/compte, plafond FREE partagé 30/jour UTC. Un échec consomme la réservation, aucun retry fournisseur automatique. PRO acquis conserve le chemin antérieur et les protections d'abus existantes ; aucun nouveau PRO n'est attribué.
5. Les scans roster/autres analyses avancées et les conseils IA restent soumis aux droits PRO serveur. Le quota FREE est fail-closed : sans RPC installée, erreur explicite, pas d'appel Vision.
6. Adhésion sans code : demande fondée sur le profil cloud de l'acteur authentifié ; validation R4/R5/owner, identité canonique unique exacte, grade canonique connu, aucun changement d'alliance implicite, aucune adoption d'un compte déjà lié.
7. La validation SQL est atomique : roster, membership et demande ; verrou alliance puis demande, advancement de `roster_updated_at` pour CAS. Les marqueurs de retrait ne deviennent pas des adhésions.
8. Un serveur/tag saisi dans un profil ne permet plus à `getAllianceRoster` d'hydrater un roster et les profils privés d'une autre alliance. Une adhésion/propriété/association préexistante attestée est nécessaire.
9. UI : champs de code général supprimés ; demande d'adhésion et liste de validation ; erreurs sans fausse réussite ; l'ancien partage de code est intercepté, un ancien lien ne donne plus d'adhésion.
10. Assistance personnelle ouverte sans invitation ; activation de code général retirée (410), gestion historique admin conservée.
11. Les nouveaux textes FREE utilisent français/anglais et un fallback anglais explicite dans les autres langues. Ce n'est pas une traduction complète des nouveaux textes dans 22 langues.

## Blocages à ne pas masquer

- **Création d'une nouvelle alliance** : un roster ou grade saisi par son auteur n'est pas une preuve indépendante. Le bootstrap renvoie `ALLIANCE_MANAGER_VERIFICATION_REQUIRED`, sans écrire. La récupération d'espaces existants conserve les vérifications canoniques. Concevoir/revoir une attestation indépendante avant d'annoncer que tous les R4/R5 peuvent créer seuls leur espace.
- **SQL préparé seulement** : `supabase/migration_free_access_preparation.sql`. Trois nouvelles tables privées et fonctions réservées service_role. Aucun grant PRO, aucune donnée auth, aucun trigger auth.users, aucun changement de schéma existant.
- Il faut une revue séparée et une autorisation explicite pour installer sur TEST, avec project_id contrôlé par l'outil. Ne pas réappliquer les migrations opérateur précédemment installées. Ne pas installer en production sur la base de ce document.
- Sans ce SQL, les scans FREE et demandes/validations d'adhésion restent indisponibles (503). Inscription et sauvegarde personnelle ne nécessitent pas ces nouvelles tables.
- Vérifier sur TEST la compatibilité des types/contraintes, l'ownership des tables wb1 et les droits du rôle installateur, RLS/ACL effectives et suppression de compte. La fonction privée d'autorisation n'est pas exposée à authenticated/anon/service_role directement.
- La nouvelle demande n'effectue pas une réintégration d'un membre retiré ; un ancien approved sans membership exige une revue de réintégration. Les changements d'alliance ne sont pas automatiques.
- Les inscriptions automatisées multi-comptes exigent également les réglages Auth/rate-limits/CAPTCHA du fournisseur, non inspectés ni modifiés ici. Le plafond global FREE reste borné même après suppression de compte.
- Pas de preuve nouvelle des e-mails, OTP/magic-link, vrais JWT A/B, vraies RLS Supabase, Android, captures Last War ou sauvegarde réelle. Aucune inspection de données client/Secrets.
- Aucun prix ni paiement LIVE activé. Les 4,99 €/mois restent une intention.

## Vérifications exécutées

Exécution avec environnement vidé (`env -i`, PATH/HOME seulement et, si nécessaires, variables explicitement synthétiques). Les validations Node chargent `scripts/release/no-network.cjs`; les stubs remplacent fetch et ne transmettent rien au réseau.

- `node --test scripts/free-access.test.mjs` : **26 PASS, 0 FAIL**.
- `node scripts/verify-roster-scan-mobile.mjs` : **13 PASS, 0 FAIL**.
- `node scripts/verify-scan-handlers-mobile.mjs` : **19 PASS, 0 FAIL**.
- `node scripts/verify-precommercial-auth.mjs` : **18 PASS, 0 FAIL**.
- Total ci-dessus : **76 tests Node** ; DOM/états et réponses Auth/cloud simulés, pas de navigateur Android réel.
- `node scripts/verify-stripe-test.mjs` : **21 scénarios PASS**, PostgreSQL embarqué + faux fournisseur ; aucun appel Stripe TEST/LIVE réel.
- `node scripts/verify-free-access-sql.mjs` : **12 groupes PASS** sur **PostgreSQL natif 16.15 jetable**, socket Unix uniquement ; concurrence du quota avec deux connexions. Ni Supabase ni PostgreSQL 17 de TEST. Permissions testées avec propriétaire non-superuser.
- Cinq scripts supplémentaires PASS : `verify-identity-onboarding`, `verify-alliance-authorization`, `verify-mobile-auth-isolation`, `verify-alliance-roster-removal`, `verify-shared-alliance-roster`.
- `npm run check` PASS, `npm run build:web` PASS : 8 pages et 151 modules navigateur. Syntaxe des 3 nouveaux modules PASS ; `git diff --check` PASS.
- Les premières exécutions ont signalé des fixtures obsolètes : alliance obligatoirement non vide, utilisateur Auth fictif sans confirmation e-mail, attente de refus PRO sur un scan personnel vide. Elles ont été corrigées pour vérifier la nouvelle politique sans supprimer les contrôles négatifs. Le test natif a aussi exigé de représenter correctement l'ownership applicatif et les droits REFERENCES.

## Recette ultérieure, après approbation distincte

1. Revoir le SQL et le mécanisme de vérification du premier responsable ; ne pas prétendre que la création autonome d'une alliance est terminée.
2. Installer/inspecter uniquement sur WarBoost-Test après autorisation : RLS/ACL, quotas, compte sans alliance, deux scopes même tag/serveurs différents, adhésion approuvée/refusée, compte lié ailleurs, concurrence et suppression ciblée.
3. Tester email confirmé, reconnexion, quatre escouades et restauration avec comptes fictifs approuvés ; aucun compte réel ni nouvel appel Vision sans autorisation.
4. Valider l'interface Android sur origine HTTPS privée réellement isolée. Aucun Preview normal n'a été démarré.
5. Revoir le diff/SQL/risques puis obtenir un accord séparé avant toute production.

Rollback futur : désactiver les nouvelles opérations en gardant la sauvegarde personnelle FREE et les grants historiques ; ne pas effacer les nouvelles tables ou les données d'adhésion en cours pour « revenir en arrière ». Préparer une sauvegarde restaurable et un script de retour revu avant installation. Aucun rollback de données réel démontré ici.
