# WarBoost V1.5.0 — Validation

## Automated checks passed

- [x] JavaScript syntax passes for all project files (`npm run check`).
- [x] Lucius EX1 targets EX10, not EX20.
- [x] Skyler EX1 targets EX10 in the real Squad 1 test state.
- [x] Carlie EX5 targets EX10.
- [x] Morrisson EX10 targets EX20.
- [x] DVA EX21 targets EX30.
- [x] EX30 and EX31 do not invent a higher breakpoint.
- [x] Shop without a scan is labelled **Partial catalogue** and uses “look for” strategy cards.
- [x] A scanned known offer is ranked only as a visible offer.
- [x] An unknown scanned item is marked **Not analysed** and receives no buy recommendation.
- [x] Official-catalogue status requires both an official source and an approved shop capability.
- [x] 181 UI translation keys resolve in all 8 supported languages: FR, EN-GB, EN-US, ES, DE, JA, ZH, AR.
- [x] Arabic direction remains RTL.

## Preview checks still required before production

- [ ] Open the Vercel Preview on mobile and verify the V1.5.0 header.
- [ ] Run `Priorité IA PRO` with the saved account and confirm Lucius EX1 → EX10, Skyler EX1 → EX10, Morrisson EX10 → EX20.
- [ ] Confirm the shop header displays **Catalogue partiel** without official Last War access.
- [ ] Confirm strategy cards say availability is not verified rather than presenting them as current offers.
- [ ] Scan one real Last War shop and confirm only visible offers are ranked.
- [ ] Switch through all languages in the actual UI, including Arabic RTL.
