import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LANGUAGES,translator} from "../i18n.js";
import {buildPlayerScanOptions,normalizePlayerScanType} from "../lib/player-scan-types.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const expectedTypes=["profile","squad1","squad2","squad3","squad4","drone","exclusive","awakening","shop","vs","season","technology"];
const internalLabel=/secret[\s_-]+mobile[\s_-]+squad|secret_mobile_squad|alliance_roster|scan_[a-z0-9_]+|(?:api|lib|scripts)\/|(?:debug|internal|test)(?:\b|[_ -])/i;

test("WarBoost Scan renders only its explicit player-facing scan types",()=>{
  const app=read("app.js"),html=read("index.html");
  const options=buildPlayerScanOptions(translator("fr"));
  assert.deepEqual(options.map(option=>option.value),expectedTypes);
  assert.equal(normalizePlayerScanType("secret_mobile_squad",options),"profile");
  assert.equal(normalizePlayerScanType("unknown_internal_test",options),"profile");
  assert.equal(normalizePlayerScanType("technology",options),"technology");

  const select=html.match(/<select id="scanType"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select,"the scan type selector exists in the static markup");
  const fallbackValues=[...select[1].matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)];
  assert.deepEqual(fallbackValues.map(option=>option[1]),expectedTypes);
  assert.doesNotMatch(select[0],internalLabel,"static fallback options must not expose internal ids or labels");

  const renderer=app.split("\n").find(line=>line.startsWith("function renderScanTypeOptions()"));
  assert.ok(renderer,"the application must render scan choices through the dedicated renderer");
  assert.match(renderer,/buildPlayerScanOptions\(t\)/);
  assert.match(renderer,/normalizePlayerScanType\(current,opts\)/);
  assert.doesNotMatch(renderer,internalLabel,"the renderer must not name internal scan types or translation keys");
  const quickScan=app.split("\n").find(line=>line.startsWith("function openQuickScan("));
  assert.ok(quickScan,"quick scan entry points must use the shared player scan allowlist");
  assert.match(quickScan,/normalizePlayerScanType\(type,opts\)/);
});

test("visible scan names contain no raw keys, routes, test labels, or internal task names in all locales",()=>{
  const locales=LANGUAGES.filter(([code])=>code!=="auto");
  assert.equal(locales.length,23,"22 languages include two English locale variants");
  const englishTechnology=translator("en-GB")("scan_technology");
  for(const [code] of locales){
    const options=buildPlayerScanOptions(translator(code));
    assert.deepEqual(options.map(option=>option.value),expectedTypes,`${code} must retain every supported player scan`);
    for(const option of options){
      assert.ok(option.label.trim(),`${code} has a visible label for ${option.value}`);
      assert.notEqual(option.label,option.labelKey,`${code} must not expose an untranslated key for ${option.value}`);
      assert.doesNotMatch(option.label,internalLabel,`${code} must not expose an internal label for ${option.value}`);
    }
    const technology=options.find(option=>option.value==="technology");
    assert.ok(technology,`${code} must include the Technology Center scan`);
    assert.notEqual(technology.label,"scan_technology",`${code} must localize the Technology Center label`);
    if(!code.startsWith("en"))assert.notEqual(technology.label,englishTechnology,`${code} must not fall back to English for the Technology Center label`);
  }
});