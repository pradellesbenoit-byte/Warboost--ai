# WarBoost V1.5.0 — Publisher-safe Coach + Shop

## Objective
Make Coach IA and the Shop Advisor safe enough for a publisher demonstration without pretending WarBoost has access to data that Last War has not officially exposed.

## Exclusive-weapon logic
WarBoost now computes the next known efficiency breakpoint independently for every hero:

- EX0–9 → EX10
- EX10–19 → EX20
- EX20–29 → EX30
- EX30+ → no higher breakpoint is invented without confirmed game data

Targets are shown explicitly, e.g. `Lucius EX1 → EX10`.

## Shop catalogue safety
Until official Last War shop access is approved, the Shop Advisor displays **Partial catalogue**.

- With a shop screenshot: only visible offers are ranked.
- Without a shop screenshot: WarBoost shows strategic categories to look for, explicitly marked as availability not verified.
- Unknown item types are marked **Not analysed** and receive no purchase recommendation.
- An official catalogue status can be enabled later by an approved read-only connector capability (`shop_catalog`, `shop`, or `store_catalog`).

## Publisher-demo message
The product works today with scans and user-confirmed data, while making the API value proposition visible: official read-only access would increase coverage, synchronization quality and purchase relevance without automating gameplay.
