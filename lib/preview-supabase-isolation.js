export const WARBOOST_TEST_SUPABASE_REF = "zaioadmbhqzeihkvdjsd";
export const WARBOOST_PREVIEW_BRANCH = "warboost-roster-fix-20261112";

const URL_NAMES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"];
const PUBLIC_KEY_NAMES = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY"
];

function isProtectedPreview(env) {
  if (env.VERCEL_ENV !== "preview") return false;
  const branch = String(env.VERCEL_GIT_COMMIT_REF || "").trim();
  // A missing branch ref is ambiguous in Preview, so fail closed rather than
  // allowing that ambiguity to bypass the staging project check.
  return !branch || branch === WARBOOST_PREVIEW_BRANCH;
}

function firstSet(env, names) {
  for (const name of names) {
    const value = String(env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function projectRefFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
    return match?.[1]?.toLowerCase() || null;
  } catch {
    return null;
  }
}

function jwtClaims(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (header?.alg !== "HS256" || typeof claims?.ref !== "string" || typeof claims?.role !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}

function keyBelongsTo(value, role) {
  const claims = jwtClaims(value);
  return claims?.ref === WARBOOST_TEST_SUPABASE_REF && claims?.role === role;
}

/**
 * Returns only a fixed failure code; never include environment values or key
 * material in errors, logs, or responses. This guard is deliberately scoped
 * to the named Vercel Preview branch and has no effect on Production.
 */
export function previewSupabaseIsolationFailure(env = process.env) {
  if (!isProtectedPreview(env)) return null;

  const configuredUrl = String(env.SUPABASE_URL || "").trim();
  if (projectRefFromUrl(configuredUrl) !== WARBOOST_TEST_SUPABASE_REF) return "PREVIEW_SUPABASE_URL_NOT_TEST";

  // Reject conflicting aliases too: all supported runtime paths must resolve
  // to the same project, even if a higher-priority name currently masks one.
  for (const name of URL_NAMES) {
    const value = String(env[name] || "").trim();
    if (value && projectRefFromUrl(value) !== WARBOOST_TEST_SUPABASE_REF) return "PREVIEW_SUPABASE_URL_ALIAS_MISMATCH";
  }

  const publicKeys = PUBLIC_KEY_NAMES.map(name => String(env[name] || "").trim()).filter(Boolean);
  if (!publicKeys.length || publicKeys.some(value => !keyBelongsTo(value, "anon"))) {
    return "PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST";
  }

  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!keyBelongsTo(serviceKey, "service_role")) return "PREVIEW_SUPABASE_SERVICE_KEY_NOT_TEST";

  return null;
}

export function assertPreviewSupabaseIsolation(env = process.env) {
  const code = previewSupabaseIsolationFailure(env);
  if (code) {
    throw Object.assign(
      new Error("La configuration Supabase de cette Preview n'est pas isolée sur la base WarBoost-Test."),
      { code, status: 503 }
    );
  }
}
