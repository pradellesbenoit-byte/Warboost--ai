---
name: Node VM cross-realm test assertions
description: Avoid false failures when testing browser code inside Node's VM sandbox.
---

Objects created inside `vm.runInNewContext` have different realm prototypes from host objects. Strict deep equality may reject structurally identical values at the test boundary.

**Why:** The Desert Storm click-flow test executes browser functions in a VM sandbox; comparing the whole options object caused a misleading failure despite matching fields.

**How to apply:** Assert primitive fields individually, or normalize serializable values into the host realm before comparing them. Keep production code unchanged.