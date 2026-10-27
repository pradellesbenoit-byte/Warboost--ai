# Technologie manuelle — préparation locale du 27 octobre 2026

## Emplacement et périmètre

- Worktree : `/home/runner/workspace/.local/warboost-free-access-review-20261025`
- Branche : `warboost-free-access-review-20261025`
- Base inchangée : `136a401f1365812044ab6e926fa3caf68723410c`
- Pas de commit, push, déploiement, serveur, compte ou requête externe.
- La racine Replit reste sur son autre branche, sans modification.

## Fonctionnement

Rubrique autonome repliable « Technologie » sous Joueur, sans paywall PRO,
sans scan ni IA. Dix-huit branches existantes : les dix-sept demandées plus
Arme tactique. Noms, états, actions et erreurs dans les vingt-deux langues ;
arabe RTL, labels explicites, champs pleine largeur et cibles tactiles.

Chaque branche possède ses actions Enregistrer / Annuler. États : non renseigné,
pourcentage réel 0–100 inclus, niveau max sans pourcentage, verrouillée avec
prérequis facultatif. Une donnée manquante n'est jamais présentée comme 0 %.
Les anciennes valeurs numériques dont la correspondance est certaine restent
visibles ; `type_mastery_pct`, ambigu, n'est pas attribué à une spécialisation.

Une édition ne modifie que sa branche. Provenance `source: manual` et date
`confirmed_at` conservées dans l'état propre au joueur, et affichées. Le choix
non renseigné devient une observation manuelle datée `unknown`, afin qu'une
ancienne capture / sauvegarde ne restaure pas le pourcentage effacé.
Une valeur illisible de scan ne reçoit pas cette autorité d'effacement.

Le brouillon reste uniquement en mémoire, sans modification avant Enregistrer.
Annulation sans sauvegarde, changement de compte ou verrouillage de l'espace :
le brouillon est jeté. Pas de multiplication des gestionnaires après reconnexion.
Une modification concurrente de la même branche refuse la sauvegarde et demande
d'annuler puis de reprendre ; les autres catégories sont conservées.
Les repaints conservent la saisie/focus, le changement de langue conserve les
valeurs du brouillon. Les valeurs injectées sont échappées.

La sauvegarde utilise `saveState` et les mécanismes cloud existants. L'état est
explicitement marqué en attente ; le message cloud confirmé dépend du succès
déjà constaté par le mécanisme existant et du même compte, jamais du clic.
Une erreur locale conserve la saisie et restaure l'état précédent en mémoire.
Un profil contenant uniquement une branche technologique, même effacée
explicitement, est désormais reconnu comme non vide pour sauvegarde/récupération.
Les trois nouveaux modules sont inclus dans la coque PWA hors ligne.

## Vérifications hors réseau

Préchargement `scripts/release/no-network.cjs`, environnement effacé et uniquement
fausses valeurs pour les dépendances des tests historiques. Aucun secret réel lu.

- Nouveau fichier `scripts/technology-manual.test.mjs` : **49 tests** :
  dix-huit branches, vingt-deux locales, contrôleurs réels avec DOM minimal,
  validation/annulation, vrais 0 et 100, max/verrouillé, provenance, comptes,
  conflits, effacement durable, anciens formats, récupération, masque privé,
  statut local/cloud, stockage défaillant, drone/armes DVA/escouades intacts.
- Suite pertinente : **229 PASS / 0 FAIL / 0 ignoré**, treize fichiers :
  nouveau fichier, régression Technologie/portraits précédente, technologie
  centre et scans, drone, handlers mobiles, cibles d'escouades, puissance héros,
  revue/markup, restauration compositions, transition V1 et Vision contrôlé.
- Première passe : deux erreurs du nouveau faux DOM, car son `contains(null)`
  retournait à tort vrai ; fixture corrigée pour correspondre au DOM réel.
- Test historique additionnel `verify-v2.5.28-hf8-6-12.mjs` : **FAIL** sur
  cinq noms non confirmés attendus actifs par sa vieille fixture. Même échec
  reproduit avec le module de récupération du commit de base : préexistant,
  non corrigé ni masqué dans cette intervention. Cette suite n'est pas comprise
  dans les treize fichiers verts ci-dessus.
- `npm run check` : PASS.
- `npm run build:web` : PASS, huit pages, 160 modules navigateur.
- Aucun essai Android/iPhone réel, navigateur interactif, reconnexion Supabase
  réelle, migration SQL ou restauration réelle. Aucun scan sur pixels utilisateur.

Commandes de la suite pertinente :

```
node --require ./scripts/release/no-network.cjs --test --test-reporter=tap \
 scripts/technology-manual.test.mjs \
 scripts/scan-technology-portrait-regression.test.mjs \
 scripts/verify-technology-center.mjs scripts/verify-technology-scan.mjs \
 scripts/verify-drone-scan.mjs scripts/verify-scan-handlers-mobile.mjs \
 scripts/verify-squad-scan-targets.mjs scripts/verify-hero-power-sync.mjs \
 scripts/verify-scan-review.mjs scripts/verify-scan-review-markup.mjs \
 scripts/verify-squad-confirmed-restore.mjs \
 scripts/release/verify-v1-transition.mjs scripts/controlled-vision.test.mjs
```

## Décision

Préparation locale pour relecture, pas une validation cloud ou Android réelle.
Ne pas pousser ni publier sans revue et accord. La campagne Vision terminée
4/4 reste désactivée ; aucun compteur, flag, secret, paiement, compte ou schéma
ne change. Main, la démo, les grades et les espaces d'alliance restent hors périmètre.
