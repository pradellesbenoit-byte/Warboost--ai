# WarBoost V1.6.1 — AI Player + VS + Season

## Added
- Cross-domain AI core connecting Player, VS and Season diagnostics.
- VS engine returns day-specific priorities, resource-hold guidance, score-gap context, player-account context and confidence.
- Season engine returns progression/unlock priority, resistance signal, late-season adjustment, player-account context and confidence.
- Player PRO analysis now includes `cross_context` so recommendations can be checked against VS and Season timing before spending scarce resources.
- Alliance R4/R5 activity engine from V1.6.0 retained.
- Compact UI retained: existing VS and Season cards show the concise AI result; detailed calculations stay server-side.
- 8 interface language choices retained: FR, EN-GB, EN-US, ES, DE, JA, ZH, AR. AI locale routing supports all of them (EN-US and EN-GB share English copy with locale-aware formatting).

## Safety / publisher access
- No claim of official Last War activity or inventory data without approved access.
- Recommendations use synchronized/scanned WarBoost state only.
- Day-specific VS advice is conditional on the tasks displayed for that day to avoid overstating uncertain game rules.

## Engine IDs
- warboost-ai-core-v1.6.1
- warboost-vs-ai-v1.6.1
- warboost-season-ai-v1.6.1
- warboost-alliance-ai-v1.6.1
