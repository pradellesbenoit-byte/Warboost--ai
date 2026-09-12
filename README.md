# WarBoost V2.5.28 HF8.5 FINAL — Alliance Control + Desert Storm AI

HF8.5 FINAL est la Public Beta Safe Launch **sur invitation**. Cette version s'applique directement sur la HF8.4 actuellement déployée et remplace le brouillon HF8.5 VS Freshness Guard qui n'a pas été déployé.

Elle réunit trois axes sans supprimer les protections précédentes :
1. **VS Freshness Guard** : un scan ancien ne peut plus être présenté comme live ni piloter une dépense.
2. **Cycle de vie Alliance simple** : R5/R4 peut retirer un joueur de l'alliance sans détruire son historique, puis le réintégrer plus tard.
3. **Tempête du Désert IA** : R5/R4 sélectionne les joueurs réellement inscrits et WarBoost crée un plan de guerre court, équilibré et copiable.

## 1. VS Freshness Guard
- Un scan VS doit appartenir au **jour serveur de jeu actuel** avant d'être utilisé comme situation live.
- Un scan ancien reste dans l'historique mais ne fournit plus de timer, écart live, tendance, projection ou conseil de dépense.
- Un ancien scan à `0h00` ne signifie jamais que le VS actuel est terminé.
- Sans scan du jour confirmé, la décision devient **SCANNER** avec ressources à conserver.
- Un scan réellement actuel à `0h00` reste un état **VS TERMINÉ** : aucun nouveau scan et aucune dépense VS supplémentaire.
- Fixture réelle conservée : ALL4 `821 407 081` vs Mep `508 264 286`, `05:53:55` restantes, écart `+313 142 795`.

## 2. Alliance — retirer et réintégrer facilement
- Chaque membre actif affiche une action R5/R4 **Retirer de l'alliance**.
- Cette action enlève immédiatement le joueur du roster actif et des compteurs R5/R4/R3/R2/R1.
- Le joueur est déplacé dans **Anciens membres** au lieu d'être détruit.
- Historique d'appartenance, ancien grade et preuves de participation sont conservés.
- Le joueur retiré n'est plus sélectionnable pour les plans d'événement actifs.
- **Réintégrer** le remet dans le roster actif, même plusieurs mois plus tard, sans perdre l'historique.
- Un futur import du roster qui retrouve le même pseudo + serveur + alliance le reconnaît et le réactive au lieu de créer un doublon.
- L'absence d'un joueur dans une liste partielle ne devient jamais un départ automatique.

## 3. Tempête du Désert IA — R5/R4

### Saisie R5/R4
- Le R5/R4 sélectionne uniquement les membres qui se sont **inscrits** à la bataille.
- Équipe A/B et heure de bataille peuvent être indiquées.
- La sélection utilise uniquement le roster actif ; un ancien membre ou un membre à vérifier n'est pas sélectionné silencieusement.
- **Inscrit ≠ participé** : la sélection ne crée aucune preuve de présence. La participation reste séparée et doit être confirmée après l'événement.

### Composition automatique
- Capacité prise en compte : **20 titulaires + 10 remplaçants**.
- À 20 titulaires, WarBoost construit **5 groupes équilibrés de 4** pour éviter de concentrer tous les plus forts au même endroit.
- Si moins de 20 joueurs sont inscrits, le plan se compacte automatiquement au nombre réellement disponible ; aucun joueur manquant n'est inventé.
- Une puissance/QG manquante réduit la confiance du plan mais ne transforme jamais le joueur en faible/inactif.
- Les remplaçants restent listés séparément.

### Référence tactique actuelle issue des écrans Last War fournis le 11/09/2026
Les valeurs ci-dessous sont volontairement prises depuis les captures du jeu fournies pour cette build :
- Silo nucléaire : **+80 points Alliance/s**, +30 individuel/s.
- Raffinerie de pétrole : **+50 Alliance/s**, +30 individuel/s.
- Hôpital de front : **+30 Alliance/s**, +30 individuel/s.
- Pôle scientifique : **+10 Alliance/s**, +30 individuel/s, déplacement gratuit rechargé 50 % plus vite.
- Centre d'information : **+10 Alliance/s**, +30 individuel/s, production des bâtiments capturés +10 %.
- Arsenal : **+10 Alliance/s**, +30 individuel/s, ATQ/DEF/PV alliés +15 %.
- Usine de mercenaires : **+10 Alliance/s**, +30 individuel/s, ATQ/DEF/PV ennemis -15 %.

Les guides publics et retours communautaires ne sont pas totalement cohérents sur certains timings/valeurs. WarBoost **ne fixe donc aucun minuteur de phase en dur**. Le plan utilise seulement les états robustes : **début / centre ouvert / fin**.

### Plan généré
À effectif complet, le moteur répartit les missions entre :
- Raffinerie + Science → ancrage/soutien Silo.
- Raffinerie + Info → soutien Silo.
- Hôpitaux → Arsenal.
- Hôpitaux → Usine de mercenaires.
- Groupe mobile → objectifs libres puis renfort Silo / côté faible.

Le groupe le plus solide est équilibré avec les autres ; WarBoost ne met pas tous les plus puissants dans une seule zone.

### Consignes courtes
Le plan affiche les noms par groupe et génère un texte court à copier dans le chat Alliance : objectifs d'ouverture, priorité centre, objectif final, règle de ne pas courir après les éliminations loin des bâtiments et appel de renfort par nom de bâtiment.

## 4. Comptes WarBoost à associer
- Si un compte attend une correspondance exacte avec le roster Last War, la section est rendue visible et actionnable.
- Le pseudo, serveur et alliance restent la base de correspondance ; aucune association n'est devinée.

## 5. Non-régression conservée
- Diagnostic PRO personnalisé, TOP 3 et Boutique IA.
- Joueur, jusqu'à 4 escouades, Drone, armes exclusives, équipements et historique.
- Alliance R5/R4/R3/R2/R1, R5 affiché séparément dans Last War supporté, `❓ Non renseigné`, départs/retours/changements de grade.
- VS, Saison, Support, récupération de mot de passe, invitations bêta.
- 23 langues explicites + Auto, y compris les nouvelles commandes Alliance/Tempête du Désert.
- 12 fonctions serverless Vercel.
- Safe Launch : aucun accès Last War non autorisé, aucun scraping, aucune automatisation de gameplay, paiements désactivés.
- Aucune suppression de données et aucun `localStorage.clear()`.

## 6. Supabase / déploiement
HF8.5 FINAL **n'ajoute aucune migration Supabase**. Conserver les migrations déjà installées. Le PATCH cible `public-beta-safe-launch` et **s'applique directement sur HF8.4** ; ne pas installer d'abord l'ancien brouillon HF8.5.

Lire `UPLOAD_GUIDE_V2_5_28_HF8_5_FINAL_ALLIANCE_DESERT_STORM.txt` avant déploiement.

## Migrations déjà installées à conserver
- `supabase/migration_v2_5_24_support.sql`
- `supabase/migration_v2_5_26_beta_invites.sql`
- `supabase/migration_v2_5_28_hf7_alliance_scope.sql`
- `supabase/migration_v2_5_28_hf8_commercial_readiness.sql`
