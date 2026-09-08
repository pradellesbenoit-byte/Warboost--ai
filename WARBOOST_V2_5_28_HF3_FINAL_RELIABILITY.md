# WarBoost V2.5.28 HF3 — Final Reliability

## Cible

Correctif de finition de la **bêta publique sur invitation**. Il part exclusivement de **WarBoost V2.5.28 HF2 — Declared R4/R5 Access** et conserve tous ses garde-fous.

## Changements HF3

- Harmonisation des libellés de bêta publique dans les **23 langues explicites + Auto** : les anciens textes « bêta privée » ne doivent plus apparaître dans le parcours d’invitation/connexion/PRO.
- Activité Alliance : lorsqu’aucune preuve négative fiable n’existe et que des membres restent à actualiser, WarBoost affiche **Inactivité non évaluée** au lieu de prétendre qu’il y a `0 inactifs probables`.
- Plan de guerre IA :
  - roster entièrement périmé/incomplet -> plan tactique suspendu et Plan B d’actualisation ;
  - quelques membres actifs confirmés mais roster encore incomplet -> plan explicitement **partiel**, avec affectations limitées aux actifs confirmés ;
  - aucune affectation tactique n’est inventée pour les membres périmés ou inconnus.
- Plan B : correction du double comptage possible d’un membre `unknown` déjà inclus dans `refresh`.
- Le texte Alliance précise que les membres synchronisent les données **qu’ils enregistrent dans WarBoost** vers le roster WarBoost R5/R4. Aucune récupération automatique depuis Last War n’est suggérée.
- Exemple d’import français/Excel : `Joueur01;R4;30;65,2`.

## R4/R5 — règle HF2 conservée

- Rang Last War **R4 ou R5 déclaré** : accès aux outils de conseil Alliance (Plan de guerre IA / import roster).
- Rang déclaré R1–R3 : ces outils de conseil restent bloqués.
- Les **permissions sensibles WarBoost** (gestion des rôles/permissions d’autres membres, administration) restent vérifiées côté serveur et ne sont jamais accordées sur la seule déclaration du rang Last War.

## Safe Launch inchangé

- Bêta publique sur invitation uniquement.
- PRO inclus gratuitement pour les testeurs autorisés.
- Paiements WarBoost désactivés.
- Aucun accès direct au compte Last War.
- Aucune API Last War non autorisée.
- Aucun scraping.
- Aucune automatisation de gameplay.
- `api/ingest.js` et le provider externe restent verrouillés Safe Launch.

## Données / Supabase

- Aucune migration Supabase HF3.
- Ne jamais effacer `localStorage`, scans, escouades, Drone, Alliance, VS, Saison ou historique joueur.
- Les migrations déjà installées (support V2.5.24 et invitations V2.5.26) sont conservées telles quelles.
- La mise à jour HF3 ne doit jamais obliger un joueur à rescanner ses données.

## Validation

Les tests source/package doivent tous passer :

```bash
npm run check
npm run verify
```

Une validation réelle sur le Preview Vercel `public-beta-safe-launch` reste obligatoire avant de qualifier cette version de validée visuellement / end-to-end.
