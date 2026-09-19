import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const app=read("app.js"),html=read("index.html"),reset=read("reset-password.html");
const mainAuthHost=html.match(/<div id="authLoggedOut"[^>]*>[\s\S]*?<\/div>/)?.[0]||"";
const authTemplate=html.match(/<template id="authLoggedOutTemplate">([\s\S]*?)<\/template>/)?.[1]||"";
const rankSearch=html.match(/<[^>]*id="rankManagerSearch"[^>]*>/)?.[0]||"";
const desertSearch=html.match(/<[^>]*id="desertStormSearch"[^>]*>/)?.[0]||"";

assert.match(mainAuthHost,/id="authLoggedOut"[^>]*class="settingsForm hidden"><\/div>/);
assert.doesNotMatch(mainAuthHost,/(?:type="email"|type="password"|id="authEmail"|id="authPassword"|id="authOtp")/);
assert.match(authTemplate,/id="authEmail" type="email" autocomplete="email"/);
assert.match(authTemplate,/id="authPassword" type="password" autocomplete="current-password"/);
assert.match(authTemplate,/id="authOtp" inputmode="numeric" autocomplete="one-time-code"/);

assert.match(rankSearch,/role="searchbox"/);
assert.match(rankSearch,/aria-labelledby="rankManagerSearchLabel"/);
assert.match(rankSearch,/inputmode="search"/);
assert.match(rankSearch,/contenteditable="plaintext-only"/);
assert.match(desertSearch,/role="searchbox"/);
assert.match(desertSearch,/contenteditable="plaintext-only"/);

assert.match(app,/function mountAuthControls\(\)/);
assert.match(app,/template\.content\.cloneNode\(true\)/);
assert.match(app,/function unmountAuthControls\(\)/);
assert.match(app,/root\.replaceChildren\(\)/);
assert.match(app,/if\(logged\|\|!accountOpen\)unmountAuthControls\(\);\s*else\{mountAuthControls\(\);/);
assert.match(app,/function bindAuthControls\(\)/);
for(const id of ["loginBtn","signupBtn","forgotPasswordBtn","verifyOtpBtn","resendOtpBtn"]){
  assert.match(app,new RegExp(`\\$\\("#${id}"\\)\\?\\.addEventListener`),`${id} must be rebound after auth form mount`);
}
assert.match(app,/function closeDrawers\(\)\{unmountAuthControls\(\)/);
assert.match(app,/d\.classList\.add\("open"\)[\s\S]{0,220}safeRenderStep\("ACCOUNT_OPEN_AUTH",renderAuth\)/);

assert.match(reset,/id="newPassword" type="password" autocomplete="new-password"/);
assert.match(reset,/id="confirmPassword" type="password" autocomplete="new-password"/);
assert.match(app,/rankManagerSearchTerm=searchInputValue\(e\.target\)/);
assert.match(app,/desertStormSearchTerm=searchInputValue\(e\.target\)/);

console.log("Mobile auth isolation and searchbox DOM verification: PASS");