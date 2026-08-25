# WarBoost V2.3.6 — Alliance Reliability

V2.3.6 conserve le Diagnostic PRO V2.3.5 et fiabilise la partie Alliance R5/R4.

- Une seule logique d’activité partagée entre l’interface et `/api/advice`.
- Une donnée ancienne n’est jamais transformée automatiquement en inactivité.
- Trois états décisionnels : actifs confirmés, à actualiser, inactifs probables.
- Inactivité probable seulement avec une observation récente + plusieurs signaux négatifs cohérents.
- Plan de guerre IA aligné sur la même classification et refusant les exclusions/affectations finales lorsque le roster doit être actualisé.
- Roster remplacé par 5 panneaux repliables R5/R4/R3/R2/R1, tous fermés par défaut.
- Résumé des effectifs par grade.
- Finitions Diagnostic PRO : `Sources IA`, `Méta`, badges `Impact / ROI / Sources`.
- `1 toucher` remplacé par `Accès rapide`.
- Cache PWA et versions alignés en V2.3.6.
