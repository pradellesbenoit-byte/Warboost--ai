# WarBoost V2.5.19 — Private Beta Player Safety

## Cible
Cette version est destinée aux **joueurs invités à la bêta privée WarBoost**. Elle n’a pas vocation à remplacer la Publisher Demo V2.5.18 destinée à Last War/FirstFun.

## Correctif principal
La Boutique IA distingue désormais strictement une **offre payante actuellement observée** d’une **ancienne référence payante** issue du catalogue construit avec les captures précédentes.

- Une offre payante de référence non confirmée aujourd’hui passe dans **« Offres payantes historiques à vérifier »**.
- Ces offres historiques n’ont **plus de rang #1/#2** et n’affichent **plus de score de pertinence comme recommandation d’achat actuelle**.
- Elles restent visibles uniquement pour aider le joueur à reconnaître une offre si elle réapparaît.
- Le texte indique explicitement : offre référencée précédemment, disponibilité actuelle non confirmée, rescan requis avant toute recommandation d’achat.
- Une offre payante ne revient dans **« Achats en argent réel »** que lorsqu’un scan récent ou une source officielle autorisée confirme qu’elle est actuellement présente.
- Même après confirmation de présence, une recommandation forte exige toujours les trois contrôles : **prix actuel + contenu actuel + rapport coût/gain**.

## Protections conservées
- Diagnostic PRO = source de vérité pour les priorités Boutique IA.
- Aucune valeur EX, quantité de fragments, prix actuel ou disponibilité n’est inventée.
- DVA reste non classée si son EX est inconnu.
- Sources méta filtrées par sujet ; communauté secondaire aux données du compte.
- Bêta privée sur invitation, consentement explicite et PRO inclus gratuitement pendant la bêta.
- Paiements WarBoost désactivés pendant la bêta privée.
- Aucun accès Last War non autorisé et aucune automatisation du gameplay.
- Données joueur protégées pendant les mises à jour ; aucune migration Supabase requise pour V2.5.19.

## Déploiement
Déployer sur une **branche/Preview dédiée aux joueurs bêta** (recommandé : `private-beta`). Ne pas remplacer la branche `publisher-demo` V2.5.18 utilisée pour la présentation éditeur et ne pas modifier `main`/Production sans validation séparée.
