# WarBoost V2.5.28 HF8.6.5 — Simple Beta Access Code

## Objectif
HF8.6.5 remplace le besoin d’ajouter manuellement l’adresse e-mail de chaque bêta-testeur par un **code d’accès privé unique** saisi directement dans WarBoost après connexion.

## Parcours joueur
1. Le joueur ouvre la bêta WarBoost.
2. Il crée son compte / se connecte normalement.
3. Si son compte n’est pas encore autorisé, WarBoost affiche **Code d’accès bêta**.
4. Il saisit le code privé fourni par le propriétaire de WarBoost.
5. WarBoost autorise immédiatement son compte dans le registre existant `wb1_beta_invites`.
6. Le joueur n’a plus besoin de ressaisir le code sur ce compte.

## Sécurité
- Le code en clair n’est **jamais présent** dans le HTML, JavaScript navigateur, ZIP FULL ou PATCH.
- Seule une empreinte SHA-256 est embarquée côté serveur.
- Le code est limité à **25 nouveaux comptes**.
- Le code n’accepte plus de nouveaux comptes après le **31/10/2026 23:59:59 UTC**.
- Un compte explicitement révoqué ne peut pas se réautoriser avec le code partagé.
- Les joueurs déjà autorisés restent autorisés même après l’expiration du code d’onboarding.
- Les paiements restent désactivés et le Safe Launch reste inchangé.
- Aucun accès Last War non autorisé n’est ajouté.

## Compatibilité
- Réutilise la table Supabase existante `wb1_beta_invites`.
- **Aucune nouvelle migration Supabase**.
- **Aucune nouvelle variable Vercel obligatoire**.
- `WARBOOST_SUPPORT_ADMINS` n’est plus nécessaire pour inviter les bêta-testeurs via le parcours normal.
- La console Support/Admin reste disponible comme outil avancé si elle est configurée plus tard.
- Le nombre de fonctions Vercel reste à **12**.

## Données
HF8.6.5 ne supprime, ne réinitialise et ne migre aucune donnée joueur. Tous les correctifs HF8.6.4 et antérieurs sont conservés, notamment : progression, scans, roster, anciens membres, gestion des grades, VS, Saison et Tempête du Désert.
