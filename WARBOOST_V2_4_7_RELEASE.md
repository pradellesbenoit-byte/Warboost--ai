# WarBoost V2.4.7 — Hero Identity Memory

## Correctif principal

V2.4.7 termine le correctif de changement d’escouade commencé en V2.4.5/V2.4.6.

WarBoost possède maintenant un **registre persistant par identité de héros** (`hero_profiles`). Les données d’un héros ne dépendent plus de son numéro d’escouade ni de sa position 1–5.

Exemple : si Kimberly passe de l’Escouade 1 à l’Escouade 2, son niveau, ses étoiles, son EX, sa puissance, son équipement et son Éveil restent attachés à Kimberly. Le même principe s’applique à tous les héros reconnus par WarBoost.

## Règles de fusion V2.4.7

- un héros déplacé est retiré de son ancienne escouade : déplacement, jamais copie ;
- son profil persistant reste conservé même lorsque l’ancienne escouade est vidée ou remplacée ;
- un nouveau héros placé dans une ancienne position n’hérite jamais des données de l’occupant précédent ;
- un scan partiel met à jour uniquement les champs réellement lus ; les champs absents du scan ne sont pas effacés ;
- les données spécifiques au héros provenant d’une arme exclusive ou de la progression/Éveil restent fusionnées par nom canonique ;
- les doublons inter-escouades sont supprimés et l’escouade source est marquée à resynchroniser lorsque nécessaire ;
- la sauvegarde après confirmation reste local-first : le cloud ne bloque pas le bouton.

## Migration

Au premier chargement de V2.4.7, WarBoost construit le registre de héros à partir des données encore présentes dans les escouades, des armes exclusives et de la progression héros/Éveil.

Important : une valeur déjà perdue avant l’installation de V2.4.7 n’est **jamais inventée**. Elle devra être relue par un nouveau scan fiable ou être renseignée depuis une donnée Last War confirmée.

## Libellé de fraîcheur

Le cas de moins d’une minute ne produit plus une phrase du type « Mis à jour il y a À l’instant ». Il affiche désormais un libellé grammatical dédié, par exemple **« Mis à jour à l’instant »** en français.

Ce libellé est couvert dans les 22 langues WarBoost, avec les variantes anglais UK/US.

## Fonctions préservées

Aucune modification fonctionnelle n’est apportée à :

- Saison 6 Awakening / Reshape ;
- Boutique IA et son catalogue de référence ;
- Diagnostic PRO et ses paliers EX ;
- Alliance R5/R4 et fiabilité d’activité ;
- reconnaissance Vision `/api/scan` ;
- stockage `/api/state` ;
- Supabase ;
- catalogue de 31 héros et portraits.
