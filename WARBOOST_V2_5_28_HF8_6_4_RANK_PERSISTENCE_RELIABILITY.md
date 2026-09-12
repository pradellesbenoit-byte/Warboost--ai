# WarBoost V2.5.28 HF8.6.4 — Rank Persistence Reliability

## Correctifs
- Les changements de grade R1/R2/R3/R4 sont écrits dans le roster canonique de l’alliance avant toute resynchronisation cloud.
- Une resynchronisation ne peut plus réafficher immédiatement l’ancien grade simplement parce que le roster serveur n’avait pas encore été mis à jour.
- L’interface Alliance est redessinée immédiatement après confirmation : lignes, compteurs et historique reflètent le nouvel état sans rechargement manuel.
- Les changements groupés sont appliqués comme un lot et la limite de 10 R4 est contrôlée côté serveur.
- Le R5 reste protégé et séparé.
- Les permissions WarBoost des comptes liés continuent à être ajustées uniquement pour le statut R4 ; rollback en cas d’échec.

Aucune migration Supabase n’est requise.
