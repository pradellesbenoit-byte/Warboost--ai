# WarBoost V2.5.3 — Audit Completion

## Objectif
Terminer les points d’audit restant avant de fabriquer une branche Last War Demo séparée : persistance cloud/migrations, IA multilingue structurée, fonctions R5/R4, plan Joueur 7 jours et voix par grade.

## Changements principaux

### Persistance et migration
- sauvegarde locale de dernier état valide sous une clé stable ;
- protection avant connexion et après fusion cloud ;
- récupération locale si une lecture cloud vide ou une migration incomplète risque de faire disparaître les données visibles ;
- fusion protégée des membres Alliance ;
- détection explicite d’un schéma Supabase `wb1_*` absent ;
- migration SQL V2.5.3 idempotente, sans suppression de données.

### Diagnostic PRO / Joueur
- moteur IA aligné sur `2.5.3` ;
- règle V2.5.2 `Squad 1 first` conservée ;
- plan Joueur 7 jours structuré ;
- politique `relative-priority-only` et `exact_quantities:false` ;
- aucun affichage brut d’une copie IA anglaise pour les langues non natives : fallback structuré localisé.

### Alliance R5/R4
- import manuel de roster CSV/Excel ;
- fusion par nom sans suppression d’anciens membres ;
- conservation des membres manuels lors d’un refresh roster cloud ;
- plan de guerre structuré : rally, défense, mobile, réserve ;
- Plan B : refresh / défensif / stable selon la fiabilité des données ;
- modification de rôle d’un membre cloud depuis le roster, réservée au R5 vérifié côté interface et contrôlée côté API.

### Multilingue
- 23 choix explicites + Auto ;
- couche structurée V2.5.3 pour priorités Joueur, Alliance, VS, Saison ;
- statuts d’activité Alliance et messages de fiabilité complétés ;
- types Avion / Char / Missile localisés dans le contexte adaptatif ;
- Boutique IA non native masque les raisons/targets serveur non localisés et conserve les données numériques/observées utiles.

### Voix
- réglage voix dans le compte ;
- préférence persistante et activation/désactivation ;
- salutation au premier accès Joueur/Alliance ;
- salutation française par grade et annonce du rôle localisée pour les autres langues.

## Non-régression attendue
V2.5.3 conserve la permutation V2.5.1, la priorité Escouade 1 V2.5.2, la mémoire héros par identité, les 31 héros, les armes exclusives, la récupération historique, Saison 6 Awakening/Reshape, Boutique IA, VS, Saison, Scan et les protections anti-invention.

## Limite volontaire
Cette build ne prouve pas qu’un déploiement Vercel/Supabase de production est opérationnel : les vérifications fournies sont des contrôles de code et d’exécution locale. La migration Supabase doit être appliquée à tout environnement qui ne possède pas encore les tables `wb1_*`.

L’accès officiel Last War reste en attente d’autorisation ; aucun accès non autorisé n’est ajouté.
