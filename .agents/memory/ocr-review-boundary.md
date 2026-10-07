---
name: OCR review boundary
description: Why actionable Vision results require explicit review before merging into saved player state.
---

Treat an OCR response as a proposal, not a saved fact. Any value that can affect advice must be reviewed and correctable before it replaces confirmed state; missing or unreadable fields must leave prior confirmed values intact. A pending review belongs to the account and capture that produced it, so late responses cannot attach to a different image or session.

**Why:** The provider could mark a result as requiring confirmation while the browser still merged it immediately. Partial and asynchronous results then risked replacing reliable values or being reviewed against a different visible capture.

**How to apply:** For new scan types, define the exact actionable fields that can be staged, show their origin and scan time without implying the screenshot itself is recent, and commit only fields the user has reviewed. Keep permission-sensitive alliance roles under server-side verification; a screenshot or local edit is not proof of R4/R5 authority.

Any human-readable OCR editor that hides an internal encoding must round-trip an untouched value without dropping supported details. Do not blank unrelated OCR text merely because it resembles that encoding.

**Why:** A readable equipment editor can silently lose a second rarity, and a broad "technical text" filter can erase a shop description when the player confirms the form unchanged.

**How to apply:** Test untouched and corrected submissions separately for multi-valued fields, plus OCR text that resembles an internal key. A live language change must retranslate the review without resetting its inputs or replacing its current scan status.

Account isolation also applies to transient media labels and progress, not only to saved facts and pending responses.

**Why:** Suppressing a late result and clearing image references can still leave the previous account’s filename and progress visible in an existing drawer.

**How to apply:** Account transitions must invalidate request bindings and clear the rendered capture list, preview, review status and busy controls before restoring the new owner’s pending captures.

Une confirmation d’escouade peut enregistrer des champs fiables sans confirmer toute
la composition. Les identités incomplètes, inconnues ou en double restent en attente ;
elles ne permettent ni transfert positionnel d’attributs ni effacement des confirmations.

**Why:** L’utilisateur demande que les scans partiels utiles ne soient plus bloqués par
des héros ou champs secondaires incomplets, sans sacrifier les données déjà confirmées.

**How to apply:** Distinguer la confirmation des valeurs de celle d’une nouvelle composition.
Une identité exacte permet d’enrichir un héros connu ; seule une composition complète et
sans ambiguïté autorise son remplacement. Les champs omis ne reçoivent pas de fraîcheur nouvelle.