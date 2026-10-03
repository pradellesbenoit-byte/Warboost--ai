# Renommage Last War sécurisé — 2026-10-03

## Interface

Alliance R5/R4 → Membres → groupe R1–R5 → carte du membre → **Modifier le pseudo**.
L’action est aussi disponible dans la fiche ouverte en touchant un joueur
dans un événement.

L’ancien pseudo est en lecture seule. Le nouveau champ est limité à 80 caractères.
Une case confirme explicitement qu’il s’agit du même joueur, puis le bouton
**Confirmer le renommage** enregistre. Annuler ne modifie rien. Les erreurs de
doublon, identité ambiguë, droits ou conflit cloud ne produisent aucun renommage
local optimiste. Un résultat réseau incertain invite à recharger, sans prétendre
qu’aucune écriture serveur n’a eu lieu.

## Identité et persistance

- L’action réutilise l’API Alliance existante et son autorisation canonique.
  Le rôle déclaré par le navigateur n’est jamais une permission.
- Le serveur choisit une seule ligne du roster canonique par sa clé persistée,
  vérifie le pseudo attendu et le périmètre alliance/serveur.
- La clé existante reste opaque et stable. Un identifiant interne immuable est
  ajouté au premier renommage ; il n’est plus recalculé depuis le pseudo.
  Le `player_id`, le lien de compte, le rang et le périmètre restent inchangés.
- La ligne entière est conservée. Le pseudo et son audit sont écrits ensemble
  par la comparaison de révision existante du roster cloud. Une écriture
  concurrente refuse l’opération entière, sans audit partiel.
- L’audit comprend ancien/nouveau pseudo, auteur authentifié et date.
- Aucun transfert de compte, aucune fusion d’orphelins, aucun nouvel utilisateur.
  Un nom actif déjà utilisé, une ancienne identité concurrente ou un compte
  distinct portant le nom demandé bloque l’opération.
- Les noms courants sont projetés depuis le roster canonique sur les fiches,
  événements, plans, disponibilités et associations. Les références de sélection
  restent stables. Les scans/snapshots et les journaux historiques ne sont pas
  réécrits.
- Les synchronisations protègent les noms et audits canoniques contre les
  métadonnées fournies par le client. Une date générique de profil plus récente
  ne peut pas annuler un renommage confirmé.
- La réponse UI est appliquée uniquement au compte, serveur et alliance ayant
  lancé l’action. Une réponse tardive ne contamine pas un autre compte.

Pas de migration de base, de nouvelle fonction API, de push ni de publication.
Branche de travail : `public-beta-safe-launch`, sans modification de la branche
`demo-lastwar-presentation`.

## Vérifications automatisées

`npm run check`, `npm run verify` (incluant `test:member-rename`) et les suites
d’autorisation Alliance, accès canonique R4, persistance/anti-retour des grades,
roster partagé, canonicalisation de restauration et liaison d’identité passent.

La nouvelle suite exécute le véritable gestionnaire API avec dépendances hors
réseau : autorisation R4/R5, refus R1 malgré un rôle R5 déclaré, mauvais périmètre,
confirmation requise, doublon, pseudo attendu périmé, conflit de révision et audit
atomique. Elle couvre conservation de l’identité/rang/liens/historique/scans,
projection des noms, rechargement JSON, ancien cloud dans les deux sens de merge,
imports ultérieurs et aucune fusion d’un compte ou d’un orphelin concurrent.

Les commandes de vérification désactivent Supabase uniquement dans leur
sous-processus. Les secrets et la configuration du projet ne sont pas modifiés.

## Vérification navigateur

Passage à 390×844 en français, sur données synthétiques et API simulée :

- R5 et R4 vérifiés : action présente ; R1 : action absente et avertissement.
- Ancien pseudo en lecture seule, annulation sans requête ni changement.
- Confirmation non cochée : validation native bloque, aucune requête.
- Doublon : refus 409, erreur lisible, identité et révision inchangées.
- Renommage réussi : compte lié, identifiants, R2, puissance et total de
  32 membres conservés ; un audit ajouté ; pseudo courant visible dans le roster.
- Fermeture/réouverture et rechargement du même onglet : nouveau pseudo conservé.
- Fusion de l’ancien état : 32 membres / 32 clés uniques, aucun retour de nom.
- Présentation mobile du dialogue inspectée, sans débordement horizontal.

Limites : la fixture n’a pas rendu de participants actifs dans les plans
Désert/Canyon et certains enregistrements synthétiques de participation ont été
normalisés vides. Leur conservation avec des données valides, ainsi que le nom
dans les véritables moteurs/rendus Désert/Canyon/VS/Saison, sont vérifiés par la
suite automatisée. L’isolation d’une réponse tardive est testée en exécutant le
véritable callback UI avec un changement de compte, puis d’alliance.

Aucune validation sur un compte réel ni écriture dans la base cloud réelle.
La procédure vérifie le code local ; elle ne certifie pas une publication.