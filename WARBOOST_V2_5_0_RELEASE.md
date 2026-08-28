# WarBoost V2.5.0 — Legacy Hero Data Recovery

## Objet

Récupérer les anciennes caractéristiques fiables des héros sans réintroduire le bug historique où un nouveau héros héritait des données du héros qui occupait auparavant le même slot.

## Nouveau

- module `lib/hero-history.js` ;
- récupération par identité canonique de héros ;
- lecture des historiques `wb1_snapshots` côté `/api/state` ;
- support des anciennes données `wb19_imported_players` pour le même joueur ;
- prise en compte prudente de `wb10_profile` ;
- snapshot `warboost-prewrite` avant remplacement d'un état contenant des faits héros différents ;
- priorité de confiance des sources avant récence ;
- conflit équivalent => champ laissé inconnu ;
- historique d'une escouade `needs_rescan` exclu de la récupération héros.

## Protection spécifique contre le transfert par slot

- aucune caractéristique n'est récupérée grâce au numéro de position ;
- un héros déjà identifié dans le core state n'est jamais enrichi directement depuis le vieux `wb10_profile` ;
- les sources slot-era de faible confiance nécessitent une corroboration ;
- Kimberly EX19 ne peut être transférée à un autre héros occupant sa position précédente.

## Diagnostic PRO

Le moteur V2.4.9 est conservé. Les valeurs récupérées alimentent `hero_profiles`, puis le Diagnostic reconstruit le pool complet et applique le classement adaptatif VS/PvP/PvE/Saison.

Test d'intégration contrôlé : Carlie EX5, Morrison EX10 et Lucius EX1 récupérés depuis un historique fiable produisent de nouveau trois priorités EX cohérentes ; une EX sans preuve reste inconnue.

## Conservé

- 12 API ;
- 31 héros / 31 portraits ;
- Saison 6 Awakening / Reshape ;
- Boutique IA et ses garde-fous ;
- Alliance R5/R4 ;
- 23 langues explicites + Auto ;
- schéma Supabase inchangé ;
- scan, synchronisation et identité de squad V2.4.7 conservés.

## Déploiement

Tester sur `publisher-demo` uniquement. Ne pas fusionner dans `main` tant que la récupération n'a pas été vérifiée sur les snapshots réellement disponibles pour le compte.
