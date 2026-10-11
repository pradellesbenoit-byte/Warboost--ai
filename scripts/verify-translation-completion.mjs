import assert from "node:assert/strict";
import fs from "node:fs";
import {COMPLETED_LOCALES} from "../lib/locales/completed.js";
import {translator,translationDiagnostics} from "../i18n.js";
let checks=0;
for(const [code,copy] of Object.entries(COMPLETED_LOCALES))for(const [key,text] of Object.entries(copy)){
  const source=translator("en-GB")(key);
  assert.notEqual(source,key,`missing reference ${key}`);
  assert.equal(translator(code)(key),text,`${code}/${key}: legacy copy must not override a supplied translation`);
  for(const pattern of [/\{\w+\}/g,/<\/?[a-zA-Z][^>]*>/g,/\d+/g,/https?:\/\/[^\s<"']+/g,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,/\bR[1-5]\b/g,/[€$£₽¥₹]/g]){
    const tokens=value=>[...value.matchAll(pattern)].map(match=>match[0]).sort();
    assert.deepEqual(tokens(text),tokens(source),`${code}/${key}: protected tokens differ`);
  }
  assert.ok(text.trim());checks++;
}
const keys=new Set();
for(const path of ["index.html","app.js",...fs.readdirSync("lib").filter(name=>name.endsWith(".js")).map(name=>`lib/${name}`)])
  for(const match of fs.readFileSync(path,"utf8").matchAll(/(?:data-i18n(?:-aria|-alt|-placeholder)?=["']|\bt\(["'])([a-z][a-z0-9_]+)["']/g))keys.add(match[1]);
for(const row of translationDiagnostics([...keys]))assert.deepEqual(row.missing,[],`${row.code}: unresolved UI keys`);
console.log(`PASS ${checks} completed translations in ${Object.keys(COMPLETED_LOCALES).length} non-English locales; placeholders, numbers, tags, URLs retained; ${keys.size} UI keys resolve in 23 locales. Native review not simulated.`);
