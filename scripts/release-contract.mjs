import assert from "node:assert/strict";

export function assertCurrentReleaseContract({packageVersion,health,html,serviceWorker}){
  const apiVersion=health.match(/^[ \t]+version:"([^"]+)",?$/m)?.[1];
  const release=health.match(/^[ \t]+release:"(HF[0-9.]+)",?$/m)?.[1];
  const build=health.match(/^[ \t]+build:"([^"]+)",?$/m)?.[1];
  const cache=serviceWorker.match(/^[ \t]*const CACHE="([^"]+)";?$/m)?.[1];

  assert.equal(apiVersion,packageVersion,"health API version must match package.json");
  assert.match(release||"",/^HF\d+(?:\.\d+)+$/,"health API must expose a structured release");
  const releasePrefix=release.toLowerCase().replaceAll(".","-");
  assert.ok(build?.startsWith(`${releasePrefix}-`),`health build ${build||"(missing)"} must belong to release ${release}`);
  assert.match(build||"",/^[a-z0-9]+(?:-[a-z0-9]+)+$/,"health build must be a stable slug");
  const title=html.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim();
  assert.ok(title?.startsWith(`WarBoost V${apiVersion} ${release} —`),"HTML <title> must reflect the package and health API release");
  assert.match(cache||"",/^warboost-[a-z0-9-]+-r\d+$/,"service worker must expose a versioned cache name");
  return {packageVersion,apiVersion,release,build,cache,versionLabel:`V${apiVersion} ${release}`};
}