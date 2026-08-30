# WarBoost V2.3.3 — Diagnostic PRO Resource Arbiter + Protected Migration

Date: 25/08/2026

## Base de continuité

V2.3.3 est construite à partir de la **V2.3.1 complète** (correctif Vercel serverless) avec le **patch Diagnostic PRO V2.3.2** fusionné dessus. Les 12 fonctions API de la V2.3.1 sont conservées : aucune nouvelle fonction serverless n'est ajoutée.

## Diagnostic PRO V2.3.3

Le moteur ne choisit plus un TOP 3 uniquement à partir de la puissance brute. Pour chaque option détectée il compare maintenant :

- héros par héros ;
- palier d'arme exclusive suivant : EX0–9 → EX10, EX10–19 → EX20, EX20–29 → EX30 ;
- Drone ;
- impact marginal ;
- coût relatif (indice interne, jamais une quantité inventée) ;
- ROI / efficacité des ressources ;
- jour VS ;
- position dans la Saison ;
- preuves méta datées disponibles.

La réponse PRO expose maintenant :

- `bottleneck` : le goulot principal détecté ;
- `resource_plan` : où concentrer les ressources et à quel moment ;
- `decision_trace` : jusqu'à 6 options comparées pour expliquer le classement ;
- `cross_context.spend_decision` : `spend_now`, `hold_for_vs`, `validate_payback`, `roi_driven` ou `insufficient_data` ;
- un `timing_window` sur chaque priorité ;
- un `relative_cost` sans nombre officiel de fragments lorsque WarBoost ne possède pas une table de coûts officiellement validée.

### Règle anti-invention

WarBoost **n'invente jamais** une quantité exacte de fragments, composants ou matériaux. Tant qu'une table de coûts fiable et officiellement validée n'est pas intégrée, V2.3.3 utilise uniquement un indice de coût relatif.

## Migration protégée des anciennes données

V2.3.3 importe prudemment, uniquement dans les champs vides, les anciennes données locales reconnues :

- `wb12_account` / `wb11_account` ;
- `wb10_profile` ;
- `wb10_alliance` ;
- `wb10_simple` ;
- `wb10_roster`.

Les anciennes clés ne sont pas supprimées. Une mise à jour ne doit donc pas obliger le joueur à rescanner son compte simplement à cause d'un changement de version.

Lors d’une restauration cloud, une sauvegarde plus ancienne ne doit pas écraser des valeurs locales plus récentes ; les champs distants vides/null ne suppriment plus une donnée locale existante.

## Langues

Le sélecteur global couvre désormais les 22 langues cibles de WarBoost : français, anglais, espagnol, italien, allemand, portugais, néerlandais, chinois, japonais, russe, arabe, polonais, turc, coréen, vietnamien, thaï, indonésien, ukrainien, roumain, grec, tchèque et suédois. Une variante English (US) reste également proposée.

Les langues historiques gardent leurs traductions avancées existantes. Les nouvelles langues disposent du socle principal d'interface et utilisent un fallback anglais sûr pour une clé avancée qui n'aurait pas encore sa traduction dédiée ; cela évite d'afficher une clé technique à l'utilisateur.

## Compatibilité et conformité

- WarBoost Scan et le cloud continuent de fonctionner sans accès direct Last War.
- L'intégration Last War complète reste désactivée tant qu'une solution officielle/autorisation n'est pas disponible.
- Aucun gameplay n'est automatisé.
- Les données non visibles dans une capture ne doivent pas être inventées.
- La Boutique IA reste limitée aux offres réellement observées ou à un catalogue officiel lorsqu'il sera disponible.
- Les accès R5/R4 restent contrôlés côté serveur.

## Versioning corrigé

Les incohérences de version héritées ont été supprimées sur les chemins actifs :

- application : `2.3.3` ;
- API Health : `2.3.3` ;
- Diagnostic Player : `warboost-ai-core-v2.3.3` ;
- VS : `warboost-vs-ai-v2.3.3` ;
- Saison : `warboost-season-ai-v2.3.3` ;
- Alliance : `warboost-alliance-ai-v2.3.3` ;
- cache PWA : `warboost-v2-3-3`.

## Vérifications réalisées

- `npm run check` : OK sur tous les fichiers JavaScript actifs.
- Nombre de fonctions `api/*.js` : 12.
- Test de paliers exclusifs : EX9→10, EX10→20, EX19→20, EX20→30, EX29→30.
- Test timing : Drone valorisé au VS jour 1 ; amélioration héros marquée à conserver vers le VS jour 4 lorsque pertinent.
- Test données incomplètes : le Diagnostic PRO demande un scan au lieu d'inventer une recommandation.
