# WarBoost V2.5.28 HF8.6.7 — Alliance Association Reliability

Date : 13 septembre 2026

## Problème corrigé

Le bouton « Vérifier l’association » pouvait sembler ne rien faire lorsqu’un compte WarBoost utilisait un pseudo affiché avec le préfixe d’alliance Last War, par exemple `[ALL4]ToyN`, alors que le roster canonique contenait `ToyN`. Le serveur, l’alliance et le joueur étaient les bons, mais l’ancien comparateur traitait le préfixe `[ALL4]` comme une partie du pseudo.

## Correctifs

- `[TAG]Pseudo` et `Pseudo` sont désormais considérés comme la même identité uniquement lorsque `TAG` correspond exactement à l’alliance connue du compte et du roster.
- Un texte interne légitime tel que `xXx Kaufik ALL4 xXx` n’est jamais raccourci ou modifié.
- Une étiquette d’une autre alliance, par exemple `[OTHER]ToyN`, ne correspond jamais à `ToyN` dans ALL4.
- Le nom canonique du roster reste celui importé depuis Last War ; un libellé de profil WarBoost ne le remplace plus.
- « Vérifier l’association » relance la synchronisation de tous les comptes cloud de l’alliance et affiche désormais un résultat visible : association réalisée ou toujours en attente.
- Les règles pseudo + serveur + alliance, l’interdiction de deviner, les anciens membres, la gestion des grades, HF8.6.6 Scan Persistence et Safe Launch sont conservés.

Aucune migration Supabase. Aucun nouveau secret. Toujours 12 fonctions Vercel.
