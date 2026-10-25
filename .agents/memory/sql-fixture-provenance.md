---
name: Provenance des fixtures SQL
description: Les tests natifs doivent refléter le catalogue audité, pas des types d'identité supposés.
---

Les fixtures SQL doivent être dérivées des preuves de catalogue disponibles,
notamment les types des identifiants et les véritables clés de conflit.
Un test PostgreSQL natif réussi sur un schéma inventé ne prouve pas une
compatibilité Supabase.

**Why:** Une fixture native précédente utilisait des clés joueur UUID et une
unicité globale d'adhésion absentes du schéma TEST ; elle masquait des erreurs
de FK, de comparaison et de cible ON CONFLICT lors de l'installation réelle.

**How to apply:** Reproduire les contraintes constatées sans convertir les tables
existantes. Distinguer les faits audités des colonnes/politiques encore inconnues,
ajouter des refus préalables et vérifier le rejeu de toute la chaîne. Indiquer
la version PostgreSQL locale, qui ne vaut pas preuve d'exécution Supabase.
