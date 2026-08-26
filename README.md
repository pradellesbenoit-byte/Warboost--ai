# WarBoost V2.4.1 — Diagnostic → Boutique Alignment

V2.4.1 est un correctif ciblé de la V2.4.0 Boutique IA validée en Preview.

## Correction principale
La Boutique IA hérite maintenant directement des priorités du **Diagnostic PRO**.

Exemple validé sur un profil correspondant au cas observé :
- Diagnostic PRO : Morrison / Carlie / Lucius = priorités Arme exclusive.
- Boutique IA : **Fragment d'Arme Exclusive Universel** passe devant **Plan d'Équipement (MR)** et les ressources Drone tant qu'aucun goulot d'équipement plus fort n'est détecté.

Le moteur applique un bonus aux familles de ressources alignées avec le TOP 3 du Diagnostic PRO et une pénalité prudente aux autres familles rares lorsqu'une même famille domine au moins 2 des 3 priorités.

## Fiabilité boutique conservée
- Référentiel V2.4.0 inchangé : 164 entrées, 163 nommées, 15 familles.
- Aucun prix masqué / VENDU n'est reconstruit.
- Une offre du référentiel n'est jamais présentée comme disponible aujourd'hui sans scan récent ou donnée officielle autorisée.
- Les scans récents de plusieurs boutiques restent cumulés.
- Les achats payants restent soumis aux règles de fraîcheur des données.

## Traductions
Le nouveau verdict de référence **« À vérifier en boutique »** et les explications d'alignement Diagnostic PRO → Boutique sont localisés pour toutes les options de langue actuellement exposées par WarBoost. Les libellés Boutique IA de l'interface ont aussi été complétés pour les langues qui utilisaient encore le fallback anglais.

Voir :
- `WARBOOST_V2_4_1_RELEASE.md`
- `BUILD_VERIFICATION_V2_4_1.txt`
- `PATCH_MANIFEST_V2_4_1.txt`
- `SHOP_CATALOG_AUDIT_V2_4_0.md` (catalogue inchangé)
