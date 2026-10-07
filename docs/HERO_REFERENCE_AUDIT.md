# Audit des références visuelles Last War

## Résultat

31/31 héros possèdent une vignette réelle de jeu nommée, récupérée depuis
le tableau public [Heroes de Fandom](https://last-war-survival.fandom.com/wiki/Heroes).
58 références au total : 52 fichiers sources de base et six recadrages de
captures réelles attestant des variantes. Les quatre planches utilisent seulement
redimensionnement proportionnel, fond et légende. Pas de génération ou retouche IA.
Les originaux de base restent inchangés. Les nouvelles références sont des
rectangles de pixels originaux : URL, empreinte de la capture et coordonnées
du recadrage sont conservées, sans chats ou identité de joueur dans le cadre.

« Vérifié » signifie **association image–identité contrôlée**, pas précision
de reconnaissance garantie, licence de reproduction ou affiliation officielle.
La qualification `normal` désigne le portrait de base publié par la source ;
elle ne certifie ni niveau d’arme, ni étoiles, ni rareté actuelle du joueur.

## Sources prioritaires et couverture

[Site officiel](https://www.lastwar.com/en/home.html) : section Heroes avec
DVA, Carlie, Violet, Marshall et McGregor associés explicitement à leurs images.

[Wiki officiel](https://wiki.lastwar.com/) : contenu public consacré notamment
aux armes de DVA et Kimberly, mais aucun portrait de variante distinct clairement
attesté n’a été extrait. Aucun compte/API de jeu ni contenu privé n’a été utilisé.

[lastwar.wiki](https://lastwar.wiki/category/heroes/) : seize portraits de base
issus des pages individuelles nommées.

[Last War Vault](https://lastwarvault.com/heroes/) : pages héros publiques et
guide Saison 6 consultés ; pas de portraits exploitables retrouvés dans ces pages.
Le contenu de guides restreints n’a pas été consulté.

Fandom complète tous les héros avec ses vignettes de jeu. Son CDN demande un
Referer de navigation normal pour fournir les images publiques. Aucun
identifiant, cookie de compte ou contournement d’authentification n’a été utilisé.
Les URL exactes, noms sources, dimensions, fichiers et empreintes se trouvent
dans `research/hero-references/manifest.json`.

| Héros affiché | Vignette de jeu Fandom | Autres sources validées |
|---|---|---|
| Kimberly | Oui | lastwar.wiki |
| Marshall | Oui | officiel, lastwar.wiki |
| Williams | Oui | lastwar.wiki |
| Murphy | Oui | lastwar.wiki |
| Stetmann | Oui | lastwar.wiki |
| Mason | Oui, vignette Mason1 | — |
| Violet | Oui, vignette Violet1 | officiel, lastwar.wiki |
| Scarlett | Oui | — |
| Monica | Oui | — |
| Richard | Oui | — |
| Farhad | Oui | — |
| Gump | Oui | — |
| Loki | Oui | — |
| DVA | Oui | officiel, lastwar.wiki |
| Morrison | Oui | lastwar.wiki |
| Carlie | Oui | officiel, lastwar.wiki |
| Lucius | Oui | lastwar.wiki |
| Schuyler | Oui | lastwar.wiki |
| Sarah | Oui | — |
| Cage | Oui | — |
| Ambolt | Oui | — |
| Maxwell | Oui | — |
| Tesla | Oui | lastwar.wiki |
| Fiona | Oui | lastwar.wiki |
| Swift | Oui | lastwar.wiki |
| Adam | Oui | lastwar.wiki |
| McGregor | Oui | officiel, lastwar.wiki |
| Venom | Oui | — |
| Elsa | Oui | — |
| Kane | Oui | — |
| Braz | Oui, source nommée Blaz | — |

Schuyler conserve la clé historique interne Skyler. Blaz reste l’alias déjà
existant de Braz. Il n’est pas créé de nouveau héros à partir de ces différences
de noms. **Aucun héros sans référence de base récupérée.**

## Variantes attestées et variantes non activées

- Awakening : Kimberly, DVA et Tesla ont chacune une référence attestée.
- Promotion SSR→UR : Sarah, Venom et Braz ont chacune une référence attestée.
- Promotion SSR→UR encore absente : Mason, Violet, Scarlett.
- Portrait physiquement différent à l’arme exclusive niveau 30 : aucun
  changement de portrait n’a été suffisamment attesté pour être activé.

Voir [l’audit héros par héros et les sources exactes](HERO_VARIANT_AUDIT.md).
La recherche EW est limitée aux **15 héros indiqués par l’utilisateur**. Les
captures EW examinées montrent principalement le véhicule, pas le visage.
Les 18 contextes encore absents restent `unverified`, avec `file: null`.
Cela signifie « portrait distinct non attesté dans les sources examinées »,
pas « cette évolution n’existe pas dans le jeu ». Aucun portrait normal n’est
dupliqué sous une fausse étiquette de variante.

Les illustrations générées trouvées dans la recherche et les portraits réalistes
réinterprétés de lastwar-guide.org ont été exclus. Leurs fichiers temporaires
n’ont pas été importés dans cette banque.

## Reconnaissance et garde-fous

- Chaque héros a une place de vignette dans les deux planches principales.
  Les sources supplémentaires ne constituent pas un classement/priorité.
- Les quatre planches sont réellement envoyées à OpenAI, dans la requête Vision
  existante, après les captures du joueur et avec des instructions distinctes.
- Aucun niveau, puissance, ordre d’escouade ou texte de capture ne doit provenir
  des planches de référence. Les labels ne constituent pas de l’OCR du joueur.
- Un ID déclaré par Vision n’est validé que s’il appartient à la banque
  réellement jointe, pour le même héros et la même variante.
- La proposition reste à confirmer, y compris si texte et portrait concordent.
  Portrait seul : confiance plafonnée à 0,84. Faible confiance : identité vide.
- Conservation des données confirmées, aucune composition legacy réinjectée,
  aucune contamination entre escouades : les garde-fous existants restent actifs.
- Corruption/absence d’un fichier : banque désactivée, retour aux propositions
  non vérifiées ; aucun ID prétendument vérifié n’est accepté.

## Validation encore nécessaire

Les tests contrôlent les fichiers, la provenance, les 31 identités, l’attachement
des images au fournisseur et la validation utilisateur. Ils ne mesurent pas
encore la précision sur un corpus de vraies formations annotées, notamment avec
compression mobile, petits portraits et apparences évoluées.

Avant une promesse de couverture visuelle exhaustive : captures autorisées et
annotées, essais réels, mesure des faux positifs/abstentions, coûts et délais,
et récupération des variantes manquantes avec attestation explicite.

Ces fichiers sont des références internes serveur. Ne pas les utiliser comme
icônes, splash, visuels marketing ou bibliothèque publique de WarBoost.
La disponibilité publique des images n’accorde pas de licence. Les droits
d’usage et l’autorisation officielle Last War/FUNFLY restent à clarifier.
