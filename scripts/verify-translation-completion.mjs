import assert from "node:assert/strict";
import fs from "node:fs";
import {COMPLETED_LOCALES} from "../lib/locales/completed.js";
import {translator,translationDiagnostics} from "../i18n.js";
import {gearRepairPreviewCopy} from "../lib/gear-repair-preview-copy.js";
import {squadComparisonCopy} from "../lib/squad-comparison-copy.js";
import {squadComparisonDetailCopy} from "../lib/squad-comparison-detail-copy.js";
import {squadComparisonGearCopy} from "../lib/squad-comparison-gear-copy.js";
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
// A concatenated prefix such as t("squad_compare_" + status) is not a literal UI
// key. Validate its full keys from the actual component dictionaries instead.
const literalKeys=source=>[
  ...source.matchAll(/data-i18n(?:-aria|-alt|-placeholder)?=["']([a-z][a-z0-9_]+)["']/g),
  ...source.matchAll(/\bt\(["']([a-z][a-z0-9_]+)["']\s*(?=[,)])/g)
].map(match=>match[1]);
assert.deepEqual(literalKeys('t("complete_key"); t("dynamic_" + status); t("another_key", vars)'),["complete_key","another_key"]);
const componentCopy=code=>{
  // Component packs use language codes ("en"), while the main packs distinguish
  // en-GB/en-US. Match the runtime resolver instead of assuming identical IDs.
  const language=code.startsWith("en-")?"en":code;
  return Object.assign({},gearRepairPreviewCopy(language),squadComparisonCopy(language),
    squadComparisonDetailCopy(language),squadComparisonGearCopy(language));
};
for(const path of ["index.html","app.js",...fs.readdirSync("lib").filter(name=>name.endsWith(".js")).map(name=>`lib/${name}`)])
  for(const key of literalKeys(fs.readFileSync(path,"utf8")))keys.add(key);
for(const key of Object.keys(componentCopy("en-GB")))keys.add(key);
for(const row of translationDiagnostics([...keys])){
  const copy=componentCopy(row.code);
  assert.deepEqual(row.missing.filter(key=>typeof copy[key]!=="string"||!copy[key].trim()),[],`${row.code}: unresolved UI keys`);
  assert.equal(copy.intentionally_missing_validation_key,undefined,"unknown keys must never be accepted");
  for(const [key,text] of Object.entries(copy)){
    assert.ok(text.trim(),`${row.code}/${key}`);
    assert.deepEqual([...text.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),
      [...componentCopy("en-GB")[key].matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),`${row.code}/${key}: component placeholders differ`);
  }
}
console.log(`PASS ${checks} completed translations in ${Object.keys(COMPLETED_LOCALES).length} non-English locales; protected tokens retained; ${keys.size} UI/component keys resolve in 23 locales, including dynamic comparison/repair keys. Native review not simulated.`);
