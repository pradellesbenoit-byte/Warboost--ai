# Test Vision contrôlé — préparation uniquement

**OFF par défaut. Aucune migration installée, clé créée, capture envoyée ni
dépense autorisée par ce document.** Ne pas utiliser main, warboost.fr, la démo
ou Supabase production. Ne pas réutiliser une clé OpenAI des joueurs.

## Ce que fait le banc

- Uniquement un déploiement **Preview de la branche
  `warboost-free-access-review-20261025`**, sur son origine HTTPS Vercel exacte.
  Aucun nouveau site/projet n'est nécessaire. Ne pas lever aujourd'hui le blocage
  de déploiement Git de cette branche.
- La case « Test Vision contrôlé » est décochée. Elle ne confère aucun droit :
  le serveur vérifie branche/environnement/origine, configuration, authentification
  GoTrue TEST, e-mail confirmé, consentement et empreinte du compte autorisé.
- L'aiguillage exige strictement `controlled_vision=true` dans la requête.
  Le flag serveur `WARBOOST_CONTROLLED_VISION=on` autorise ce parcours seulement
  après les autres contrôles privés ; il ne le sélectionne jamais automatiquement.
  Avec un champ absent ou `false`, les scans gardent leur parcours FREE/PRO
  ordinaire, que le flag serveur soit `off`, `on` ou absent/vide. Sans fournisseur
  ordinaire configuré, ils renvoient `SCAN_NOT_CONFIGURED` avant leur quota FREE ;
  la clé spéciale Preview n'est jamais un fallback pour eux.
- Un seul compte autorisé ; une campagne globale ; quatre **tentatives au plus**,
  une par type : `squad1`, `drone`, `technology`, `exclusive`. Une capture par
  tentative, pas de lot, pas de scan roster/alliance, ni de droits R4/R5 accordés.
- Budget de démonstration distinct du quota FREE normal. Il n'accorde ni PRO
  ni scan alliance ; les quotas FREE compte/IP/globaux et droits historiques
  restent inchangés pour le parcours normal. Le limiteur de cadence existant
  s'applique aussi au test avant sa réservation SQL.
- Une réservation atomique est faite AVANT l'unique appel Responses OpenAI.
  La clé dédiée n'est lue que dans `server/_controlled-vision.js`.
  Aucun fallback, outil, recherche, seconde passe portrait/équipement ou retry.
  `store:false`, modèle autorisé unique `gpt-6-luna`, 6 000 tokens de sortie max.
- Le compteur est persistant, commun aux instances et non remboursable. Une
  tentative échouée bloque également la campagne (verrou sans expiration).
  Un redémarrage de serveur ne remet rien à zéro.
- Aucun profil/snapshot n'est écrit par le handler de scan. Les sorties passent
  par les sanitizeurs et la revue habituels. Un résultat IA n'est pas une preuve
  de vérité ; seuls les champs explicitement confirmés doivent être sauvegardés.
  Ni puissance, ni étoiles, ni équipement absent ne doivent être inventés.
- Le registre SQL ne conserve que types, identifiants aléatoires de tentative,
  date et état technique. Pas de captures, prompts, résultats, e-mails, clés.
  L'empreinte du compte est une donnée **pseudonymisée d'autorisation**, pas
  une anonymisation. Elle est dans la configuration privée de campagne, pas
  dans le journal de résultats. Aucun journal applicatif de capture n'est ajouté.
  Ne pas activer la journalisation des corps HTTP chez l'hébergeur.

## Conditions AVANT toute activation : accord distinct requis

1. Faire revoir puis installer **seulement sur WarBoost-Test**
   `zaioadmbhqzeihkvdjsd` :
   `supabase/migration_controlled_vision_test.sql`.
   Le connecteur SQL admin doit imposer lui-même le project_id TEST, rôle
   `postgres`. La transaction exige le GUC local
   `warboost.approved_project_ref='zaioadmbhqzeihkvdjsd'`.
   Ce GUC est une déclaration d'approbation, **pas une preuve d'identité du
   projet**. L'installer à l'intérieur de la même transaction/session que le
   script (le fichier contient BEGIN/COMMIT). Ne pas se fier au texte du GUC seul.
   La migration ne crée aucune ligne de campagne et laisse tout OFF.
2. Exécuter l'audit SQL fourni sur TEST : RLS sur les deux tables, aucun droit
   direct de anon/authenticated/service_role, RPC EXECUTE service_role seul,
   SECURITY DEFINER postgres, search_path pg_catalog et timeouts fixés.
   Ne pas modifier les tables Auth, profils, quotas FREE, alliances ou grants.
