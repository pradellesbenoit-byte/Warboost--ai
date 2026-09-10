# WarBoost V2.5.28 HF7 — Server + Alliance Invite Gate

HF7 est la version Safe Launch qui verrouille les espaces Alliance par **serveur Last War + alliance + pseudo exact du roster**. Elle part exactement de HF6 Player-Ready Final et conserve les fonctionnalités déjà validées Joueur, Scan, Diagnostic PRO, Boutique IA, VS, Saison, activité R5/R4, support, auth et invitations bêta.

## Sécurité Alliance HF7
- Seuls les **R5/R4** correspondant exactement à une ligne R5/R4 de leur roster peuvent créer/partager l'invitation de cet espace.
- Un code d'invitation n'est jamais une autorisation à lui seul.
- Admission = pseudo Last War exact + serveur exact + alliance exacte + présence unique dans le roster canonique.
- Mauvais serveur, mauvaise alliance, outsider, doublon/ambiguïté : accès refusé.
- Un R5/R4 d'un autre serveur peut créer son propre espace séparé pour son serveur/alliance après preuve dans son roster local.
- L'e-mail n'est jamais l'identité Alliance.
- Le roster canonique serveur conserve les preuves de participation connues sans stocker e-mail/player_id privé.
- Les conflits historiques de périmètre échouent en mode sécurisé au lieu d'être fusionnés automatiquement.

## Important : migration HF7 obligatoire
Exécuter UNE FOIS avant le déploiement du code :
`supabase/migration_v2_5_28_hf7_alliance_scope.sql`

Migration additive/idempotente : aucun `DROP TABLE`, `TRUNCATE` ou `DELETE FROM`.

## Safe Launch
Bêta publique sur invitation. Paiements désactivés ; PRO inclus aux testeurs autorisés ; aucune API Last War non autorisée, aucun scraping, aucune automatisation gameplay. 23 langues explicites + Auto et 12 fonctions serverless conservées.

## Déploiement
Branche : `public-beta-safe-launch` uniquement. Ne pas toucher `main/Production` ni `publisher-demo`.

Lire `UPLOAD_GUIDE_V2_5_28_HF7_SERVER_ALLIANCE_INVITE_GATE.txt` avant installation. Un smoke test Vercel + Supabase réel reste obligatoire après migration/déploiement avant partage large.

## Socle Supabase à conserver
Ne pas supprimer les migrations historiques déjà installées, notamment `supabase/migration_v2_5_24_support.sql` et `supabase/migration_v2_5_26_beta_invites.sql`. HF7 ajoute `supabase/migration_v2_5_28_hf7_alliance_scope.sql` sans remplacer les précédentes.
