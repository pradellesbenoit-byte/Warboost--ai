import assert from "node:assert/strict";
import {validatePreviewEnvironment} from "../lib/preview-environment.js";

const projectRef = "zaioadmbhqzeihkvdjsd";
const branch = "warboost-secure-release-prep-20261110";
const jwt = (ref, role) => `header.${Buffer.from(JSON.stringify({ref, role})).toString("base64url")}.signature`;
const valid = () => ({
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: branch,
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_ANON_KEY: jwt(projectRef, "anon"),
  SUPABASE_SERVICE_ROLE_KEY: jwt(projectRef, "service_role"),
  WARBOOST_COMMERCIAL_MODE: "off",
});
const cases = [
  ["local build skips the Vercel-only check", {}, true],
  ["production build is not changed by the staging guard", {VERCEL_ENV: "production"}, true],
  ["isolated target branch and project pass", valid(), true],
  ["wrong preview branch is blocked", {...valid(), VERCEL_GIT_COMMIT_REF: "main"}, false],
  ["production Supabase URL is blocked", {...valid(), SUPABASE_URL: "https://production.supabase.co"}, false],
  ["production project public key is blocked", {...valid(), SUPABASE_ANON_KEY: jwt("production", "anon")}, false],
  ["production project service key is blocked", {...valid(), SUPABASE_SERVICE_ROLE_KEY: jwt("production", "service_role")}, false],
  ["opaque publishable key is blocked without project proof", {...valid(), SUPABASE_ANON_KEY: "sb_publishable_fixture"}, false],
  ["Stripe credentials are blocked for sync-only Preview", {...valid(), STRIPE_SECRET_KEY: "sk_test_fixture"}, false],
  ["OpenAI credentials are blocked to prevent paid requests", {...valid(), OPENAI_API_KEY: "fixture-only"}, false],
  ["LIVE activation settings are blocked", {...valid(), WARBOOST_LIVE_PAYMENTS_ENABLED: "false"}, false],
  ["conflicting Supabase URL aliases are blocked", {...valid(), NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co"}, false],
];

for (const [name, env, expected] of cases) {
  const result = validatePreviewEnvironment(env);
  assert.equal(result.ok, expected, name);
  console.log(`PASS ${name}`);
}
console.log(`PASS preview environment guard: ${cases.length} synthetic cases.`);