3. Faire configurer une **unique** ligne de campagne par admin TEST, avec UUID
   aléatoire, SHA256 UTF-8 de l'identifiant GoTrue du seul testeur autorisé
   (calcul privé, pas de publication), expiration courte (par exemple une heure),
   `used=0`, `busy_request=NULL`, `enabled=false`. Aucune fonction publique ne
   crée, réinitialise ni renouvelle cette ligne. Vérifier préalablement l'absence
   d'ancienne campagne/tentative de ce banc. Une réinstallation ne remet rien à zéro.
4. Vérifier que client ET serveur Preview utilisent exclusivement Supabase TEST,
   avec compte testeur déjà autorisé et consentement. Ne pas envoyer de mail,
   créer de compte ou changer ses droits sous couvert de préparer ce banc.
   Protéger l'accès Preview ; son URL seule n'est pas un contrôle d'accès.
5. Préparer le projet API et la limite fournisseur ci-dessous. **Aucune activation
   tant que la maîtrise budgétaire n'a pas été vérifiée par le propriétaire.**

## Téléphone Android : préparation OpenAI manuelle, sans paiement aujourd'hui

1. Dans le tableau de bord API OpenAI, un propriétaire de l'organisation crée
   **ultérieurement, après accord**, un projet séparé du projet joueurs. ChatGPT
   et son abonnement ne constituent pas un crédit API. Si une carte, un achat
   de crédits ou des frais sont demandés, s'arrêter pour une décision séparée.
2. Dans ce projet : **Settings → Limits → Monthly spend limit : 2 USD**,
   activer **Enforce a hard limit**, pas seulement une alerte. Restreindre
   Model usage à `gpt-6-luna` et limiter la cadence. Si le réglage n'est pas
   disponible pour le compte, **NO-GO : ne pas activer**.
3. Attention : selon OpenAI, l'application de ce plafond peut être retardée et
   le total enregistré peut légèrement dépasser la valeur. **Ni quatre appels,
   ni notre variable d'approbation, ni l'alerte ne garantissent une facture
   mathématiquement ≤ 2 USD.** Si aucune tolérance au dépassement n'est admise,
   rester OFF jusqu'à obtention d'un mécanisme fournisseur réellement satisfaisant.
   Ce banc ne peut vérifier par lui-même les limites/factures du projet.
4. Après validation seulement, créer une clé privée du projet, restreinte à
   Responses, sans autres outils. Ne jamais la coller dans WarBoost, GitHub,
   un message, une capture ou une variable `VITE_`/`NEXT_PUBLIC_`.
5. Dans **Vercel → projet de Preview existant → Settings → Environment Variables**,
   choisir **Preview ET Git Branch = warboost-free-access-review-20261025**
   uniquement. Ne pas toucher Production, main ou la bêta publique. Préparer
   les noms suivants, sans donner de valeurs privées dans un rapport :

   | Nom serveur | Exigence |
   | --- | --- |
   | `WARBOOST_CONTROLLED_VISION` | `off` initialement ; `on` seulement après accord ; ne sélectionne jamais le parcours ordinaire |
   | `WARBOOST_VISION_TEST_ORIGIN` | origine HTTPS exacte du Preview `.vercel.app`, aucun chemin |
   | `WARBOOST_VISION_TEST_SUPABASE_URL` | `https://zaioadmbhqzeihkvdjsd.supabase.co` |
   | `WARBOOST_VISION_TEST_OPENAI_KEY` | clé privée `sk-proj-…` du projet distinct |
   | `WARBOOST_VISION_TEST_OPENAI_PROJECT` | identifiant `proj_…` correspondant |
   | `WARBOOST_VISION_TEST_MODEL` | `gpt-6-luna` uniquement |
   | `WARBOOST_VISION_TEST_CAMPAIGN` | UUID de la seule campagne privée |
   | `WARBOOST_VISION_TESTER_DIGEST` | empreinte privée du seul compte autorisé |
   | `WARBOOST_VISION_TEST_BUDGET_APPROVED` | `hard-limit-2-usd-reviewed`, seulement après contrôle humain |
   | `WARBOOST_TEST_SUPABASE_ANON_KEY` | clé JWT anon TEST, jamais production |
   | `WARBOOST_TEST_SUPABASE_SERVICE_ROLE_KEY` | clé JWT service_role TEST, serveur uniquement |

   `VERCEL_ENV=preview` et `VERCEL_GIT_COMMIT_REF` viennent de Vercel.
   Les URLs Supabase standard éventuellement présentes doivent aussi être TEST ;
   toute URL contradictoire bloque. Les anciens `OPENAI_API_KEY`,
   `WARBOOST_VISION_ENDPOINT` et `WARBOOST_VISION_SECRET` doivent être absents
   dans cet environnement. Aucune clé standard n'est un fallback.
   Les clés publishable opaques ne prouvent pas leur projet : ce premier banc
   exige les clés JWT TEST dont la provenance déclarée peut être contrôlée puis
   dont la validité réelle est vérifiée par Supabase. Le décodage des claims
   n'est pas une vérification cryptographique.
