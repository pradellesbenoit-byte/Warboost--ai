# WarBoost V2.5.28 HF8.6.3 — Alliance Rank Manager

HF8.6.3 ajoute une gestion fiable et groupée des grades d'alliance R1/R2/R3/R4 sans recréer les joueurs ni perdre leurs données.

## Gestion des grades
- Les R5/R4 peuvent préparer plusieurs changements en une seule opération.
- R1, R2, R3 et R4 sont pris en charge dans les deux sens.
- L'aperçu montre les compteurs avant/après avant validation.
- Le nombre de R4 ne peut pas dépasser 10 dans l'outil manuel, conformément à la limite observée dans Last War.
- Le R5 est protégé et exclu du lot : son transfert reste une opération séparée.
- Le responsable connecté ne peut pas modifier son propre grade dans ce lot ; son grade doit être confirmé par un autre responsable ou par un scan roster.

## Identité et historique
- Un changement de grade modifie le membre existant, jamais son identité.
- Puissance, QG, escouades, compte WarBoost lié, participations, progression et historique sont conservés.
- Chaque changement ajoute une entrée `role_changed` avec ancien grade, nouveau grade, date et source.
- Le scan roster HF8.6.2 continue de détecter automatiquement les changements de grade sur les mêmes pseudos.

## Droits R4 WarBoost
- Lorsqu'un compte WarBoost lié passe vers/depuis R4, les droits de gestion WarBoost sont mis à jour avec le même lot.
- Un R4 vérifié peut maintenir les droits R4 de son alliance mais ne peut ni modifier ni transférer le R5.
- En cas d'échec d'une mise à jour de droits au milieu d'un lot, WarBoost tente un rollback et n'applique pas les changements locaux, afin d'éviter un roster et des permissions incohérents.

## Safeguards conservés
- Identité fiable HF8.6.2 : la puissance/QG/grade ne déterminent jamais l'identité.
- Queue multi-captures Android HF8.6.1.
- Progression datée et puissance d'escouade prioritaire HF8.6.
- Départs/retours/anciens membres HF8.4/HF8.5.
- Tempête du Désert IA et VS freshness guard.
- Safe Launch, paiements désactivés, aucune API Last War non autorisée.

## Base de déploiement
Le PATCH HF8.6.3 s'applique directement sur **WarBoost V2.5.28 HF8.6.2 Reliable Roster Identity**.

Aucune migration Supabase HF8.6.3.
