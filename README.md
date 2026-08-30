# WarBoost V2.5.11

## Season UI Final Reliability

V2.5.11 finalise l’interface Saison après la correction du cycle de vie V2.5.10. Le moteur Saison, les données cloud et les règles de recommandation restent inchangés.

### Correction visuelle

- Saison active : le résumé affiche **Profession** et la section affiche **Progression**.
- Saison terminée / entre-saisons : le résumé affiche **Dernière profession** et la section affiche **État de saison**.
- `Chef de guerre`, ou toute autre profession enregistrée, reste une donnée historique et n’est jamais présentée comme une profession active hors saison.
- La progression reste non applicable en entre-saisons ; aucun faux `0 %` n’est réintroduit.
- Les nouveaux libellés suivent les **23 choix de langue explicites** de WarBoost, plus Auto.

### Non-régression conservée

V2.5.11 conserve l’intégralité des protections V2.5.10 et antérieures : cycle Saison active/terminée/entre-saisons/inconnue, absence de progression jamais convertie en 0 %, aucun conseil S6 actif hors saison, Escouade 1 principale, Plan Joueur 7 jours, Boutique IA Pertinence/Confiance/Disponibilité, Alliance R5/R4, VS dimanche avec reset UTC−2, 31 héros, Scan/OCR, cloud et sauvegarde des données joueur.

### Supabase

**Aucune migration Supabase n’est requise en V2.5.11.** Cette version ne change ni le schéma ni les données Saison : elle corrige uniquement leur présentation dans l’interface.
