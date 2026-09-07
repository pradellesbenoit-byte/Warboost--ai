# WarBoost V2.5.28 — Public Beta Safe Launch + Activity Events

WarBoost V2.5.28 conserve toutes les protections de la V2.5.27/HF2 et ajoute un suivi d’activité Alliance sans captures répétées.

## Nouveauté principale

Le joueur confirme en un appui sa participation réelle à VS, Zombie, Maraudeur, Événement d’alliance, Guerre ou Saison. Ces confirmations alimentent l’activité Alliance et le Plan de guerre IA.

WarBoost ne prétend pas recevoir ces participations depuis Last War : ce sont des confirmations joueur clairement identifiées. L’absence de confirmation n’est jamais une preuve d’inactivité.

## Rangs

Le rang Last War R1–R5 peut être déclaré par le joueur. Il est distinct du rang de gestion WarBoost vérifié : une déclaration R5 ne débloque pas automatiquement les droits d’administration.

## Safe Launch

- Bêta sur invitation.
- PRO inclus gratuitement pendant la bêta.
- Paiements WarBoost désactivés.
- Aucun accès direct au compte Last War.
- Aucune API Last War non autorisée.
- Aucun scraping.
- Aucune automatisation de gameplay.
- WarBoost reste indépendant de FUNFLY / Last War: Survival.

## Données et migration

Les données joueur existantes sont conservées. Les confirmations d’activité utilisent le profil JSON WarBoost existant : **aucune migration Supabase V2.5.28**. La bêta sur invitation continue toutefois d’utiliser la migration déjà appliquée `supabase/migration_v2_5_26_beta_invites.sql` (à ne pas relancer si elle est déjà en place).

## Fiabilité Scan conservée

La V2.5.28 conserve les correctifs V2.5.27/HF1/HF2 : ordre confirmé des héros, identité sûre, aucun transfert de données entre héros, correction `gearx`, équipements propres, 4 niveaux/raretés lorsque visibles et vrais niveaux 0 conservés.

## Vérification

Exécuter :

```bash
npm run check
npm run verify
```

Le contrôle couvre les 12 fonctions Vercel, le Scan, l’activité événementielle, la séparation rang déclaré / permission vérifiée, les invitations, le support, la récupération de mot de passe, la préservation des données, les 23 langues explicites + Auto et les verrous Safe Launch.

Version 2.5.28 · 7 septembre 2026.
