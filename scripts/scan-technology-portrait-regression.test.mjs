import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {sanitizeTechnologyCards} from "../lib/technology-scan.js";
import {createScanReviewDraft} from "../lib/scan-review.js";
import {buildScanReviewGroups} from "../lib/scan-review-presentation.js";
import {renderScanReviewMarkup} from "../lib/scan-review-markup.js";
import {CONTROLLED_VISION_LOCALES} from "../lib/controlled-vision-copy.js";
import {translator} from "../i18n.js";

const source=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
const esc=value=>String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;");
const technology=sanitizeTechnologyCards({cards:[{
  name:"Héros",name_evidence:"visible_text",name_confidence:.99,
  state:"percent",percent:94,value_evidence:"same_card",value_confidence:.99
}]},"2026-10-27T12:00:00.000Z");
const draft=createScanReviewDraft("technology",{technology});

for(const lang of CONTROLLED_VISION_LOCALES)test(`Technology Héros is an editable branch, not a character, in ${lang}`,()=>{
  assert.equal(technology.branches.heroes.percent,94);
  const {html,rows}=renderScanReviewMarkup(buildScanReviewGroups("technology",draft),translator(lang),esc);
  const name=rows.find(row=>row.field==="name");
  assert.deepEqual(name.path,["technology","branches","heroes","name"]);
  assert.match(html,/<input[^>]*type="text"[^>]*value="Héros"/);
  assert.ok(!html.includes(translator(lang)("hero_choose")));
  assert.ok(!html.includes("data-scan-review-identity-ack"));
  const hero=renderScanReviewMarkup([{kind:"hero",number:1,rows:[{
    path:["squads",0,"heroes",0,"name"],field:"name",value:"Murphy",status:"pending",
    evidence:{requires_confirmation:true}
  }]}],translator(lang),esc).html;
  assert.match(hero,/<select /);
  assert.ok(hero.includes(translator(lang)("hero_choose")));
  assert.match(hero,/data-scan-review-identity-ack/);
});

test("real form handler never asks a Technology branch for a character identity acknowledgment",()=>{
  const code=source.slice(source.indexOf("function scanReviewFormEdits("),source.indexOf("function updateScanReviewRaritySummary("));
  const row={path:["technology","branches","heroes","name"],field:"name",evidence:{requires_confirmation:true}};
  const container={querySelector:selector=>selector.startsWith("[data-scan-review-id=")?{value:"Héros"}:null};
  const context={$:()=>container};
  vm.runInNewContext(code,context);
  const result=context.scanReviewFormEdits({type:"technology",displayRows:[row]});
  assert.equal(result.issues.length,0);
  assert.equal(result.edits[0].value,"Héros");
  const squad=context.scanReviewFormEdits({type:"squad1",displayRows:[{
    ...row,path:["squads",0,"heroes",0,"name"]
  }]});
  assert.equal(squad.issues[0].reason,"uncertain");
  assert.equal(squad.edits[0].value,"");
});
