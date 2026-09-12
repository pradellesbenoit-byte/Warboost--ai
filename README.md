# WarBoost V2.5.28 HF8.6.4 — Rank Persistence Reliability

HF8.6.4 corrige la gestion des grades : les changements R1/R2/R3/R4 sont persistés dans le roster canonique avant la resynchronisation cloud et l’interface est rafraîchie immédiatement après confirmation. Le R5 reste protégé.

# WarBoost V2.5.28 HF8.6.3 — Alliance Rank Manager

HF8.6.2 est un correctif ciblé de **WarBoost V2.5.28 HF8.6.1**, toujours en bêta publique **sur invitation**, destiné à `public-beta-safe-launch`.

## HF8.6.3 — Gestion des grades Alliance
Cette version reprend intégralement **HF8.6.2 — Reliable Roster Identity** et ajoute une gestion groupée des grades Last War **R1/R2/R3/R4** pour les R5/R4 WarBoost :
- changements multiples préparés dans un seul brouillon, avec aperçu **avant → après** ;
- permutations R4↔R3 et R2↔R1 appliquées comme une seule opération ;
- limite de **10 R4** contrôlée avant validation ;
- **R5 protégé** et traité séparément ;
- le propre grade du gestionnaire n'est pas modifiable depuis ce batch afin d'éviter une perte accidentelle de droits ;
- aucune fiche joueur n'est recréée : progression, compte WarBoost lié, participations, escouades et historique restent attachés au même membre ;
- chaque changement ajoute un événement `role_changed` dans `membership_history` ;
- les droits de gestion WarBoost R4 sont synchronisés pour les comptes liés lors d'un passage vers/depuis R4, avec rollback best-effort si une mise à jour échoue ;
- le scan roster HF8.6.2 reste capable de confirmer un changement de grade sans créer de doublon.

**HF8.6.3 n'ajoute aucune migration Supabase.** Elle s'applique sur HF8.6.2 et conserve toutes les migrations historiques déjà installées.


Il corrige le point critique observé avec Kaufik : un membre déjà connu ne doit jamais être recréé comme nouveau simplement parce que sa puissance, son QG ou son grade ont changé.

## Règle d’identité HF8.6.2
L’identité d’un membre repose d’abord sur le **pseudo Last War normalisé + serveur + alliance**. La puissance, le QG et le grade sont des données évolutives et ne servent jamais à décider qu’un joueur est une autre personne.

- `[ALL4]xXx Kaufik ALL4 xXx` est nettoyé en `xXx Kaufik ALL4 xXx` : seul le tag d’alliance entre crochets placé devant le pseudo est retiré.
- Le `ALL4` réellement inclus dans `xXx Kaufik ALL4 xXx` est conservé.
- Les chiffres de fin de pseudo doivent être conservés, par exemple `Nono 50`.
- `276 M → 320,7 M` met à jour **le même membre** et crée une observation de progression ; aucun doublon n’est créé.
- Un changement R4 → R3 ou QG35 → QG36 reste le même joueur.
- Une ressemblance OCR imparfaite ne déclenche jamais une fusion automatique : WarBoost affiche une correspondance possible et demande une confirmation.
- Une correspondance ambiguë bloque l’import jusqu’à vérification.
- Un ancien membre reconnu est réintégré au lieu d’être recréé.

## UX du brouillon roster
Chaque ligne affiche maintenant clairement :
- **Membre existant** avec ancienne → nouvelle puissance quand elle change ;
- **Ancien membre détecté** ;
- **Nouveau membre** ;
- **Correspondance possible** avec bouton d’association ;
- **Correspondance ambiguë** à vérifier.

Ajouter ou retirer une capture invalide l’ancien brouillon OCR : l’analyse suivante repart toujours de la file complète actuelle pour éviter un résultat obsolète.

## Historique de puissance alliance
Les observations de puissance d’un membre sont conservées dans `power_history` sans migration Supabase. Elles restent attachées à la même identité lors des imports successifs.

## Tout HF8.6.1 est conservé
- file cumulative de captures Android ;
- jusqu’à 24 captures, doublons exacts ignorés, retrait individuel ;
- anciens membres exclus des outils actifs et réintégrables ;
- puissance d’escouade prioritaire dans les plans de guerre ;
- progression datée et actualisation rapide ;
- Tempête du Désert IA ;
- VS Freshness Guard ;
- Safe Launch, Auth, Support, PRO, Saison et Boutique IA.

## Supabase
**Aucune migration Supabase HF8.6.2.** Ne rien exécuter dans Supabase.

## Smoke test obligatoire
1. Scanner Kaufik déjà présent à 276 M avec une capture où il apparaît à 320,7 M.
2. Vérifier que WarBoost affiche **Membre existant** et `276 M → 320,7 M`.
3. Importer et vérifier qu’il n’existe toujours qu’un seul Kaufik.
4. Vérifier que l’ancienne et la nouvelle puissance sont conservées dans l’historique.
5. Tester un pseudo avec tag `[ALL4]` devant : le tag doit être retiré sans modifier un `ALL4` réellement présent dans le pseudo.
6. Tester un OCR volontairement proche mais non exact : aucune fusion automatique ne doit avoir lieu.
7. Vérifier les anciens membres, Tempête du Désert, progression, VS et données joueur après mise à jour.

## Migrations historiques à conserver
HF8.6.2 n’ajoute aucun schéma. Conserver les migrations déjà installées, notamment `migration_v2_5_24_support.sql` et `migration_v2_5_26_beta_invites.sql`. Ne pas les supprimer ni les rejouer inutilement.
