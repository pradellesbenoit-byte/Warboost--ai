import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";

const workflow=await readFile(".github/workflows/android-debug-apk.yml","utf8");
assert.match(workflow,/name: WarBoost Android Debug APK/);
assert.match(workflow,/branches: \[public-beta-safe-launch\]/);
assert.match(workflow,/if: github\.ref == 'refs\/heads\/public-beta-safe-launch'/);
assert.match(workflow,/workflow_dispatch:/);
assert.doesNotMatch(workflow,/pull_request|secrets\.|contents: write|id-token:|bundleRelease|assembleRelease|publish|keystore/i);
assert.match(workflow,/contents: read/);
assert.match(workflow,/persist-credentials: false/);
assert.match(workflow,/java-version: '21'/);
assert.match(workflow,/platforms;android-36/);
assert.match(workflow,/:app:assembleDebug :app:lintDebug :app:testDebugUnitTest/);
assert.match(workflow,/apksigner" verify --verbose --print-certs/);
assert.match(workflow,/if-no-files-found: error/);
assert.match(workflow,/retention-days: 7/);
const actions=[...workflow.matchAll(/uses: ([^\s]+)@([^\s]+)/g)];
assert.equal(actions.length,4);
for(const action of actions)assert.match(action[2],/^[a-f0-9]{40}$/,"Actions must be pinned to a full commit SHA");
for(const command of ["npm ci","npm run build","npm run mobile:sync","npm run test:mobile-wrapper","npm run check","git diff --check"])assert.ok(workflow.includes(command));
// Check shell syntax without executing SDK downloads, Gradle or remote actions.
const lines=workflow.split("\n");
let shellBlocks=0;
for(let index=0;index<lines.length;index++){
  if(!/^        run: \|$/.test(lines[index]))continue;
  const block=[];
  while(index+1<lines.length&&(/^          /.test(lines[index+1])||lines[index+1]==="")){
    block.push(lines[++index].slice(10));
  }
  const result=spawnSync("bash",["-n","-c",block.join("\n")],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);shellBlocks++;
}
assert.equal(shellBlocks,4);

const wrapper=await readFile("android/gradle/wrapper/gradle-wrapper.properties","utf8");
assert.match(wrapper,/distributionSha256Sum=ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c/);
assert.equal(createHash("sha256").update(await readFile("android/gradle/wrapper/gradle-wrapper.jar")).digest("hex"),"7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172");
const gradle=await readFile("android/app/build.gradle","utf8");
assert.match(gradle,/applicationId "fr\.warboost\.app"/);
assert.match(gradle,/versionCode 1/);assert.match(gradle,/versionName "1\.0"/);
assert.doesNotMatch(gradle,/signingConfigs|storePassword|keyPassword/);
const manifest=await readFile("android/app/src/main/AndroidManifest.xml","utf8");
assert.match(manifest,/screenOrientation="portrait"/);
assert.match(manifest,/usesCleartextTraffic="false"/);
assert.match(manifest,/allowBackup="false"/);
assert.deepEqual([...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(x=>x[1]).sort(),["android.permission.ACCESS_NETWORK_STATE","android.permission.CAMERA","android.permission.INTERNET"]);
const styles=await readFile("android/app/src/main/res/values/styles.xml","utf8");
assert.match(styles,/#090e1a/);assert.match(styles,/windowLightStatusBar">false/);
const activity=await readFile("android/app/src/main/java/fr/warboost/app/MainActivity.java","utf8");
assert.ok(activity.indexOf("registerPlugin(WarBoostSecureStorage.class)")<activity.indexOf("super.onCreate("));
assert.ok(activity.includes("stripe\\\\.com"));
const vault=await readFile("android/app/src/main/java/fr/warboost/app/WarBoostSecureStorage.java","utf8");
assert.match(vault,/AndroidKeyStore/);assert.match(vault,/AES\/GCM\/NoPadding/);
assert.match(vault,/if\(!saved\)throw/);
const runtime=await readFile("lib/mobile-runtime.js","utf8");
assert.match(runtime,/native\.App\.getInfo/);assert.match(runtime,/nativeBuildInfo/);
const html=await readFile("mobile-dist/index.html","utf8");
assert.match(html,/<meta name="warboost-source-commit" content="[a-f0-9]{12}">/);
for(const page of ["security.html","privacy.html","delete-account.html"])assert.match(await readFile(`mobile-dist/${page}`,"utf8"),/warboost-source-commit/);
const config=JSON.parse(await readFile("android/app/src/main/assets/capacitor.config.json","utf8"));
assert.equal(config.appId,"fr.warboost.app");assert.equal(config.server.url,undefined);assert.equal(config.android.allowMixedContent,false);
console.log("PASS Android debug CI: branch restriction, pinned actions, read-only permissions, SDK/JDK, artifact-only debug signing, wrapper checksums, identity, portrait/dark, native vault and visible package/build/source identity.");
