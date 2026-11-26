// WarBoost - explicit, owner-confirmed resolution of HISTORICAL local/cloud markers.
// This module never invents scan evidence, does not overwrite heroes, and only edits
// the selected squad inside a fresh cloud snapshot that is written with CAS.
const clone = value => structuredClone(value);
const equals = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fieldKey = field => `${field.category}:${field.slot ?? 0}`;
const permitted = field => (field.category === "power" || field.category === "weapons") &&
  Number.isInteger(field.slot) && field.slot >= 1 && field.slot <= 5;
const asError = (status, code) => Object.assign(new Error(code), {status,code});
const allowedIssues = new Set(["field_confirmation_missing"]);

export function planSquadReview({cloudState, owner, revision, expectedRevision, squadId,
  localSquad, reviewedFields, now, compare}) {
  if (!owner || cloudState?.player_id !== owner) throw asError(403,"review_owner_mismatch");
  if (!revision || expectedRevision !== revision) throw asError(409,"review_revision_changed");
  if (!Number.isInteger(squadId) || squadId < 1 || squadId > 3 ||
      localSquad?.id !== squadId || !Array.isArray(reviewedFields))
    throw asError(400,"review_invalid_selection");
  if (!Array.isArray(cloudState.squads) || cloudState.squads.length !== 4 ||
    cloudState.squads.some((s,i) => !s || s.id !== i+1))
    throw asError(409,"review_cloud_structure_ambiguous");
  const cloudSquad = cloudState.squads[squadId-1];
  const cloudMarked = cloudSquad?.composition_conflict?.reason === "squad_freshness_ambiguous";
  const localMarked = localSquad?.composition_conflict?.reason === "squad_freshness_ambiguous";
  if (!cloudMarked && !localMarked)
    throw asError(409,"review_marker_not_current");
  const pendingScan=cloudSquad?.composition_conflict?.scan_pending;
  const pendingIdentity=cloudSquad?.composition_conflict?.heroes;
  if ((Array.isArray(pendingScan)&&pendingScan.length>0) ||
      (Array.isArray(pendingIdentity)&&pendingIdentity.length>0))
    throw asError(409,"review_identity_evidence_pending");
  if (!Number.isFinite(Date.parse(now || ""))) throw asError(503,"review_clock_unavailable");
  // Compare only the matching own-account slot. Never trust a client-reported count.
  const result = compare(localSquad, cloudSquad, squadId);
  if (!result || result.id !== squadId || result.kind === "unknown" || result.kind === "empty" ||
      result.counts?.different !== 0 || result.counts?.unknown !== 0 ||
      (result.issues || []).some(issue => !allowedIssues.has(issue.reason)))
    throw asError(409,"review_comparison_incomplete");
  const pending = (result.fields || []).filter(f=>f.state === "same" && f.confirmed !== true);
  if (pending.some(f=>!permitted(f))) throw asError(409,"review_unverified_field_unsupported");
  // Require the exact set of values the UI explicitly showed and the user attested to.
  const expectedKeys = pending.map(fieldKey).sort();
  const offeredKeys = reviewedFields.map(f => typeof f === "object" && f !== null ? fieldKey(f) : "INVALID").sort();
  if (new Set(offeredKeys).size !== offeredKeys.length || !equals(expectedKeys,offeredKeys))
    throw asError(409,"review_fields_changed");
  const candidate = clone(cloudState);
  const squad = candidate.squads[squadId-1];
  for (const field of pending) {
    const hero = squad.heroes?.[field.slot-1];
    if (!hero || typeof hero !== "object" || Array.isArray(hero))
      throw asError(409,"review_hero_missing");
    const property = field.category === "weapons" ? "exclusive" : "power";
    if (hero[property] == null || hero[property] === "") throw asError(409,"review_field_missing");
    if ((property === "power" && hero.power_sync_status === "pending") ||
        ["conflict","ambiguous","unreadable","not_detected","illisible"].includes(hero.field_status?.[property]))
      throw asError(409,"review_field_unresolved");
    hero.field_source = {...hero.field_source, [property]:"confirmed_manual"};
    hero.field_updated_at = {...hero.field_updated_at, [property]:now};
    if (hero.field_status?.[property] === "pending" ||
        hero.field_status?.[property] === "needs_confirmation" ||
        hero.field_status?.[property] === "needs_verification")
      hero.field_status = {...hero.field_status, [property]:"confirmed"};
  }
  // The marker is stale and the player explicitly reviewed all comparable
  // fields. Preserve identity_history, never manufacture scan confirmation.
  const oldConflict = squad.composition_conflict;
  const cleanConflict = {...oldConflict};
  delete cleanConflict.reason;
  if (cleanConflict.status === "needs_verification") delete cleanConflict.status;
  squad.composition_conflict = Object.keys(cleanConflict).length ? cleanConflict : null;
  if (cloudMarked && squad.needs_rescan === true && !cleanConflict.status) squad.needs_rescan = false;
  // All unrelated profile fields and three other squads are taken ONLY from
  // the latest cloud state, without any values from the phone's local profile.
  if (!equals(candidate.squads.filter(s=>s.id!==squadId),cloudState.squads.filter(s=>s.id!==squadId)))
    throw asError(500,"review_unrelated_squad_changed");
  for (const key of Object.keys(cloudState).filter(key=>key!=="squads"))
    if (!equals(candidate[key],cloudState[key])) throw asError(500,"review_unrelated_profile_changed");
  return {candidate, squad:clone(squad), confirmedFields:expectedKeys};
}

export function isReviewReceiptValid({saved,previousRevision,expectedSquad,candidate,owner,squadId}) {
  return Boolean(saved?.updated_at && saved.updated_at !== previousRevision &&
    saved?.state?.player_id===owner &&
    equals(saved?.state?.squads?.[squadId-1],expectedSquad) &&
    equals(saved?.state?.squads,candidate?.squads) &&
    Object.keys(candidate || {}).every(key=>equals(saved.state[key],candidate[key])));
}
