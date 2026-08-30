# WarBoost V2.5.11 — Season UI Final Reliability

## Corrigé

- Saison active : libellé `Profession` conservé.
- Saison terminée / entre-saisons : libellé dynamique `Dernière profession`.
- Saison active : titre `Progression` conservé.
- Saison terminée / entre-saisons : titre dynamique `État de saison`.
- Les libellés changent aussi après un changement de langue sans rechargement de page.
- Traduction du libellé historique dans les 23 choix de langue explicites.

## Inchangé volontairement

Le moteur V2.5.10 n’est pas modifié : progression inconnue ≠ 0 %, lifecycle active/terminée/entre-saisons/inconnue, ancienne profession historique, conseils S6 désactivés hors saison, et données joueur protégées.

## Données

Aucune migration Supabase. Aucun changement de schéma. Aucun effacement ou réécriture de données joueur requis.
