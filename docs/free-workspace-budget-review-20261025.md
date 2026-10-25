# Ouverture autonome et budget FREE — préparation locale

**Correctif de compatibilité du schéma réel :** voir
[free-schema-text-compatibility.md](free-schema-text-compatibility.md).
Les nombres ci-dessous décrivent l'intervention précédente, pas une validation
de Supabase : sa fixture UUID a masqué les clés TEXT et la PK composite réelles.

Suite de `9db63ddcaf9f31e47a87a0007b0027e0ef7cb3c6`, sur
`warboost-free-access-review-20261025`. Aucun SQL Supabase appliqué, aucune
inscription, aucun appel Vision/Stripe, aucun changement des sites.

## Ce qui fonctionne dans les tests locaux

- Compte personnel FREE sans code, alliance facultative, e-mail confirmé et
  consentement requis. Les droits PRO historiques restent indépendants.
- Dans Compte : créer/retrouver un brouillon privé, enregistrer son roster,
  puis ouvrir explicitement l'accueil de l'espace WarBoost neuf.
- L'espace est unique par serveur + tag normalisé, privé et distinct des
  anciennes alliances canoniques. Son propriétaire fondateur n'est PAS
  authentifié comme R4/R5 Last War. Il ne reçoit aucun droit canonique ni PRO.
- Le membre demande l'accès à l'espace de son profil enregistré ; le fondateur
  approuve un pseudo présent une seule fois dans son roster. L'adhésion reste
  une autorisation WarBoost, pas une certification d'identité du jeu.
- Seuls le fondateur et les membres acceptés peuvent lire ce roster partagé.
  Les autres profils, anciennes alliances, rangs et données privées ne sont
  jamais importés ou ouverts par ce mécanisme.
- Le fondateur peut refuser/révoquer un accès ; une suppression silencieuse
  d'un pseudo encore accepté est refusée. Modifier le profil ne permet pas de
  transporter l'accès dans un autre serveur/tag. I, l et 1 restent distincts.
- Sans API officielle Last War, impossible de certifier la propriété d'une
  alliance réelle. Un premier créateur peut utiliser un tag non revendiqué
  dans WarBoost, sans preuve de son rang dans le jeu : c'est une gouvernance
  d'espace neuf explicitement non officielle, jamais une reprise de l'existant.
  Les litiges de propriété et transferts restent à traiter séparément.

## Installation proposée — validation obligatoire avant toute écriture distante

Sur WarBoost-Test seulement, avec outil admin explicitement ciblé
`zaioadmbhqzeihkvdjsd`, sous autorisation distincte :

1. Revoir/appliquer `supabase/migration_free_access_preparation.sql`.
2. Revoir/appliquer `supabase/migration_free_workspace_budget.sql`.
3. Lire `supabase/audit_free_access_preparation.sql`, puis
   `supabase/audit_free_workspace_budget.sql`.

Ces deux migrations d'accès libre n'ont PAS encore été installées. Ne pas
réappliquer les anciennes migrations du banc opérateur staging.
Le SQL ne prouve pas à lui seul l'identité du projet : le ciblage de l'outil
doit la garantir. Production non autorisée. Droits réels Supabase et sauvegarde
restaurable doivent être vérifiés avant installation.

Tables et RPC privées : RLS, absence d'accès direct client/service_role, droits
EXECUTE limités au backend, SECURITY DEFINER/search_path et propriétaire
contrôlés. Le trigger supplémentaire porte uniquement sur le brouillon privé,
jamais sur auth.users. Ni DROP/TRUNCATE de données, ni changement PRO, ni
membership canonique. Les réexécutions conservent données et budgets ajustés.
Le seul remplacement de CHECK retire l'ancien plafond structurel 30 du
compteur : une vérification de non-négativité demeure et la RPC impose le budget.
Les RPC utilisent des verrous et des CAS ; les timeouts de migration ne
configurent pas automatiquement les timeouts des futures requêtes PostgREST.

## Budget et anti-abus

Valeurs initiales : **3 réservations/joueur/jour, 30 globales/jour,
10/réseau/jour**, UTC. Elles sont conservatrices, non illimitées et modifiables
sans redéploiement par un administrateur SQL uniquement :

```sql
-- EXEMPLE A REVOIR ; jamais exécuté automatiquement.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '4s';
update public.wb1_free_budget_policy
set per_account = 3, global_daily = 30, per_ip = 10,
    enabled = true, updated_at = clock_timestamp()
where singleton;
commit;
```

