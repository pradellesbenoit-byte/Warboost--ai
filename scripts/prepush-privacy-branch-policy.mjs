const PREPUSH_PRIVACY_BASES=Object.freeze({
  "public-beta-safe-launch":"origin/public-beta-safe-launch",
  "warboost-free-access-review-20261025":"origin/warboost-free-access-review-20261025",
  "warboost-pro-live-final-20261107":"origin/warboost-free-access-review-20261025"
});
export const PREPUSH_PRIVACY_BRANCHES=Object.freeze(Object.keys(PREPUSH_PRIVACY_BASES));

export function prepushPrivacyBaseRef(branch){
  const name=String(branch||"").trim();
  if(!PREPUSH_PRIVACY_BRANCHES.includes(name))
    throw new Error(`pre-push privacy audit is not allowed on branch: ${name||"(detached)"}`);
  return PREPUSH_PRIVACY_BASES[name];
}
