# WarBoost V2.5.28 HF5 — Last War Identity Link

Date: 2026-09-09
Base exacte: WarBoost V2.5.28 HF4 Final Management AI
Base FULL SHA-256: `fd7b8d0990302db4da1c4e11797416c8a2bfbad1eafbcc9d5a19d8a3097c86ba`
Cible: `public-beta-safe-launch` / Vercel Preview uniquement.

## Pourquoi HF5
Le smoke test réel HF4 a montré qu'une confirmation joueur pouvait être visible côté Joueur mais rester à 0 dans le suivi R5/R4. La cause était l'absence d'une association sûre entre le compte WarBoost et le membre correspondant du roster Last War.

HF5 corrige ce lien sans utiliser l'adresse e-mail comme identité Alliance.

## Règle d'identité Alliance
- **E-mail = authentification, invitation, récupération de compte et support WarBoost uniquement.**
- **Identité Alliance = pseudo Last War + serveur + alliance.**
- Une nouvelle association exige une correspondance exacte, compatible et unique.
- Un pseudo absent, un doublon, un serveur différent ou une alliance différente reste **non lié / à associer**.
- WarBoost ne crée pas de faux membre pour un compte WarBoost sans correspondance dans un roster R5/R4 déjà importé.
- Après une association exacte déjà établie, un identifiant technique privé peut conserver l'historique lors d'un changement de pseudo. Il ne peut pas servir à contourner la preuve initiale pseudo + serveur + alliance.
- Les R5/R4 voient l'état **Compte WarBoost lié / non lié**, jamais l'e-mail comme identité de roster.

## Remontée Joueur → Alliance
- Les confirmations joueur VS, Exercice d'alliance/Marshal, Siège zombie, Desert Storm, Canyon Storm, Ghost Ops, Ville/Bastion/Capitole, Guerre de saison et Maraudeur restent stockées dans l'historique WarBoost.
- Lorsqu'un compte est lié à un membre du roster, ses événements sont fusionnés dans ce membre et deviennent visibles dans le suivi Alliance 30 jours et le détail par joueur.
- Un compte WarBoost sans correspondance reste dans une liste d'association en attente et n'augmente pas le nombre de membres du roster importé.
- Les imports R5/R4 continuent de matcher le pseudo normalisé et bloquent les correspondances ambiguës.
- Une donnée manquante ne devient jamais automatiquement une absence ou une inactivité.

## Compatibilité HF4/HF3 conservée
- TOP 3 Diagnostic PRO personnalisé à l'escouade principale du joueur.
- Comparaison des 5 héros en détail, départage EX expliqué, Boutique IA alignée.
- VS Aujourd'hui / À garder / À éviter et adversaire inconnu non spéculatif.
- Saison inter-saisons protégée ; aucune S6/S7 inventée.
- Roster périmé : plan tactique suspendu/partiel et aucune affectation inventée.
- Rang Last War déclaré séparé des permissions sensibles WarBoost vérifiées.
- Scan fiable : identité héros, équipements exacts, vrais Lv.0, garde `gearx`.
- Support, invitations, récupération de mot de passe et confidentialité conservés.
- 23 langues explicites + Auto.
- 12 fonctions serverless.

## Safe Launch inchangé
- PRO inclus gratuitement pour les testeurs invités.
- Paiements WarBoost désactivés.
- Aucun accès externe au compte Last War.
- Aucune API Last War non autorisée.
- Aucun scraping.
- Aucune automatisation de gameplay.

## Données / Supabase
HF5 réutilise l'état JSON WarBoost existant. **Aucune nouvelle migration Supabase HF5** n'est requise. Les migrations support et invitations déjà installées restent inchangées.

## Validation
Exécuter :

```bash
npm run check
npm run verify
```

Les tests package ne remplacent pas le smoke test Vercel/Supabase réel. Après déploiement, il faut confirmer que le roster de 94 membres reste à 94, que `les gladiateurs81 · serveur 884 · ALL4` se lie à sa ligne existante, que sa participation réelle remonte dans le suivi R5/R4, et qu'aucun e-mail n'apparaît comme identité Alliance.
