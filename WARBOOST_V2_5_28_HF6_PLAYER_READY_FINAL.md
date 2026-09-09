# WarBoost V2.5.28 HF6 — Player-Ready Final Beta

Date : 2026-09-09
Base exacte : `WarBoost_V2.5.28_HF5_LASTWAR_IDENTITY_LINK_FULL.zip`
SHA-256 base : `651055f839fb79c83d617773f0095d6b83b54562298db75092e60e90756cc3fd`

## Objectif
HF6 finalise la bêta invitée avant l’envoi à un premier groupe de joueurs. Elle ne remplace pas les protections HF5 : elle ajoute une vraie lecture R5/R4 des preuves de participation et une dernière mise à jour de la veille publique.

## Alliance R5/R4 — finition
- Identité Alliance : **pseudo Last War + serveur + alliance**. L’e-mail reste réservé à l’authentification/support WarBoost.
- Aucun rapprochement approximatif : identité absente, ambiguë ou incompatible = compte non lié.
- Aucun membre artificiel n’est ajouté au roster lors d’un compte non associé.
- Historique 30 jours par événement : participé, absence confirmée, non sélectionné, excusé, non renseigné.
- Vue détaillée par joueur : compteurs, dernière date connue, dernière participation confirmée, source de la dernière donnée et historique récent.
- Résumé de gestion : comptes WarBoost liés, membres avec preuves connues, absences explicitement confirmées, comptes liés sans donnée connue.
- **Une donnée manquante ne signifie jamais absence ou inactivité.** Les synthèses sont des résumés de preuves WarBoost et non une télémétrie officielle Last War.

## Joueur / IA / Boutique / VS / Saison
HF6 conserve les comportements déjà validés :
- Diagnostic PRO personnalisé à la vraie escouade principale et au compte du joueur ; TOP 3 visible, cinq héros comparés en arrière-plan.
- Égalités EX expliquées ; #2/#3 restent hiérarchisés sous #1.
- Boutique IA alignée sur le Diagnostic ; prix/offres datés restent historiques tant qu’ils ne sont pas revalidés.
- VS : Aujourd’hui / À garder / À éviter ; adversaire inconnu non inventé.
- Saison : S6 terminée/inter-saison reste historique ; aucune Saison 7 activée depuis une rumeur.
- Scan : identité héros, équipements, vrais niveaux 0 et données existantes protégés.

## Veille Last War
Le 09/09/2026, la version publique 1.0.362 a été revue. Les textes de release notes observés diffèrent selon certaines boutiques régionales ; une optimisation Silver Brick est visible dans plusieurs listings. WarBoost classe cette mise à jour comme **informationnelle uniquement** et n’en déduit aucun changement héros, arme exclusive ou méta.

## Safe Launch inchangé
- Bêta publique sur invitation.
- PRO inclus gratuitement pour les testeurs autorisés.
- Paiements WarBoost désactivés.
- Aucun accès/API Last War non autorisé.
- Aucun scraping.
- Aucune automatisation de gameplay.
- Service client, invitations, récupération de mot de passe et données cloud existantes conservés.
- 23 langues explicites + Auto.
- 12 fonctions Vercel serverless conservées.

## Données / déploiement
- Pas de `localStorage.clear()`.
- Aucune migration Supabase HF6.
- Aucune suppression de fichier HF6.
- Conserver les migrations historiques déjà installées, notamment support V2.5.24 et invitations V2.5.26.
- Déployer uniquement sur `public-beta-safe-launch` avant toute promotion Production.
