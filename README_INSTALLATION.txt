WARBOOST V2.5.28 HF8.6.28 — RELIABILITY PATCH R1
Base vérifiée : branche public-beta-safe-launch
Base commit : f963fb697e2bfd51308804589c8f1d101e2a5a48

BUT DU PATCH
1) Corriger l'échec répété « La capture n'a pas pu être analysée » sur WarBoost Scan.
2) Revenir à un parcours de scan robuste : extraction utile d'abord, enrichissement des portraits ensuite et seulement s'il reste du temps.
3) Si le moteur Vision personnalisé échoue ou expire, basculer proprement vers le moteur OpenAI au lieu d'abandonner le scan.
4) Empêcher les appels IA optionnels de faire dépasser la limite client de 60 s.
5) Corriger l'état contradictoire ToyN / [ALL4]ToyN sans modifier les pseudos affichés du roster, les grades ou les associations déjà valides.
6) Imposer une association 1 compte WarBoost <-> 1 membre du roster.

FICHIERS À REMPLACER DANS LE DÉPÔT
- api/scan.js
- lib/alliance-identity.js
- lib/alliance-roster-merge.js
- publisher-ui.js
- sw.js

FICHIER OPTIONNEL DE VÉRIFICATION
- scripts/verify-hf8-6-28-reliability-r1.mjs

IMPORTANT
- Ne supprime aucun autre fichier du dépôt.
- Garde exactement les chemins ci-dessus.
- Ce patch reste sur V2.5.28 HF8.6.28 : ce n'est pas une fausse nouvelle version applicative.
- Le nouveau cache Service Worker force la récupération des fichiers corrigés après déploiement.

SCAN — GARANTIES AJOUTÉES
- Budget total serveur : 52 s, inférieur au délai client de 60 s.
- Vision personnalisée : tentative courte (9 s max), puis fallback OpenAI.
- Extraction OpenAI principale : plafonnée à 34 s.
- Identification/validation des héros par portrait : best-effort, plafonnée et ignorée si le budget restant est insuffisant.
- Un échec de l'identification optionnelle des portraits ne transforme plus un scan utile en erreur globale.
- La capture temporaire déjà sauvegardée côté appareil reste intacte en cas d'échec.

IDENTITÉ / ROSTER — GARANTIES AJOUTÉES
- [ALL4]ToyN et ToyN sont comparés via une clé normalisée, mais l'affichage d'origine n'est pas réécrit arbitrairement.
- Serveur + alliance restent obligatoires pour toute association automatique sûre.
- Un membre déjà lié à un autre compte ne peut pas être volé.
- Un même compte ne peut pas être lié à deux membres.
- Les doublons cloud du même player_id sont éliminés avant fusion.
- Un compte déjà prouvé comme lié n'est plus conservé simultanément dans « Comptes WarBoost à associer ».
- Les grades et noms canoniques du roster restent prioritaires.

TEST APRÈS DÉPLOIEMENT
1) Ouvrir WarBoost sur le téléphone du joueur testeur.
2) Refaire exactement une capture Escouade 1 qui échouait avant.
3) Appuyer sur « Analyser la capture » : le scan de base doit maintenant revenir même si la reconnaissance optionnelle des portraits est indisponible.
4) Fermer/réouvrir WarBoost et vérifier que les données validées restent enregistrées.
5) Dans Alliance, vérifier que ToyN n'apparaît pas à la fois comme lié et « à associer ».
6) Vérifier qu'aucun grade R5/R4/R3/R2/R1 valide n'a changé.

NOTE GITHUB
La connexion GitHub disponible dans cette session permet la lecture du dépôt mais la création de branche a été refusée par GitHub avec « Resource not accessible by integration ». Le ZIP est donc prêt à être déposé manuellement ; rien n'a été prétendu déployé automatiquement.