L'audit affiche la politique et les compteurs globaux, sans identité ni IP.
`enabled=false` ferme les nouvelles réservations FREE. Abaisser une limite
sous la consommation courante bloque les suivantes sans remettre les compteurs
à zéro ; une requête déjà réservée peut terminer.

C'est un **budget de réservations de scans FREE**, pas une garantie monétaire
en euros : coût variable selon images/modèle, pas de plafond PRO ajouté ici.
Le budget fournisseur et les protections PRO existantes restent nécessaires.
Une réservation est consommée avant Vision, même si l'analyse échoue, sans
remboursement/répétition automatique. La suppression d'un compte ne remet à
zéro ni le compteur global ni celui du réseau.

Une future installation doit configurer un secret serveur dédié
`WARBOOST_FREE_IP_HASH_SECRET` (minimum 32 caractères) via le gestionnaire de
Secrets, jamais Git/chat. Aucun Secret n'a été créé ou lu ici. Sans lui ou sans
IP fiable : refus 503 avant réservation/IA. Empreinte HMAC journalière, pas
d'adresse IP brute stockée. Sur Vercel, utilisation du header de plateforme
`x-vercel-forwarded-for` ; les headers/body arbitraires sont ignorés.
Sur serveur direct, adresse de socket seulement. Un proxy non qualifié n'est
pas implicitement approuvé. Prévoir une rétention/purge des compteurs
pseudonymisés et adapter les limites pour les réseaux partagés ; VPN/rotation
d'adresses et créations multi-comptes nécessitent aussi l'anti-abus Auth.

## Preuves locales et limites

- `node --test scripts/free-access.test.mjs scripts/free-workspace.test.mjs` :
  **42 PASS, 0 FAIL**, dont vrais handlers extraits sous DOM/VM simulé,
  approbations, affichage texte sûr, compte A/B, FREE/PRO et quatre escouades.
- `verify-free-access-sql` : **25 groupes PASS**, PostgreSQL natif local
  jetable, propriétaire non-superuser. Deux connexions pour quotas, CAS et
  course édition/approbation. Tests de refus, réexécution, RLS/ACL et audit.
- `verify-roster-scan-mobile` : **13 PASS** ;
  `verify-precommercial-auth` : **18 PASS**.
- `verify-identity-onboarding`, `verify-alliance-authorization`,
  `verify-mobile-auth-isolation` : **PASS**.
- `verify-stripe-test` : **21 scénarios simulés PASS**, aucun Stripe externe.
- `npm run check`, `npm run build:web` : PASS, 8 pages / 152 modules.

Environnements vidés, variables synthétiques et bloqueur réseau pour Node.
PostgreSQL local via socket Unix uniquement. Les premiers passages ont
identifié une fixture supprimée par un test précédent, trois tests lancés sans
leurs variables synthétiques et une collecte stdout trop tôt sur `exit` :
corrections effectuées, collecte sur `close`, timeouts des sous-processus.
Ces échecs ne sont pas des validations Supabase et ne sont pas cachés.

Non validés : installation Supabase/PostgREST réelle, e-mails, nouveaux vrais
JWT, parcours Android/iPhone et restauration réelle. Les changements ne sont
donc pas déclarés prêts à être activés en production.

## GitHub sans mise en ligne

Seule cette branche de préparation est destinée au push, jamais main ni
l'historique privé des 54 commits. `vercel.json` désactive
`git.deploymentEnabled` pour son nom exact. Le message du nouveau commit porte
aussi `[skip vercel]`. Aucun workflow GitHub de déploiement n'est inclus.
Cette protection ne certifie pas l'absence d'une automation externe inconnue ;
ne pas créer de PR/merge ni de déploiement manuel. Le statut réel du push est
rapporté séparément après la tentative.

## Retour arrière

Ne pas supprimer les espaces, adhésions ou compteurs pour revenir en arrière.
Fermer le budget (`enabled=false`) et révoquer de façon supervisée EXECUTE des
RPC nouvelles, après contrôle des transactions en cours ; conserver les tables
et l'audit. La signature historique de quota est volontairement fail-closed :
un ancien backend ne doit pas contourner la nouvelle protection réseau.
Toute restauration et toute suppression de compte propriétaire restent à
préparer avec les dépendances des espaces (FK empêchant leur perte silencieuse).
