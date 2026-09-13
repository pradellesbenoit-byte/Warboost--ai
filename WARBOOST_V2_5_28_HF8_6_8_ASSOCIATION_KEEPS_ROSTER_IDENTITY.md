# WarBoost V2.5.28 HF8.6.8 — Association Keeps Roster Identity

## Problème réel corrigé
Après « Vérifier l’association », un compte WarBoost pouvait être correctement associé au membre du roster mais un ancien rang déclaré dans le profil cloud pouvait remplacer le rang canonique Last War. Exemple observé : le roster ALL4 contient `ToyN` R4 alors que l’ancien profil WarBoost `[ALL4]ToyN` déclarait R5. Le membre pouvait alors quitter visuellement le groupe R4 et donner l’impression d’avoir disparu.

## Règle HF8.6.8
- Le roster canonique Last War reste l’autorité pour le pseudo et le grade R1–R5.
- Une association WarBoost ajoute `player_id`, données de progression, puissance d’escouade, drone et historique d’activité sans changer le grade canonique.
- Un ancien rang déclaré dans le compte WarBoost ne peut plus déplacer ni masquer un membre.
- Le statut de membre et son historique de présence restent ceux du roster.
- Les correspondances `[ALL4]ToyN` ↔ `ToyN` de HF8.6.7 sont conservées.
- Aucune donnée n’est supprimée et aucune migration Supabase n’est nécessaire.
