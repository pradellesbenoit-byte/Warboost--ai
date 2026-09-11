# WarBoost V2.5.28 HF8.4 — Alliance Lifecycle Reliability

Date : 2026-09-11  
Base : WarBoost V2.5.28 HF8.3 — VS Decision Engine  
Cible : `public-beta-safe-launch` / `beta.warboost.fr` uniquement

## Objectif
HF8.4 transforme le roster Alliance en historique fiable plutôt qu’en simple liste figée. Un membre manquant n’est jamais déclaré absent, inactif ou parti sans preuve. Les départs, retours et changements de grade sont conservés sans effacer l’historique WarBoost.

## Alliance R5/R4
- Import partiel : toujours additif ; un joueur absent du fichier n’est pas retiré.
- Import « roster complet actuel » : action explicite R5/R4, avec R5 inclus même si Last War l’affiche séparément au-dessus des R4.
- Un membre absent d’un roster complet passe en **À vérifier**, jamais directement en ancien membre.
- Le départ est enregistré uniquement après confirmation R5/R4.
- Un départ confirmé conserve les participations, le grade connu et l’historique.
- Un ancien membre qui réapparaît est réactivé et son retour est historisé.
- Les changements R5/R4/R3/R2/R1 sont historisés.
- Le compteur de membres ne compte que le roster actif ; « À vérifier » et « Anciens membres » sont séparés.
- Le roster canonique serveur peut diminuer uniquement après un nouveau snapshot complet explicite et plus récent ; les imports partiels ne peuvent pas réduire la liste.
- Les preuves de participation existantes sont préservées lors d’une mise à jour de roster.

## Participation / activité
- Chaque événement affiche désormais ✅ Participé, ❌ Absent confirmé, 🔵 Non sélectionné, 🟠 Excusé et **❓ Non renseigné**.
- `❓` correspond aux membres actifs sans statut connu pour cet événement sur la période de 30 jours.
- Une donnée manquante n’est jamais convertie en absence ou inactivité.
- Les comptes WarBoost en attente d’association sont réellement visibles et peuvent relancer une vérification exacte.
- L’association exige toujours pseudo Last War + serveur + alliance exacts ; aucune identité n’est devinée.

## R5 séparé dans Last War
WarBoost accepte le R5 dans le même import que les autres grades. Le produit ne contient aucun pseudo R5 codé en dur : le R5 réel vient du roster importé par l’alliance.

## VS terminé
À `0h00`, le Decision Engine passe en état **VS TERMINÉ** :
- aucune dépense VS supplémentaire recommandée ;
- aucun nouveau scan demandé ;
- aucune tendance/rattrapage actif affiché ;
- le résultat visible reste conservé comme historique.

## Non-régression
HF8.4 conserve les protections HF3 → HF8.3, le Diagnostic PRO, WarBoost Scan, Boutique IA, Alliance, VS, Saison, Support, récupération de mot de passe, invitations bêta, 23 langues explicites + Auto, 12 fonctions Vercel serverless, ainsi que le Safe Launch.

## Safe Launch
- Aucun accès API Last War non autorisé.
- Aucun scraping Last War.
- Aucune automatisation de gameplay.
- Paiements bêta toujours désactivés.
- Aucune migration Supabase HF8.4.
- Aucune suppression de donnée ni `localStorage.clear()`.
