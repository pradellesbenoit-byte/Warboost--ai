---
name: Player beta work scope
description: User restrictions on branches and publication for WarBoost work.
---

Work only on `public-beta-safe-launch` in Warboost--ai. Never touch `demo-lastwar-presentation`. Do not push or deploy automatically.

**Why:** The user explicitly restricted the work to the safe public-beta branch and prohibited automatic publication.

**How to apply:** Check the current branch before modifications. Keep commits local and report readiness separately from pushing or publishing. A later explicit user instruction can change this scope.

La préparation Sécurité & confidentialité pour les stores n'autorise aucune application automatique
de migration Supabase ni modification des données réelles de production. Les migrations de sécurité
doivent rester préparées et vérifiées seulement ; l'application réelle exige une autorisation distincte.

**Why:** L'utilisateur a expressément limité la passe préalable aux stores à des migrations non appliquées.

**How to apply:** Utiliser des bases isolées et comptes synthétiques pour les vérifications ; ne jamais
supprimer un vrai bêta-testeur pour démontrer le parcours de suppression.