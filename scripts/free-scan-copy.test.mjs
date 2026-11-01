import test from "node:test";
import assert from "node:assert/strict";
import {FREE_MANUAL_SCAN_TYPES,FREE_SCAN_COPY_LOCALES,freeScanCopy,manualScanDestination} from "../lib/free-scan-copy.js";

const EXPECTED_LOCALES=[
  "fr","en","es","it","de","pt","nl","zh","ja","ru","ar",
  "pl","tr","ko","vi","th","id","uk","ro","el","cs","sv"
];

test("free scan guidance is complete in all 22 supported languages",()=>{
  assert.deepEqual([...FREE_SCAN_COPY_LOCALES].sort(),[...EXPECTED_LOCALES].sort());
  for(const locale of EXPECTED_LOCALES){
    const copy=freeScanCopy(locale);
    for(const field of ["intro","unavailable","apiUnavailable","manualAction","technologyAction","manualAvailability"])
      assert.ok(copy[field]?.trim(),`${locale} ${field}`);
    assert.equal(copy.dir,locale==="ar"?"rtl":"ltr",`${locale} direction`);
  }
});

test("unknown locales safely fall back to English and manual routes stay bounded",()=>{
  assert.deepEqual(freeScanCopy("unknown"),freeScanCopy("en"));
  assert.equal(manualScanDestination("technology"),"technology");
  assert.equal(manualScanDestination("profile"),"account");
  assert.equal(manualScanDestination("vs"),"vs");
  assert.equal(manualScanDestination("season"),"season");
  assert.equal(manualScanDestination("alliance_roster"),"alliance");
  for(const type of FREE_MANUAL_SCAN_TYPES)
    assert.ok(["technology","account","vs","season","alliance","player"].includes(manualScanDestination(type)));
});
