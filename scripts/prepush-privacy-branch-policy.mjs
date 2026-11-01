export const PREPUSH_PRIVACY_BRANCHES=Object.freeze([
  "public-beta-safe-launch",
  "warboost-free-access-review-20261025"
]);

export function prepushPrivacyBaseRef(branch){
  const name=String(branch||"").trim();
  if(!PREPUSH_PRIVACY_BRANCHES.includes(name))
    throw new Error(`pre-push privacy audit is not allowed on branch: ${name||"(detached)"}`);
  return `origin/${name}`;
}
