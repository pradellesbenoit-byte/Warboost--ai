---
name: Délais des analyses Scan
description: Distinguer délai fournisseur et budget complet, préserver le premier résultat lors des raffinements optionnels.
---

Le délai frontend du Scan doit inclure transport, authentification et droits,
pas uniquement le temps du fournisseur Vision. Ne pas augmenter les délais
généraux de session pour résoudre un timeout d'analyse.

**Why:** le navigateur abandonnait une analyse d'arme avant que le serveur puisse
retourner son résultat ou son erreur, car les vérifications d'accès précédaient
un appel fournisseur presque aussi long que le budget frontend complet.

**How to apply:** garder le délai fournisseur indépendant. Un raffinement
portrait doit utiliser le budget restant calculé depuis l'entrée serveur,
inclure recadrage et lecture de la réponse, puis rendre le premier résultat
en cas de manque de temps ou d'échec. Les durées journalisées ne doivent pas
inclure captures, OCR, noms, identifiants de compte ou messages d'erreur privés.
