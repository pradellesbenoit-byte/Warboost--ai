# WarBoost V2.4.7 — Hero Identity Memory

WarBoost V2.4.7 ajoute un registre persistant de progression par héros afin que les données restent attachées à l’identité du héros lorsqu’il change d’escouade.

## Ce que corrige V2.4.7

- niveau, étoiles, puissance, arme exclusive, équipement et Éveil suivent le héros ;
- aucun champ ne suit une position 1–5 ;
- un héros déplacé n’est pas dupliqué dans deux escouades ;
- un scan partiel n’efface pas les champs non lus ;
- le registre est sauvegardé dans l’état WarBoost local/cloud via le JSON existant, sans modification du schéma Supabase ;
- « Mis à jour il y a À l’instant » devient « Mis à jour à l’instant » et l’équivalent est traduit dans toutes les langues de l’interface.

## Prudence sur les anciennes données

V2.4.7 conserve et protège les valeurs encore disponibles au moment de la migration. Une ancienne valeur déjà supprimée par une version précédente n’est pas reconstruite artificiellement : elle doit être confirmée par un nouveau scan/donnée Last War.

## Garanties conservées

- 31 héros / 31 portraits ;
- Diagnostic PRO et paliers EX 10/20/30 ;
- Saison 6 Awakening / Reshape ;
- Boutique IA ;
- Alliance R5/R4 ;
- 22 langues + variantes anglais UK/US ;
- architecture indépendante, API-ready et sans accès Last War non autorisé.
