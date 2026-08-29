# WarBoost V2.5.3 — Audit Completion

WarBoost V2.5.3 termine les points de fiabilité identifiés avant la fabrication d’une **Last War Demo séparée**. Cette version continue directement V2.5.2 et conserve sa règle essentielle : **si l’Escouade 1 contient des données, elle reste l’escouade principale choisie**, même lorsqu’une escouade secondaire affiche une puissance supérieure.

## Ce que V2.5.3 ajoute

### 1. Données joueur protégées pendant les migrations / reconnexions
- la clé de données principale reste `warboost_v1_core_state` afin de ne pas casser les sauvegardes existantes ;
- une copie stable `warboost_last_good_state` est maintenue avant/après les opérations sensibles ;
- la reconnexion WarBoost protège l’état local avant de lire le cloud ;
- une réponse cloud vide ne remplace pas un compte local déjà renseigné ;
- les listes Alliance locales/cloud sont fusionnées sans effacer les membres importés manuellement ;
- l’absence des tables `wb1_*` est détectée explicitement comme `database_schema_missing` ;
- `supabase/migration_v2_5_3.sql` crée les tables manquantes de façon idempotente, sans `DROP TABLE`, `TRUNCATE` ni `DELETE FROM`.

### 2. IA structurée multilingue
WarBoost garde les copies IA détaillées natives lorsqu’elles existent et utilise une couche structurée locale pour les autres langues afin d’éviter d’afficher par défaut un long texte IA anglais. Les priorités Joueur, les groupes Alliance, le VS, la Saison, les statuts d’activité et les types d’unité sont couverts dans les **23 choix de langue explicites** (22 familles linguistiques avec en-GB et en-US séparés), plus Auto.

### 3. Plan Joueur 7 jours
Le Diagnostic PRO renvoie maintenant un plan de 7 jours : priorité principale, priorité secondaire, mesure de progression, alignement Boutique, timing VS et revue hebdomadaire. Le plan applique une règle de sécurité : **aucune quantité exacte de fragments ou matériaux n’est inventée** lorsque WarBoost ne possède pas de source fiable.

### 4. R5/R4 complété
- import de roster par copier-coller CSV/Excel (`nom, grade, QG, puissance`) ;
- fusion sans suppression des membres cloud existants ;
- les membres manuels survivent à une actualisation du roster cloud ;
- plan de guerre structuré en **rally, défense, groupe mobile et réserve** ;
- **Plan B** selon fraîcheur/activité des données ;
- modification d’un grade membre exposée uniquement au R5 vérifié lorsqu’un `player_id` cloud existe ;
- l’IA ne supprime jamais automatiquement un membre incertain : elle demande d’abord une actualisation.

### 5. Voix par grade
Une salutation vocale est disponible à la première ouverture Joueur / Alliance, avec sélection de voix du navigateur, activation/désactivation persistante et test manuel. En français, la formulation distingue R5, R4, R3, R2 et R1 ; dans les autres langues la salutation est localisée et annonce le grade WarBoost.

## Garanties conservées de V2.5.2
- Escouade 1 prioritaire lorsqu’elle est renseignée ;
- permutation atomique de deux escouades complètes ;
- données héros attachées à l’identité et non à la position ;
- 31 héros dans la source d’identité partagée ;
- Scan/OCR, Drone, armes exclusives, Boutique IA, VS, Saison et Alliance conservés ;
- Saison 6 Awakening / Reshape et contexte adaptatif conservés ;
- aucune intégration Last War non autorisée.

## Vérification locale

```bash
npm run check
npm run verify
```

`npm run check` contrôle la syntaxe de l’application, des 12 fonctions API et des bibliothèques critiques. `npm run verify` exécute les tests de non-régression V2.5.3 : escouade principale, plan 7 jours, Alliance R5/R4, VS/Saison, migration de données, schéma cloud manquant, import roster, multilingue structuré, catalogue héros et garde-fous d’autorisation.

## Supabase
Si un environnement de test plus ancien ne possède pas les tables `wb1_*`, exécuter **une fois** le contenu de :

`supabase/migration_v2_5_3.sql`

Le script est conçu pour pouvoir être relancé sans effacer les lignes existantes.

## Accès Last War
L’intégration officielle Last War / FirstFun reste **en attente d’autorisation**. V2.5.3 continue avec les scans fournis volontairement, la saisie/import WarBoost et le cloud WarBoost autorisé. Elle ne contourne pas le jeu et ne demande pas de token joueur Last War.

## Étape suivante
Après validation de V2.5.3 sur la branche de test, la **Last War Demo** doit être fabriquée séparément, sans toucher à `main`, avec une configuration de démonstration stable et uniquement des fonctions déjà fiabilisées.