6. Les changements Vercel nécessitent une livraison Preview autorisée séparément.
   Aucun déploiement n'a été fait ici. Vérifier l'isolation et le contrôle
   d'accès avant de communiquer l'URL sur téléphone.

## Quatre essais, après autorisation et activation supervisée

Un opérateur met la seule ligne SQL `enabled=true` sous contrôle de projet ;
le propriétaire autorise `WARBOOST_CONTROLLED_VISION=on` sur Preview. Une case
ou un paramètre du navigateur ne peut pas remplacer ces contrôles.

Sur téléphone, ouvrir l'URL privée de recette, se connecter au compte TEST,
choisir la bonne langue, ouvrir Scan et cocher « Test Vision contrôlé ».
À chaque analyse, une confirmation indique qu'elle peut être facturée même
en cas d'échec. **Ne jamais recommencer automatiquement.**

1. **Escouade 1** : une capture « Détails de formation » lisible, éventuellement
   avions. Contrôler les cinq noms/positions, la classe et les quatre équipements
   visibles par héros. Les portraits/valeurs incertains restent à vérifier ;
   aucune seconde passe n'est autorisée. Ne pas se fier aux noms d'exemple.
2. **Drone** : une capture de l'écran principal, contrôler niveau/puissance
   visibles, pas les nombres d'un écran composants/chip à leur place.
3. **Technologie** : une seule capture ; vérifier chaque intitulé et sa valeur,
   le vrai 0 %, « Niveau Max » et « Verrouillée » sans les assimiler.
4. **Arme exclusive** : une capture lisible avec nom/titre/niveau/bonus visibles.
   Ne pas prendre la puissance de l'écran d'arme pour celle du héros.

Examiner les résultats dans la revue, annuler en cas de doute. La confirmation
humaine avant sauvegarde reste obligatoire. Conserver ses captures **sur son
téléphone**, pas dans le dépôt ni un rapport public ; masquer les données privées
inutiles avant envoi. OpenAI reçoit nécessairement les pixels envoyés ;
`store:false` ne garantit pas une rétention nulle chez le fournisseur.

Ce premier plafond ne permet **pas** de valider de vraies captures Technologie
multi-écrans : le lot est volontairement refusé. La fusion prudente reste testée
localement ; une campagne élargie exigerait un nouvel accord, pas un contournement.
Après chaque tentative, comparer le compteur technique et les coûts dans le
projet API distinct ; les montants peuvent apparaître avec retard.

## Arrêt / échec / reprise

- Un refus OFF, clé manquante, origine/compte non autorisé ou registre absent ne
  lance aucun appel IA. Les erreurs restent localisées et ne révèlent pas la clé.
- Si réservé puis fournisseur en erreur ou réponse perdue : **STOP**, aucun
  remboursement/retry/nouvelle campagne. Le verrou persiste, même après expiry.
  Une vérification privée des compteurs/fournisseur par opérateur est requise.
  Aucun outil de réinitialisation automatique n'est fourni.
- Éteindre d'abord la campagne SQL (`enabled=false`), sous le même verrou et avec
  project_id TEST imposé : `rollback_controlled_vision_test.sql` fait cet arrêt
  sans supprimer l'historique et sans empêcher finish. Cela ne peut pas annuler
  un appel déjà parti. Ne jamais supprimer une tentative pour récupérer du budget.
- Mettre ensuite `WARBOOST_CONTROLLED_VISION=off`, invalider la clé dédiée si
  nécessaire dans son projet. Vérifier OFF sur la nouvelle configuration Preview :
  une demande explicite expérimentale est refusée sans réservation ni appel IA.
  OFF n'est pas un interrupteur global des autres fonctions IA : les requêtes
  ordinaires continuent leur parcours FREE/PRO avec leur propre configuration.
  Ni `off` ni l'absence du flag n'autorise une requête expérimentale.
- Aucune action directe sur les comptes/profils/sauvegardes n'est nécessaire.
  La sauvegarde volontaire d'une revue modifie ses propres données TEST :
  elle n'est jamais une autorisation de toucher les données des joueurs.

## Références consultées, pas d'appel d'inférence

- https://developers.openai.com/api/docs/models/gpt-6-luna : images en entrée,
  Responses, sorties structurées, reasoning none, tarif affiché faible.
- https://help.openai.com/en/articles/9186755-managing-your-work-in-the-api-platform-with-projects :
  projet distinct, permissions, limites et avertissement sur délai d'application.

Disponibilité dans **le compte réel**, qualité Last War, politique de rétention,
coût réel et budget n'ont pas été testés. Ce document n'est pas un GO commercial.
