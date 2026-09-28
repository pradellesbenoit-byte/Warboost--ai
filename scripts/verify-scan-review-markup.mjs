import assert from 'node:assert/strict';
import {createScanReviewDraft,applyOwnedScanReview} from '../lib/scan-review.js';
import {buildScanReviewGroups,serializeScanReviewGear} from '../lib/scan-review-presentation.js';
import {renderScanReviewMarkup} from '../lib/scan-review-markup.js';
import fs from 'node:fs';
import vm from 'node:vm';

const labels={
  scan_review_squad_heading:'Escouade {number}',scan_review_hero_heading:'Héros {number}',
  scan_review_label_power:'Puissance',scan_review_label_gear:'Équipements',
  scan_review_label_gear_count:'Nombre d’équipements',scan_review_label_gear_levels:'Niveaux des équipements',
  scan_review_label_gear_rarity:'Rareté',scan_review_label_exclusive:'Arme exclusive',
  scan_review_status_pending:'À confirmer',scan_review_status_missing:'Non détecté',
  scan_review_gear_many:'{count} équipements détectés',scan_review_gear_one:'{count} équipement détecté',
  scan_review_gear_levels_summary:'Niveaux : {levels}',scan_review_gear_level_summary:'Niveau : {level}',
  scan_review_exclusive_not_visible:'Non visible sur cette capture',
  scan_review_gear_edit_help:'Corrige les équipements détectés'
};
function t(key,values={}){
  return String(labels[key]||key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));
}
function esc(value){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
const patch=createScanReviewDraft('squad1',{squads:[{power:34.29,heroes:[
  {level:150,stars:5,power:0,exclusive:'non visible',gear:'count=4;levels=40,40,40,40'},
  {level:149,power:2.8},
  {},{exclusive:'Lv. 10'},{}
]}]});
const groups=buildScanReviewGroups('squad1',patch);
const {html,rows}=renderScanReviewMarkup(groups,t,esc);
assert.equal(groups.length,6,'the squad and its five hero cards are present');
assert.match(html,/Escouade 1/);
assert.match(html,/Héros 1/);
assert.match(html,/Héros 5/);
assert.match(html,/4 équipements détectés/);
assert.match(html,/Niveaux : 40 \/ 40 \/ 40 \/ 40/);
assert.match(html,/Non visible sur cette capture/);
assert.match(html,/data-status="missing"/);
assert.match(html,/data-status="pending"/);
assert.doesNotMatch(html,/(?:count=4;levels=|squads ·|Champ :|value="0")/,'no raw gear, technical path or unproven zero is shown');
assert.doesNotMatch(html,/data-scan-review-path/,'internal paths remain in memory and never enter markup');
assert.deepEqual(rows[0].path,['squads',0,'power']);
assert.match(html,/aria-label="Équipements"|aria-label="Nombre d’équipements"/,'gear editors have human accessible labels');
assert.match(html,/title="À confirmer"/,'status badges have translated titles');
const noGear=renderScanReviewMarkup(buildScanReviewGroups('squad2',createScanReviewDraft('squad2',{squads:[null,{heroes:[{level:120}]}]})),t,esc);
assert.match(noGear.html,/data-scan-gear-count=/,'missing equipment can be entered before save');
assert.doesNotMatch(noGear.html,/count=\d+;levels=/,'missing equipment never exposes technical syntax');
const mixed=createScanReviewDraft('squad1',{squads:[{heroes:[{gear:'count=3;level=40;rarity=orange,red'}]}]});
const mixedHtml=renderScanReviewMarkup(buildScanReviewGroups('squad1',mixed),t,esc).html;
assert.match(mixedHtml,/value="orange"[^>]*checked/,'orange rarity remains selected');
assert.match(mixedHtml,/value="red"[^>]*checked/,'red rarity remains selected');
assert.doesNotMatch(mixedHtml,/rarity=orange,red/,'the canonical mixed-gear string is never exposed');
const roundTrip=serializeScanReviewGear([{count:'3',levels:'40',rarity:'orange,red'}]);
assert.equal(roundTrip.value,'count=3;level=40;rarity=orange,red','unchanged multi-rarity gear round-trips without loss');
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const formCode=source.slice(source.indexOf('function scanReviewFormEdits('),source.indexOf('function updateScanReviewRaritySummary('));
const container={
  querySelectorAll(selector){
    if(selector==='[data-scan-gear-count="0"]')return [{value:'3',validity:{badInput:false}}];
    if(selector==='[data-scan-gear-rarity="0"][data-scan-gear-part="0"]:checked')return [{value:'red'},{value:'orange'}];
    return [];
  },
  querySelector(selector){return selector==='[data-scan-gear-levels="0"][data-scan-gear-part="0"]'?{value:'40'}:null}
};
const editContext={$:()=>container,serializeScanReviewGear};
vm.runInNewContext(formCode,editContext);
const collected=editContext.scanReviewFormEdits({displayRows:[{kind:'gear',path:['squads',0,'heroes',0,'gear']}]});
assert.equal(collected.edits[0].value,'count=3;level=40;rarity=red,orange','the form collects every selected rarity, not just the first');
const shopDraft={owner:'user:a',patch:createScanReviewDraft('shop',{shop:{offers:[{item_name:'Tickets',contents:'count=4 tickets'}]}})};
const shopHtml=renderScanReviewMarkup(buildScanReviewGroups('shop',shopDraft.patch),t,esc).html;
assert.match(shopHtml,/value="count=4 tickets"/,'non-gear OCR content is not silently blanked');
assert.equal(applyOwnedScanReview(shopDraft,'user:a',[{path:['shop','offers',0,'contents'],value:'count=4 tickets'}]).patch.shop.offers[0].contents,'count=4 tickets');
assert.match(source,/replacement\.replaceWith\(original\)/,'locale refresh retains the live form controls and their edits');
assert.match(source,/queueMicrotask\(\(\)=>translateOpenScanReview\(scanReviewStatusBeforeLanguage\)\)/,'language switching refreshes the open review after static translation');
const translateCode=source.slice(source.indexOf('function translateOpenScanReview('),source.indexOf('function showConfirmedScanStatus('));
const status={className:'notice',textContent:'scan_wait'};
const statusContext={
  pendingScanReview:null,
  $:selector=>selector==='#scanStatus'?status:null,
  t:key=>`localized:${key}`,
  showConfirmedScanStatus:(target,key)=>{target.confirmedKey=key;target.textContent=`localized:${key}`}
};
vm.runInNewContext(translateCode,statusContext);
statusContext.translateOpenScanReview({key:'scan_review_ready',confirmed:false,className:'notice'});
assert.equal(status.textContent,'localized:scan_review_ready','language change restores the pending review status');
statusContext.translateOpenScanReview({key:'scan_saved',confirmed:true,className:'notice'});
assert.equal(status.confirmedKey,'scan_saved','language change restores the confirmed badge and status');
console.log('PASS: scan review markup groups heroes, hides raw OCR strings, and keeps missing values editable');