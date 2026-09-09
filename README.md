# WarBoost V2.5.28 HF6 — Player-Ready Final Beta

HF6 est la version de finition Safe Launch destinée à l’envoi aux joueurs invités après validation Preview. Elle part exactement de HF5 et conserve toutes les protections existantes.

## Ce que HF6 finalise
- Diagnostic PRO personnalisé au compte et à l’escouade principale ; TOP 3 visible, cinq héros comparés en arrière-plan.
- Boutique IA alignée sur le Diagnostic, sans prix/offre actuelle inventée.
- VS avec Aujourd’hui / À garder / À éviter et adversaire inconnu non spéculatif.
- Saison inter-saison protégée : aucun conseil S6/S7 inventé.
- Alliance R5/R4 : identité par pseudo Last War + serveur + alliance, jamais par e-mail.
- Suivi d’événements 30 jours avec participé / absence confirmée / non sélectionné / excusé / non renseigné.
- Vue détaillée joueur : compteurs, dates, source de la dernière donnée et historique récent.
- Résumé de gestion basé uniquement sur les preuves connues ; absence de donnée ≠ absence/inactivité.
- Veille publique revue au 09/09/2026 : Last War 1.0.362, information seulement, aucune méta déduite.
- Service client, invitations, récupération de mot de passe, Scan et conservation des données maintenus.
- Bêta gratuite sur invitation : paiements WarBoost désactivés ; API Last War non autorisée, scraping et automatisation désactivés.

## Déploiement
Branche cible : `public-beta-safe-launch` uniquement. Ne pas modifier `main/Production` ou `publisher-demo`.

Aucune migration Supabase et aucune suppression de fichier ne sont requises pour HF6.

Voir `UPLOAD_GUIDE_V2_5_28_HF6_PLAYER_READY_FINAL.txt` et `BUILD_VERIFICATION_V2_5_28_HF6_PLAYER_READY_FINAL.txt`.

## Socle Supabase déjà installé
HF6 n’ajoute aucune migration. Conserver les migrations déjà appliquées, notamment `supabase/migration_v2_5_24_support.sql` et `supabase/migration_v2_5_26_beta_invites.sql` ; ne pas les réexécuter inutilement et ne pas supprimer les tables existantes.
