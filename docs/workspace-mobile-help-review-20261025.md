# Compte et espace autonome : corrections mobiles et notice

Branche : `warboost-free-access-review-20261025`, base `0027a11fd0e7eb7cd79488e14f488bbf714532fb`.

## Corrections

- Étiquette en bloc au-dessus du brouillon, textarea pleine largeur, boutons tactiles
  de hauteur minimale 44 px et empilés sur petit écran. Aide repliable près de Compte
  et Alliance, sans déplacer le bouton de fermeture.
- Erreur de syntaxe avec numéro de ligne pour `R3.` ; aucun effacement de la saisie,
  aucune correction automatique de grade. Le grade reste facultatif.
- Distinction entre modifications non enregistrées et brouillon confirmé par réponse
  serveur. Une saisie effectuée pendant la requête survit et reste signalée non enregistrée.
- Roster vide explicite après lecture ; message de chargement confirmé seulement après
  réponse serveur valide. Les grades du profil et du roster sont déclarés non vérifiés,
  avec avertissement en cas de différence.
- Actions Approuver/Refuser uniquement pour les demandes en attente ; statuts traduits.
  Blocage des doubles clics, validation des contrats de réponse et rejet des réponses
  tardives d'une autre session. Aucun nouvel endpoint ou droit.
- Une vérification cloud réussie de la révision courante est affichée comme telle,
  sans fabriquer de date de sauvegarde ni de reçu d'écriture. Les modifications locales,
  conflits, refus et erreurs restent prioritaires.
- Notice en 22 langues, anglais britannique/américain inclus, direction arabe RTL :
  création, brouillon, réception des demandes, inscription FREE, e-mail, identité exacte,
  cloud, approbation, accès et dépannage. Remplacement des libellés d'invitation générale.
  Les contrôles d'accès externe à Last War sont inchangés.

## Vérifications locales finales

Les commandes Node sont exécutées avec environnement vidé, uniquement des valeurs
synthétiques `.invalid`, et le bloqueur réseau `scripts/release/no-network.cjs`.

| Commande | Résultat |
| --- | --- |
| `node --require ./scripts/release/no-network.cjs --test scripts/workspace-mobile-feedback.test.mjs scripts/free-access.test.mjs scripts/free-workspace.test.mjs` | 81 PASS, 0 FAIL, 0 ignoré |
| `node --require ./scripts/release/no-network.cjs scripts/verify-account-sync-feedback.mjs` | 48 groupes PASS, 2185 messages localisés vérifiés |
| `node scripts/verify-free-access-sql.mjs` | PostgreSQL natif local jetable : 30 groupes PASS, 0 FAIL, 0 appel externe |
| `npm run check` et syntaxe explicite des nouveaux modules/tests | PASS |
| `npm run build:web` | PASS : 8 pages, 154 modules navigateur |
| `git diff --check` | PASS |

La première passe Node a signalé quatre échecs de banc : trois anciens contextes VM
ne chargeaient pas les nouveaux helpers/états, et le test de langues traitait
« auto » comme une langue. Corrigés sans supprimer de scénario. La première passe de
la suite cloud a aussi révélé une fixture Auth sans e-mail confirmé ; elle représente
maintenant un utilisateur fictif confirmé. La protection serveur n'a pas été affaiblie.

## Limites et recette future

Tests des vrais handlers avec DOM/événements et transports simulés, pas un navigateur
Android/iPhone ni une validation des pixels, du clavier ou de l'affichage réel.
Les contenus de notice sont localisés ; une relecture linguistique humaine reste utile.
PostgreSQL local ne prouve pas la compatibilité complète du service Supabase géré.
Aucune migration ou modification de schéma dans ce correctif.

Avant une recette réelle : vérifier séparément l'origine HTTPS de test, l'isolation
client/serveur et le secret anti-abus ; ne pas démarrer le Preview normal en supposant
qu'il utilise TEST. Sur environnement isolé approuvé : essayer un brouillon `Pseudo ; R3.`,
le corriger, enregistrer, rouvrir, demander l'accès avec un second compte de test,
approuver/refuser, changer de langue, vérifier le refus inter-espace et les erreurs réseau.
La création de comptes, les mails et les appels réels nécessitent un accord distinct.

Pas de publication, changement de `main`, démo, paiements, secret, journal privé ni
donnée réelle. La branche de revue conserve `deploymentEnabled=false` dans Vercel ;
son éventuel push ne constitue pas une mise en ligne.
