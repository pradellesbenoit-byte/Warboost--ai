# WarBoost V2.5.28 — Activity Events

Date : 7 septembre 2026
Branche cible : `public-beta-safe-launch`

## Objectif

Réduire fortement la dépendance aux captures d’écran pour le suivi d’activité Alliance, sans inventer des données Last War que WarBoost ne peut pas lire officiellement.

## Nouveau suivi d’activité sans capture

Le joueur peut confirmer en un seul appui les événements auxquels il a réellement participé aujourd’hui :

- VS
- Zombie
- Maraudeur
- Événement d’alliance
- Guerre
- Saison

Une confirmation est enregistrée dans le profil WarBoost avec son type, sa date, son heure et sa source déclarative. Elle peut être retirée si le joueur s’est trompé ; le retrait est synchronisé de façon à ne pas être rétabli par une ancienne copie cloud.

## Règles de fiabilité

- Une confirmation récente est une preuve WarBoost de participation déclarée, pas une donnée officielle Last War.
- L’absence de confirmation ne signifie jamais « inactif ».
- Ouvrir WarBoost ne prouve pas que le joueur a participé à un événement Last War.
- Une donnée ancienne reste « À actualiser ».
- L’IA R4/R5 n’assigne des groupes tactiques qu’avec des joueurs disposant de preuves d’activité suffisantes.
- L’indice d’activité est un indice de preuves sur 100, pas une probabilité officielle.

## Rangs R1–R5

Le joueur peut déclarer son rang Last War R1 à R5. Ce rang sert à l’affichage et aux statistiques du roster.

Sécurité : le rang déclaré est séparé du rang de gestion WarBoost vérifié. Se déclarer R5 ne donne pas automatiquement le droit de modifier les rôles ou d’effectuer des actions d’administration WarBoost.

## Corrections de finition incluses

Les petits défauts relevés pendant les tests réels V2.5.27 sont corrigés dans la même version :

- « Confiance » devient clairement « Confiance du diagnostic ».
- « Confiance contexte » devient « Complétude des données ».
- suppression du doublon `À éviter : À éviter :` dans le VS.
- le conseil d’entre-saisons ne mélange plus une priorité joueur/arme exclusive.
- les détails Boutique IA affichent « Masquer les détails » lorsqu’ils sont ouverts.

## Préservation V2.5.27 / HF1 / HF2

La version conserve notamment :

- ordre confirmé des héros ;
- protection anti-écrasement inter-héros ;
- correction `gearx` ;
- lecture des 4 équipements avec vrais niveaux 0 et raretés mixtes ;
- invitations bêta ;
- service client ;
- récupération de mot de passe ;
- données joueur existantes ;
- 23 langues explicites + Auto ;
- Diagnostic PRO, Boutique IA, VS, Saison, R4/R5 ;
- paiements désactivés ;
- aucun accès externe Last War, scraping ou automatisation de gameplay.

## Base de données

Aucune migration Supabase V2.5.28 n’est nécessaire. Les nouvelles informations d’activité sont stockées dans le JSON de profil WarBoost existant.

## Limite importante

Sans API officielle Last War, WarBoost ne peut pas affirmer automatiquement qu’un joueur a réellement participé au VS, à Zombie ou à Maraudeur. La V2.5.28 utilise donc des confirmations volontaires très rapides et les distingue explicitement des données officielles.
