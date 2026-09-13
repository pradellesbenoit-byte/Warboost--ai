WarBoost V2.5.28 — Patch HF8.6.9 Canonical Roster Guard

BUT
- Empêche /api/state de réécrire un ancien rôle du téléphone par-dessus le roster ALL4 canonique.
- Réapplique le roster canonique lors d'un GET et avant chaque POST de l'état joueur.
- Conserve les données WarBoost liées au joueur et les statuts de cycle de vie R5/R4.
- Ne touche pas aux scans, héros, escouades ou données Joueur.

INSTALLATION
1. Décompresser ce ZIP.
2. Sur la branche public-beta-safe-launch, remplacer uniquement api/state.js par celui de ce patch.
3. Committer le fichier. Vercel doit ensuite redéployer automatiquement la branche bêta.
4. Fermer complètement WarBoost puis le rouvrir, ou relancer Synchroniser WarBoost.

NOTE
ToyN a déjà été réparé directement dans Supabase avant création de ce patch : son entrée roster est R4. Une sauvegarde des états précédents a été créée dans wb1_snapshots avec la source hf8.6.9-pre-toyn-roster-repair.
