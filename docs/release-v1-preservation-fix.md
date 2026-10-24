# Correctif local V1 → V2 : conservation, pas nouvelle confirmation

## Périmètre

Branche `warboost-release-v2-review-20261024`, sur la préparation
`a5b3c60dcf3cc0803ff9ff2f9bfb2836a3d910d0`, issue de main
`59945b3e8f50c9f2c8b3cb58bd16fe8f6f1daa54`.
Aucun changement de branche dans le workspace principal, de déploiement,
de configuration Vercel, de SQL réel ou d'API de production.

## Défauts reproduits et correction

- Deux tests rouges avant correction : disparition des noms/positions/champs
  V1 sur normalisation V2 et échec du cycle écriture/rechargement, pour deux
  propriétaires synthétiques indépendants.
- L'ancienne normalisation V1 exacte, chargée depuis main, écrit `version:
  "1.3.3"`. Seul ce contrat explicite déclenche la transition. Aucun assouplissement
  pour les sorties OCR V2 non confirmées ou les formats anciens inconnus.
- La transition conserve les quatre escouades et les champs historiques dans
  leurs slots, avec `legacy_saved_v1` / `legacy_v1`. Elle n'ajoute ni cinq noms
  « confirmés V2 », ni date de confirmation, ni étoile/puissance absente.
  Les anciens libellés générés « Hero 4 » restent des noms inconnus.
- Le document original est conservé une seule fois dans le JSON du même
  propriétaire, sous `legacy_v1_backup`. La fonction inverse vérifie propriétaire
  et version et restitue ce document. Ce n'est ni un dump PostgreSQL restauré,
  ni une preuve d'authentification, ni une restauration de production.
- La transition intervient avant normalisation serveur et avant fusion navigateur.
  Les propositions incertaines ne remplacent pas les identités historiques :
  elles demandent une vérification. Les champs revus séparément peuvent évoluer.
  Les compositions nouvelles explicitement confirmées et l'effacement volontaire
  restent prioritaires sur les anciens snapshots.
- Le chargement de profils globaux ne remplit pas automatiquement les puissances
  individuelles manquantes d'une escouade V1.
- Une régression additionnelle détectée pendant les nouveaux tests concernait
  le déplacement d'un marqueur V1 lors d'une permutation explicite. Son numéro
  d'escouade est maintenant relocalisé, sans inventer de confirmation d'identité.

## Stripe : fixture manquante

Trois copies exactes de SQL publié dans la revue filtrée sont placées sous
`scripts/fixtures/billing/`. Aucune migration n'a été ajoutée sous `supabase/`.
Le helper billing charge ces copies par URL de fichier dans PGlite en mémoire.
Les comptes, événements et réponses Stripe sont fictifs. La suite passe ses
21 scénarios, dont les refus LIVE. Aucun appel au fournisseur ni activation LIVE.

## Validation exécutée, réseau bloqué

Commandes lancées depuis le worktree de release, environnement de processus
réduit aux paramètres nécessaires et valeurs de test synthétiques ; préchargement
de `scripts/release/no-network.cjs` refusant les transports réseau.

19 scripts de tests PASS, puis `npm run check` PASS et `npm run build` PASS :

```text
node scripts/release/verify-legacy-preservation.mjs
node scripts/release/verify-v1-transition.mjs
node scripts/release/verify-v1-local-sql.mjs
node scripts/verify-stripe-test.mjs
node scripts/verify-squad-scan-targets.mjs
node scripts/verify-scan-handlers-mobile.mjs
node scripts/verify-scan-review.mjs
node scripts/verify-cloud-save-diagnostic.mjs
node scripts/verify-mobile-auth-isolation.mjs
node scripts/verify-launch-privacy-races.mjs
node scripts/verify-hero-recognition.mjs
node scripts/verify-equipment-scan.mjs
node scripts/verify-formation-vision-batch.mjs
node scripts/verify-field-freshness.mjs
node scripts/verify-technology-scan.mjs
node scripts/verify-drone-scan.mjs
node scripts/verify-roster-scan-mobile.mjs
node scripts/verify-roster-anti-rollback.mjs
node scripts/verify-analysis-indicator.mjs
npm run check
npm run build
```

Ces 19 scripts rapportent 64 sous-tests Node PASS, zéro FAIL ; d'autres
vérifications utilisent leurs propres scénarios/assertions, dont les 21 Stripe.
Ne pas additionner assertions et sous-tests comme autant de parcours réels.
Les deux tests SQL de release utilisent **PGlite/WASM**, pas PostgreSQL natif,
Supabase ni une restauration de sauvegarde réelle.

Le test dédié contient 13 sous-tests : quatre escouades, deux propriétaires,
roundtrip JSON, provenance sans confirmation fictive, idempotence, inversion,
refus d'un marqueur étranger/mauvais slot, bootstrap, nouveaux noms incertains,
champ explicitement revu, ancien snapshot/effacement volontaire, permutation,
placeholders et vraie fonction `mergeSquadPayload` extraite d'app.js.
Ses dépendances et transports sont simulés ; aucun navigateur Android réel.

Le build contient huit pages et 150 modules navigateur ; il n'inclut pas les
fixtures billing, scripts serveur, journaux ni archive privée.
La garde d'histoire Git s'exécute après le commit local pour contrôler les deux
commits de release, l'absence d'archive privée accessible, les configurations
inchangées et les formats reconnaissables de credentials dans les textes.

## Toujours NO-GO production

- Aucun compte réel, email, photo Last War, scan Vision, JWT de production,
  écriture cloud ou API Stripe réelle testé.
- Pas de parcours physique Android/iPhone, reconnexion Supabase réelle ni
  reprise après interruption réseau réelle de la nouvelle transition.
- Les formats V1 autres que le contrat précis `1.3.3` ne sont pas reconnus
  implicitement. Ils doivent être inventoriés et testés sur données autorisées.
- La copie JSON inverse est vérifiée en local ; sauvegarde complète, restauration
  PostgreSQL, rollback code + données en conditions réelles NON vérifiés.
- Compte/projet/domaines/branches/déclencheurs Vercel `warboost_v4` non vérifiés.
  Les réglages existants main ne constituent pas une configuration V2 validée.
- Aucun push, PR, merge, serveur/Preview ou déploiement effectué.

Prochaine validation proposée seulement après accord : recette V1 → V2
isolée sur staging avec données fictives, puis preuve de restauration et contrôle
de la cible Vercel avant toute livraison.
