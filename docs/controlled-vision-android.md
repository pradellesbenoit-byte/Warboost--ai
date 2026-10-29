# Test Vision contrôlé — préparation uniquement

**OFF par défaut. La migration v2 n'est pas installée ; aucune nouvelle clé,
capture ou dépense n'est autorisée par ce document.** Ne pas utiliser main, warboost.fr, la démo
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
- Le nouveau banc préparé autorise au plus **une seule tentative** pour `squad1`
  et une seule capture. Drone, Technologie, arme exclusive, autres escouades,
  roster et scans d'alliance sont refusés en mode contrôlé. Aucun droit R4/R5
  n'est accordé.
- Budget de démonstration distinct du quota FREE normal. Il n'accorde ni PRO
  ni scan alliance ; les quotas FREE compte/IP/globaux et droits historiques
  restent inchangés pour le parcours normal. Le limiteur de cadence existant
  s'applique aussi au test avant sa réservation SQL.
- Une réservation atomique est faite AVANT l'unique appel Responses OpenAI.
  La clé dédiée n'est lue que dans `server/_controlled-vision.js`.
  Aucun fallback, outil, recherche, seconde passe portrait/équipement ou retry.
  `store:false`, modèle autorisé unique `gpt-6-luna`, 6 000 tokens de sortie max.
- Pour une escouade, les atlas publics du projet déjà vérifiés par manifeste et
  SHA256 sont joints à cette même requête, sans nouvel appel IA ni lecture de
  profil. Les cinq lignes restent ordonnées et séparées du drone. Une référence
  vérifiée ne signifie pas une correspondance de portrait certifiée : chaque
  proposition visuelle exige confirmation humaine ; les variantes non attestées
  restent incertaines. Les données absentes ne sont pas remplies par les atlas.
  Ces images de référence ajoutent des tokens d'entrée : même un appel unique ne
  garantit pas un montant monétaire maximal.
- L'ancien registre à quatre tentatives, consommé (4/4) et désactivé, reste intact.
  Le nouveau schéma est séparé et versionné ; la préparation locale ne le migre
  pas, ne crée aucune nouvelle ligne de campagne, et ne réarme ni compteur,
  flag ou clé. Aucun nouvel essai réel n'est autorisé par ce travail.
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
   `supabase/migration_controlled_vision_squad1_v2.sql`.
   Le connecteur SQL admin doit imposer lui-même le project_id TEST, rôle
   `postgres`. La transaction exige le GUC local
   `warboost.approved_project_ref='zaioadmbhqzeihkvdjsd'`.
   Ce GUC est une déclaration d'approbation, **pas une preuve d'identité du
   projet**. L'installer à l'intérieur de la même transaction/session que le
   script (le fichier contient BEGIN/COMMIT). Ne pas se fier au texte du GUC seul.
   La migration ne crée aucune ligne de campagne et laisse tout OFF.
2. Exécuter `supabase/audit_controlled_vision_squad1_v2.sql` sur TEST : RLS sur
   les nouvelles tables, aucun droit
   direct de anon/authenticated/service_role, RPC EXECUTE service_role seul,
   SECURITY DEFINER postgres, search_path pg_catalog et timeouts fixés.
   Ne pas modifier les tables Auth, profils, quotas FREE, alliances ou grants.
3. Après une autorisation distincte et tous les prérequis budgétaires, un admin
   TEST pourra configurer une **unique** ligne V2 avec UUID
   aléatoire, SHA256 UTF-8 de l'identifiant GoTrue du seul testeur autorisé
   (calcul privé, pas de publication), expiration courte (par exemple une heure),
   `used=0`, `busy_request=NULL`, `enabled=false`. Rien ne crée cette ligne dans
   la migration : aucune RPC client ne crée, réinitialise ni renouvelle de
   campagne. L'ancien registre V1 4/4 reste séparé et inchangé ; ne pas l'effacer
   ou le réutiliser. Une réinstallation V2 ne remet aucun compteur à zéro.
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
   le total enregistré peut légèrement dépasser la valeur. **Même un appel,
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
    | `WARBOOST_VISION_TEST_CAMPAIGN_V2` | UUID de l'unique campagne V2 privée ; la variable V1 n'est jamais utilisée |
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

## Une tentative future, uniquement après autorisation distincte

Le code V2 accepte uniquement `squad1` avec une seule capture, et un seul appel
OpenAI sans retry. L'ancien registre 4/4 est historique et ne sera ni modifié ni
réutilisé. Le nouveau registre V2 est vide après migration ; un administrateur
devra créer une unique campagne désactivée seulement après examen du projet
fournisseur, puis l'activer par une étape séparée. Rien de cela n'a été fait ici.

Après autorisations et contrôles futurs, ouvrir la Preview privée, se connecter
au compte TEST autorisé, choisir « Escouade 1 », puis utiliser la case qui
n'apparaît que pour cette catégorie. La confirmation rappelle le risque de coût.
Examiner les cinq propositions avant toute confirmation humaine et sauvegarde ;
aucune seconde analyse ni autre type de scan n'est prévu dans cette campagne.
Conserver les captures sur le téléphone, pas dans le dépôt ni un rapport public.
OpenAI recevrait nécessairement les pixels ; `store:false` ne garantit pas une
rétention nulle chez le fournisseur.

Le plafond de requêtes (une seule) **n'est pas un plafond monétaire garanti**.
Le modèle reçoit aussi les images de référence de portraits, qui ajoutent des
tokens d'entrée. Toute campagne élargie exigerait un nouvel accord.

## Diagnostic SCAN_NOT_CONFIGURED

Le `503 SCAN_NOT_CONFIGURED` observé signifie que le fournisseur standard
d'analyse n'est pas configuré dans l'environnement Preview. Le handler vérifie
ce point avant la réservation du quota FREE : selon le journal rapporté, aucun
quota n'a été consommé. Ce code ne prouve ni panne ni remise à zéro du registre
Vision contrôlé. Pour diagnostiquer plus tard, vérifier dans les paramètres
Preview de la bonne branche si le fournisseur prévu y est configuré, sans
afficher, copier ou envoyer la valeur. Ne jamais recopier une clé de production.
La clé réservée au mode contrôlé reste isolée et n'est pas un fallback du scan
normal.

Aucun endpoint de préparation n'a été ajouté : sans accès sûr aux réglages
fournisseur ni à une campagne enregistrée, un tel endpoint ne pourrait pas
prouver le plafond financier ou l'autorisation humaine ; il risquerait surtout
de révéler des métadonnées d'environnement.

## Arrêt / échec / reprise

- Un refus OFF, clé manquante, origine/compte non autorisé ou registre absent ne
  lance aucun appel IA. Les erreurs restent localisées et ne révèlent pas la clé.
- Si réservé puis fournisseur en erreur ou réponse perdue : **STOP**, aucun
  remboursement/retry/nouvelle campagne. Le verrou persiste, même après expiry.
  Une vérification privée des compteurs/fournisseur par opérateur est requise.
  Aucun outil de réinitialisation automatique n'est fourni.
- Éteindre d'abord la campagne SQL (`enabled=false`), sous le même verrou et avec
  project_id TEST imposé : `stop_controlled_vision_squad1_v2.sql` fait cet arrêt
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
