# Veille Last War et Diagnostic PRO — limites et exploitation

## Ce qui fonctionne

- Diagnostic déterministe, sans nouvel appel IA, service payant ou coût d'abonnement. L'OCR/Vision existant reste inchangé.
- Après confirmation d'un scan, l'escouade réellement choisie devient la cible du diagnostic ; la fiche permet de choisir 1–4 sans modifier les compositions.
- Seules les identités explicitement confirmées et les champs portant une provenance de confirmation sont utilisables. Les registres historiques/armes/escouades voisines ne réhydratent pas le diagnostic ciblé.
- Les données d'autres escouades et les captures brutes ne sont jamais envoyées aux sites de veille. Un niveau d'équipement 0 est une observation valide ; une absence de niveau n'est pas 0.
- Priorités relatives personnalisées, au maximum trois : écarts observés de niveaux/étoiles/armes et équipement. Coût et prérequis restent à consulter dans le jeu ; aucun gain, prix, budget disponible ou achat n'est inventé. Les suggestions sans règle officielle applicable sont des **hypothèses**, pas une nouvelle méta certifiée.
- Plan de sept jours prudent : vérification, examen des priorités/coûts, puis contrôle des progrès. Pas de quantité de ressources ni d'amélioration automatique.
- Les positions avant/arrière restent à confirmer en l'absence de preuve explicite. La classe provient des identités confirmées, jamais d'une déclaration « équipe Tank » seule.
- Les nouvelles commandes/étiquettes sont disponibles dans les 22 langues existantes. Les noms, citations sources et valeurs de gameplay ne sont pas traduits/inventés.
- Le W existant accompagne la vérification réelle des sources et le diagnostic ; il est arrêté dans `finally`, y compris en erreur/timeout. Pas de nouveau pourcentage.

## Sources et constat réel

Registre : `assets/last-war-knowledge.json`.

Sources officielles de découverte :

- https://wiki.lastwar.com/ : le rendu public consulté montre notamment « Sep Week 4 Update », « Sep Week 3 Update » et « September Week 2 Update ». L'hébergement officiel contient aussi des contributions communautaires : **hébergement officiel ≠ auteur officiel**. La réponse HTTP brute est une coquille JavaScript, pas le texte des annonces.
- https://www.lastwar.com/ : réponse 503 lors de la consultation ; vérification automatique des robots indisponible.

Sources communautaires facultatives, désactivées par défaut :

- https://lastwar.wiki/
- https://lastwarvault.com/

**Aucune nouvelle règle de gameplay officiellement vérifiée n'a été importée dans cette passe.** Les annonces de la page d'accueil ne fournissent pas, seules, une date et un périmètre de déploiement suffisamment vérifiables. La veille signale cette limite ; elle ne promet pas de connaître toutes les nouveautés en direct.

## Vérification à la demande et persistance

1. Dans Diagnostic PRO, « Vérifier les sources » appelle `/api/advice?action=knowledge_refresh`. Authentification, consentement et droits PRO restent contrôlés par le garde-fou serveur existant, bêta incluse.
2. Chaque URL vient du registre local, jamais du corps de la requête joueur. HTTPS et domaines autorisés seulement ; aucun redirect automatique.
3. Respect de robots.txt, taille bornée, délai de 8 secondes/source, deux sources concurrentes, maximum quatre sources. Pas de mot de passe Last War, d'API privée, d'images ou de données joueur.
4. Cache de 24 heures par processus ; les tentatives datées du registre sont respectées après démarrage. Une fonction serverless peut perdre son cache mémoire : ce n'est pas un verrou global distribué.
5. Le résultat est utilisable pendant la vie du processus ; pour conserver durablement les vérifications dans une prochaine version, l'opérateur lance **`npm run knowledge:refresh`**. Le script met à jour atomiquement le registre local (une tentative par 24 heures), sans base de production et sans publication. Vérifier son diff avant un éventuel commit.
6. Les diagnostics suivants lisent une révision locale modifiée et se recalculent. Le bouton recalcule immédiatement la fiche après vérification. Un diagnostic déjà affiché n'est pas un abonnement temps réel à un flux d'actualités.

Le scheduler est **désactivé**. Aucun cron Vercel, service payant ou secret n'a été créé. Fréquence proposée si un hébergement avec scheduler autorisé est choisi : une vérification quotidienne par opérateur/scheduler unique, pas un rafraîchissement par joueur. Avant activation : choisir stockage persistant partagé, verrou global et authentification opérateur ; ne pas exposer un cron public.

## Approuver une vraie annonce sans transformer une rumeur en règle

La vérification HTTP est réelle mais **n'interprète pas automatiquement du HTML en gameplay**. Pour une annonce lisible publiquement :

1. Vérifier l'auteur éditeur Last War et l'annonce complète, pas seulement une vignette ou un extrait. Ajouter son URL précise comme source officielle `editorial: "publisher"`, `enabled: true`.
2. Relever `published_at`, région/version/serveur/saison et prérequis. Une date inconnue reste inconnue. Ne pas déduire la date d'un nom d'image.
3. Ajouter un fait avec `id`, `source_id`, `source_url`, `statement`, `evidence_quote` (au moins 80 caractères exacts du texte public normalisé), `reviewed_at`, `review_status: "approved"`, `confidence: "confirmed"`, `topic` et `scope`.
4. `topic` autorisé : `level`, `stars`, `gear`, `exclusive`, `drone`, `technology`. `scope.kind` : `global` uniquement si le caractère global est réellement attesté, sinon `region` avec région précise. Ajouter `server`, `season`, `version`, `hq_min`, `squad_type`, `hero`, `valid_until` selon la preuve ; les prérequis inconnus côté joueur empêchent l'application.
5. `approved_source_hash` doit être le SHA-256 du texte visible normalisé réellement relu. Il n'est jamais déduit du seul titre.
6. La prochaine vérification doit retrouver la citation **et le même hash**. Une page modifiée, inaccessible, communautaire ou sans auteur éditeur remet `evidence_verified` à false ; elle ne devient pas automatiquement une nouvelle règle.
7. Une vérification de plus de sept jours, une date future, une règle expirée ou un périmètre incompatible exclut le fait. Une règle approuvée ne change aucune statistique joueur ; elle documente/priorise uniquement des conseils utilisant ses observations confirmées.

Pour les pages exclusivement JavaScript, le contrôle automatique reste en mode dégradé `source_requires_public_browser_review`. Il faut une annonce publique exploitable ou un adaptateur de rendu public autorisé avant d'en faire une source automatisée. Aucun endpoint CMS non documenté n'est rétro-ingéniéré.

## Tests et validations restantes

`npm run test:knowledge-guidance` vérifie les quatre cibles, Tank/Avion/Missile, absence de réhydratation historique, valeurs remplacées, niveau d'équipement 0, rechargement JSON, périmètres des faits, communauté non officielle, fraîcheur, changement de page, robots/SSRF, échec HTTP, recomposition des conseils et les 22 rendus.

Les annonces utilisées pour simuler un changement de règle sont explicitement **synthétiques**, jamais intégrées au registre livré. Les tests existants assurent la non-régression scan/provenance/armes/Technologie/Alliance/W.

Restent nécessaires : validation connectée de la fiche sur téléphone, coûts/ressources/positions réels, reconnaissance réelle des captures Tank encore ambiguës, et validation éditoriale d'annonces complètes applicables. Ni Android/iOS physique, ni précision Vision réelle, ni qualité optimale d'un plan de bataille ne sont établis par des fixtures.
