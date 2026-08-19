# WarBoost V20.5.36 — Activation du code e-mail 6 à 8 chiffres

La V20.5.36 est prête côté application. Pour que Supabase affiche réellement le code dans l’e-mail de confirmation, le modèle **Confirm signup** du projet Warboost doit contenir `{{ .Token }}`.

## À faire une seule fois dans Supabase
1. Ouvrir le projet **Warboost**.
2. Aller dans **Authentication → Email Templates → Confirm signup**.
3. Remplacer le contenu du modèle par le fichier `SUPABASE_CONFIRM_SIGNUP_TEMPLATE.html` fourni dans ce ZIP.
4. Enregistrer.

Important : le modèle fourni n’inclut volontairement **aucun lien de confirmation cliquable**. Cela évite qu’Outlook/Hotmail ou un système de sécurité ouvre le lien avant le joueur et consomme le jeton.

## Nouveau parcours
- Le joueur crée son compte.
- Supabase lui envoie un code de 6 à 8 chiffres.
- WarBoost affiche automatiquement l’écran de validation.
- Le joueur saisit le code.
- WarBoost appelle Supabase `verifyOtp` et ouvre la session si le code est valide.
- Si le joueur tente de se connecter avant confirmation, WarBoost ouvre directement cet écran au lieu d’afficher « Email not confirmed ».
- « Renvoyer le code » est protégé par un délai de 60 secondes pour réduire les erreurs 429.
