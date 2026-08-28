# WarBoost V2.5.1 — Squad Swap Reliability

WarBoost V2.5.1 conserve tous les correctifs V2.5.0 et ajoute une permutation sûre des escouades depuis le panneau Joueur. Le bouton `⇄` placé sur le côté d'une escouade permet de choisir une autre escouade enregistrée et d'échanger **l'ensemble des données** des deux formations en une seule opération.

## Permutation complète, jamais par emplacement de héros

La permutation déplace ensemble la puissance d'escouade, les cinq héros, leurs niveaux, étoiles, puissance, arme exclusive, équipement, Éveil et les indicateurs de fiabilité associés. Les numéros d'escouade restent 1–4 : c'est le contenu complet qui change de place. Les mémoires globales `hero_profiles`, `exclusive_weapons` et `hero_progression` restent attachées à l'identité du héros et ne sont jamais recopiées depuis un slot.

Les deux escouades permutées reçoivent un `updated_at` commun au moment de l'action afin que la permutation soit conservée lors du push/pull cloud et ne soit pas annulée par une ancienne date de scan. `composition_changed_at` est également mis à jour.

L'interface n'affiche comme cibles que les escouades déjà enregistrées : une Escouade 4 optionnelle et vide ne peut donc pas être choisie accidentellement. Après permutation, le Diagnostic PRO utilise immédiatement la nouvelle Escouade 1 comme escouade principale.

## Correction du raisonnement EX

Le détail `Pourquoi` ne parle plus de « coût restant » lorsqu'aucune quantité officielle de fragments n'est connue. Il compare maintenant la **distance au prochain palier**, le rôle dans l'escouade et le timing. Cette formulation est fournie dans toutes les langues proposées par l'interface.

## Fiabilité conservée

V2.5.1 conserve la mémoire héros V2.5.0, l'anti-transfert de statistiques par slot, le scan EX persistant, le moteur adaptatif VS/PvP/PvE/Saison, Saison 6 Awakening/Reshape, Boutique IA, Alliance et l'absence d'invention de valeurs inconnues.

---

# WarBoost V2.5.0 — Legacy Hero Data Recovery

WarBoost V2.5.0 termine le chantier de fiabilité commencé avec V2.4.7–V2.4.9 : les caractéristiques d'un héros doivent rester attachées à **son identité**, même lorsqu'il change d'escouade, et une ancienne donnée ne doit jamais être recopiée depuis un numéro de slot.

La Preview V2.4.9 avait correctement cessé d'inventer des armes exclusives inconnues, mais elle ne retrouvait pas encore toutes les anciennes valeurs fiables enregistrées auparavant. V2.5.0 ajoute donc une récupération historique prudente, sans supprimer le classement adaptatif V2.4.9.

## Récupération par identité de héros

Le nouveau module `lib/hero-history.js` construit un historique par nom canonique de héros. Il peut exploiter, lorsqu'ils existent réellement :

- `hero_profiles` historiques du même héros ;
- `hero_progression` du même héros ;
- scans d'arme exclusive du même héros ;
- états précédents enregistrés dans `wb1_snapshots` ;
- ancien import joueur `wb19_imported_players`, uniquement lorsque le nom du joueur correspond ;
- ancien `wb10_profile`, traité comme source de faible confiance car son ancien modèle était basé sur les slots.

Une valeur connue dans l'état courant n'est pas remplacée par une valeur historique. Les champs historiques servent d'abord à **combler les trous**.

## Protection contre l'ancien bug de slot

V2.5.0 interdit la récupération d'un niveau, d'une EX, d'un équipement, d'une puissance ou d'un Éveil depuis la simple position 1–5.

Le vieux `wb10_profile` n'enrichit plus directement un héros déjà nommé dans l'état moderne. Il peut encore servir lors d'une toute première migration où l'identité moderne n'existe pas encore ; sinon il passe par le moteur de récupération prudent.

Les lignes historiques d'une escouade marquée `needs_rescan` sont ignorées pour la récupération des caractéristiques héros.

Les anciennes sources de type slot / historique d'escouade ne sont pas acceptées seules pour remplir une donnée sensible : elles doivent être corroborées par une autre observation cohérente ou par une source plus fiable. En cas de conflit équivalent, WarBoost laisse le champ inconnu au lieu de choisir arbitrairement.

## Priorité à la fiabilité des sources

La sélection historique favorise d'abord la **qualité de la source**, puis la récence à qualité égale. Un scan d'arme exclusive ou une progression héros explicitement enregistrée ne peut donc pas être écrasé par une ancienne donnée de slot simplement parce que cette dernière est plus récente.

Exemples de règle :

- une EX actuellement confirmée reste prioritaire ;
- deux historiques de même confiance et même date qui se contredisent donnent un conflit, pas une valeur inventée ;
- une ancienne donnée de faible confiance sans corroboration reste « à confirmer » ;
- un héros placé dans l'ancien slot de Kimberly ne peut pas hériter de Kimberly EX19.

## Historique cloud et protection avant écriture

`api/state.js` lit maintenant jusqu'à 100 snapshots du joueur dans `wb1_snapshots` lors du chargement cloud afin de tenter de restaurer uniquement les champs manquants.

Avant une écriture qui modifie des faits héros, l'état précédent est sauvegardé dans un snapshot `warboost-prewrite` en best effort. Cela protège les futures migrations : une modification de composition ou un nouveau scan ne doit plus supprimer silencieusement le dernier état héros connu.

Aucun changement de schéma Supabase n'est nécessaire : la table `wb1_snapshots` existante est réutilisée.

## Diagnostic PRO V2.4.9 conservé

Après récupération, le Diagnostic PRO continue d'utiliser le moteur adaptatif :

- construction de toutes les options fiables avant classement ;
- TOP 3 lorsque trois actions fiables existent ;
- objectifs Auto / Équilibré / PvP / PvE / VS / Saison ;
- rendement marginal et efficacité ressources ;
- certitude Certain / Probable / Spéculatif ;
- contexte VS / Saison 6 ;
- action explicite de vérification lorsqu'une EX reste réellement inconnue.

Dans le test d'intégration V2.5.0, la récupération de Carlie EX5, Morrison EX10 et Lucius EX1 depuis un historique fiable permet à nouveau au Diagnostic de construire un TOP 3 EX. Une EX absente des historiques reste inconnue.

## Protections conservées

V2.5.0 conserve :

- 31 héros et 31 portraits ;
- anti-doublon et confirmation des identités lors des scans ;
- Kimberly EX19 lorsqu'elle est présente dans une source fiable du même héros ;
- scan partiel sans effacement des champs fiables non lus ;
- Saison 6 Awakening / Reshape sans projection exacte inventée ;
- Boutique IA en catalogue partiel avec disponibilité non affirmée sans preuve ;
- Alliance R5/R4 et fiabilité d'activité ;
- 23 choix de langue explicites + mode Auto ;
- intégration Last War approval-first / API-ready, sans automatisation de gameplay ni accès non autorisé.

## Déploiement

Déployer uniquement sur `publisher-demo` pour le moment. Ne pas fusionner dans `main` avant validation sur les données réelles du compte.

Le test réel prioritaire après déploiement est : ouvrir Joueur puis Diagnostic PRO et vérifier si les snapshots disponibles permettent de retrouver les anciennes EX de la même identité de héros. La récupération est volontairement prudente : si aucun historique fiable n'existe dans le navigateur ou dans Supabase, WarBoost n'inventera pas la valeur manquante.
