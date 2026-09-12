# WarBoost V2.5.28 HF8.6 — Roster Scan + Progression + Combat AI

Date : 2026-09-12  
Base : WarBoost V2.5.28 HF8.5 FINAL — Alliance + Desert Storm AI  
Cible : `public-beta-safe-launch` puis `beta.warboost.fr` après smoke test réel.

## Objectif
HF8.6 corrige les retours observés pendant le test HF8.5 et rend les mises à jour joueur/alliance plus réalistes sans accès non autorisé à Last War.

## 1. Ancien membre : exclusion immédiate et durable
- `Retirer de l’alliance` conserve l’historique mais retire le joueur du roster actif.
- Un ancien membre n’apparaît plus dans Tempête du Désert ni dans un plan actif.
- Un vieux roster canonique/cloud ne peut pas le réactiver simplement parce qu’il a été resynchronisé.
- Seules une réintégration R5/R4 ou une nouvelle importation explicite du roster peuvent le réactiver.
- Un retour plusieurs mois plus tard conserve l’historique et évite les doublons.

## 2. Import roster par captures
Flux principal R5/R4 :
1. Prendre plusieurs captures de la liste des membres Last War en faisant défiler R5/R4/R3/R2/R1.
2. Ajouter jusqu’à 12 captures dans WarBoost.
3. WarBoost Vision lit uniquement les lignes visibles : pseudo exact, grade, QG et puissance totale du compte.
4. Le R5 affiché séparément au-dessus de R4 est supporté.
5. WarBoost fusionne les doublons et affiche un brouillon éditable avant import.
6. Le R5/R4 vérifie/corrige chaque ligne puis importe.

Sécurité roster :
- Une capture partielle ne supprime personne.
- L’option `roster complet actuel, R5 inclus` est volontaire et séparée.
- Même avec un roster complet, un membre manquant passe d’abord à `À vérifier`, jamais automatiquement à `Parti`.
- CSV/Excel reste disponible dans `Import avancé`, mais n’est plus le flux principal.

## 3. Puissance utilisée par les plans de guerre
Pour Tempête du Désert et les plans combat :
1. **Puissance d’escouade réelle et récente** si le compte WarBoost du membre fournit cette donnée.
2. **Puissance totale du compte** seulement comme fallback si aucune puissance d’escouade fiable n’est disponible.
3. QG et grade restent secondaires.

Exemple de non-régression :
- Joueur A : compte 300 M, escouade 38 M.
- Joueur B : compte 250 M, escouade 52 M.
- Le moteur doit classer B devant A pour une mission de combat.

Une puissance d’escouade de plus de 14 jours réduit la confiance et déclenche une recommandation d’actualisation rapide. WarBoost ne fabrique jamais une puissance d’escouade manquante.

## 4. Progression joueur datée
WarBoost ne remplace plus silencieusement l’ancien état pour l’analyse de progression : il conserve des instantanés datés (jusqu’à 120) avec :
- puissance compte ;
- QG ;
- puissance des 4 escouades ;
- escouade la plus forte ;
- niveau et puissance Drone.

Exemple vérifié : 250 M / 45 M puis 11 jours plus tard 255 M / 47 M => compte +5 M (+2 %), escouade +2 M (+4,4 %), sans déduire qu’un joueur ne progresse pas lorsqu’il n’a pas actualisé.

## 5. Actualisation rapide
Après le premier scan complet, le joueur peut actualiser uniquement :
- Profil / QG / puissance compte ;
- Escouade principale ;
- Drone.

WarBoost garde les autres données existantes. Une donnée ancienne reste visible comme ancienne et réduit la précision d’un plan ; elle n’est jamais présentée comme fraîche.

## 6. Protections HF8.5 et antérieures conservées
- VS Freshness Guard : un scan VS de la veille n’est jamais live.
- `0h00` ancien ne termine jamais le VS actuel.
- 20 titulaires + 10 remplaçants Tempête du Désert, consignes courtes, inscription ≠ participation.
- Valeurs de bâtiments Tempête du Désert issues des captures Last War du 11/09/2026 conservées.
- `❓ Non renseigné`, départ/retour, changements de grade et historique Alliance conservés.
- Safe Launch : aucun scraping, aucune API Last War non autorisée, aucune automatisation gameplay.
- Paiements bêta désactivés.
- Aucune migration Supabase HF8.6.
- Aucune suppression de données, aucun `localStorage.clear()`.
- 23 langues explicites + Auto ; nouvelles chaînes HF8.6 traduites ou avec fallback sûr sans clé brute.
