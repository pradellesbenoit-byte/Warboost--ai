const EXPECTED_BRANCH = "warboost-preview-isolation-20261110";
const EXPECTED_SUPABASE_REF = "zaioadmbhqzeihkvdjsd";

const SUPABASE_URL_VARS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
];
const SUPABASE_PUBLIC_KEY_VARS = [
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
];
const FORBIDDEN_PREVIEW_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_LIVE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRODUCT_PRO",
  "STRIPE_LIVE_PRICE_PRO_MONTHLY",
  "STRIPE_LIVE_PRODUCT_PRO",
  "OPENAI_API_KEY",
  "WARBOOST_VISION_SECRET",
  "WARBOOST_VISION_ENDPOINT",
  "WARBOOST_LIVE_APP_URL",
  "WARBOOST_LIVE_TERMS_URL",
  "WARBOOST_LIVE_PRIVACY_URL",
  "WARBOOST_LIVE_PAYMENTS_ENABLED",
  "WARBOOST_LIVE_DATABASE_VERIFIED",
  "WARBOOST_LIVE_LEGAL_CONFIRMED",
  "WARBOOST_LIVE_MANAGED_PAYMENTS_ENABLED",
  "WARBOOST_LIVE_MANAGED_PAYMENTS_VERIFIED",
  "WARBOOST_LIVE_PRICE_VERIFIED",
  "WARBOOST_LIVE_WEBHOOK_VERIFIED",
  "WARBOOST_LIVE_TAX_VERIFIED",
  "WARBOOST_LIVE_ACTIVATION_APPROVED",
];

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function supabaseUrlMatches(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === `${EXPECTED_SUPABASE_REF}.supabase.co` &&
      !url.port && !url.username && !url.password &&
      (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function jwtClaims(value) {
  try {
    const parts = String(value || "").split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function keyMatches(value, role) {
  const claims = jwtClaims(value);
  return claims?.ref === EXPECTED_SUPABASE_REF && claims?.role === role;
}

/**
 * Build-time guard for the one intended Vercel staging branch.
 * It deliberately rejects opaque Supabase keys: without a verifiable project
 * reference, the build cannot prove that a credential belongs to staging.
 */
export function validatePreviewEnvironment(env = process.env) {
  if (env.VERCEL_ENV !== "preview") return { ok: true, skipped: true, errors: [] };

  const errors = [];
  if (env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) errors.push("VERCEL_GIT_COMMIT_REF");

  const urls = SUPABASE_URL_VARS.filter((name) => present(env[name]));
  if (urls.length === 0) errors.push("SUPABASE_URL");
  for (const name of urls) {
    if (!supabaseUrlMatches(env[name])) errors.push(name);
  }

  const publicKeys = SUPABASE_PUBLIC_KEY_VARS.filter((name) => present(env[name]));
  if (publicKeys.length === 0) errors.push("SUPABASE_ANON_KEY");
  for (const name of publicKeys) {
    if (!keyMatches(env[name], "anon")) errors.push(name);
  }

  if (!present(env.SUPABASE_SERVICE_ROLE_KEY) ||
      !keyMatches(env.SUPABASE_SERVICE_ROLE_KEY, "service_role")) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (publicKeys.some((name) => env[name] === env.SUPABASE_SERVICE_ROLE_KEY)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (present(env.WARBOOST_COMMERCIAL_MODE) && env.WARBOOST_COMMERCIAL_MODE !== "off") {
    errors.push("WARBOOST_COMMERCIAL_MODE");
  }
  for (const name of FORBIDDEN_PREVIEW_VARS) {
    if (present(env[name])) errors.push(name);
  }

  return { ok: errors.length === 0, skipped: false, errors: [...new Set(errors)] };
}

export function assertPreviewEnvironment(env = process.env) {
  const result = validatePreviewEnvironment(env);
  if (!result.ok) {
    throw new Error(`Preview environment blocked; check variable names: ${result.errors.join(", ")}`);
  }
  return result;
}
