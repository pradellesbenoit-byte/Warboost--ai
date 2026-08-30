# WarBoost V2.5.10

**Season Lifecycle Reliability**

V2.5.10 corrige le défaut Saison observé sur la V2.5.9 : une progression absente ne doit jamais devenir `0 %`, et une saison terminée ne doit jamais continuer à piloter des recommandations S6 comme si elle était active.

## Cycle Saison fiable

WarBoost distingue désormais quatre états :

- `active` — saison réellement active ; jour/progression peuvent alimenter l'IA s'ils sont connus ;
- `ended` — saison terminée ; les valeurs restent historiques et ne pilotent plus les conseils actifs ;
- `interseason` — entre-saisons ; dernière saison et dernière profession restent visibles à titre historique ;
- `unknown` — état non confirmé ; WarBoost demande une actualisation au lieu d'inventer un état.

Une progression absente reste `null` / inconnue. Le `0 %` n'est conservé que lorsqu'il est réellement associé à une saison active confirmée.

## S6 terminée

Quand la Saison 6 est marquée terminée / entre-saisons :

- aucune recommandation Éveil S6 n'est considérée active ;
- les priorités S6 ne modifient plus la valeur des héros ;
- les signaux S6 ne modifient plus le timing Boutique / Joueur ;
- la profession enregistrée est conservée comme dernière profession connue ;
- aucune progression S6 actuelle n'est affichée ;
- l'IA conseille d'attendre / actualiser l'ouverture de la prochaine saison avant une dépense saisonnière rare.

Le bonus de formation mono-type (+5 / +15 / +20 % selon la composition) reste un mécanisme général de formation Last War, indépendant du statut Saison ; il n'est donc pas supprimé du moteur Joueur. En revanche, V2.5.10 empêche de l'afficher comme un conseil S6 actif lorsqu'une saison est terminée.

## Saisie / scan

Le tiroir Saison possède maintenant un sélecteur d'état manuel : Auto / Active / Terminée / Entre-saisons. Le Scan Saison peut aussi fournir `lifecycle` uniquement si l'état est explicitement visible sur la capture. Aucune déduction cachée n'est autorisée.

## Non-régression

V2.5.10 conserve les validations V2.5.2–V2.5.9 : Escouade 1 principale, Plan Joueur 7 jours, 23 langues, 31 héros, Scan/OCR, Boutique IA avec séparation Pertinence / Confiance / Disponibilité, Alliance R5/R4, Plan B, activité prudente, invitation Alliance serveur, appartenance Alliance unique, VS dimanche en préparation avec reset UTC−2, cloud Supabase et protection des données locales.

Aucune migration de schéma Supabase n'est requise en V2.5.10 : les nouveaux champs Saison vivent dans l'état JSON existant.
