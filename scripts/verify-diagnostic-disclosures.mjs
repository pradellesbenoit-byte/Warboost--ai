import assert from "node:assert/strict";
import fs from "node:fs";
import {createDiagnosticDisclosures} from "../lib/diagnostic-disclosures.js";
import {renderDiagnosticShop} from "../lib/diagnostic-shop-ui.js";

function fixture(saved=null,disabled=false){
  let stored=saved,listener=null,captureMode=null;
  const storage={getItem(){if(disabled)throw Error("blocked");return stored},
    setItem(key,value){if(disabled)throw Error("blocked");stored=value}};
  const element=(key,open)=>({open,getAttribute:name=>name==="data-pro-disclosure"?key:null});
  const diagnostic=element("diagnostic",true),shop=element("shop",false);
  const root={elements:[diagnostic,shop],querySelectorAll(){return this.elements},
    contains(el){return this.elements.includes(el)},
    addEventListener(type,fn,capture){assert.equal(type,"toggle");listener=fn;captureMode=capture},
    removeEventListener(){listener=null}};
  const control=createDiagnosticDisclosures({root,storage});
  return {root,diagnostic,shop,control,element,
    toggle(el){listener?.({target:el})},stored:()=>stored,captureMode:()=>captureMode};
}
const f=fixture();
assert.equal(f.diagnostic.open,true);assert.equal(f.shop.open,false);
assert.equal(f.captureMode(),true,"native toggle handled in capture phase");
f.diagnostic.open=false;f.toggle(f.diagnostic);
assert.equal(f.shop.open,false,"diagnostic closure does not open shop");
f.shop.open=true;f.toggle(f.shop);
assert.equal(f.diagnostic.open,false,"shop opening leaves diagnostic closed");
assert.deepEqual(JSON.parse(f.stored()),{diagnostic:false,shop:true});
// Native toggle is asynchronous: capture DOM state before replacing the shop.
f.shop.open=false;f.control.capture();
const replacement=f.element("shop",true);
f.root.elements=[f.diagnostic,replacement];
f.control.restore();
assert.equal(replacement.open,false,"closed shop survives rerender even before queued toggle");
replacement.open=true;f.control.capture();
f.root.elements=[f.diagnostic,f.element("shop",false)];f.control.restore();
assert.equal(f.root.elements[1].open,true,"open shop survives scan-triggered rerender");
f.toggle(replacement);
assert.equal(JSON.parse(f.stored()).shop,true,"detached old elements cannot overwrite state");
const child=f.element("provenance",false);f.toggle(child);
assert.deepEqual(JSON.parse(f.stored()),{diagnostic:false,shop:true},"child details are isolated");
const restored=fixture(f.stored());
assert.equal(restored.diagnostic.open,false);assert.equal(restored.shop.open,true);
for(const saved of ["invalid","null",'{"diagnostic":"false","shop":99}']){
 const fresh=fixture(saved);
 assert.equal(fresh.diagnostic.open,true);assert.equal(fresh.shop.open,false);
}
const blocked=fixture(null,true);
blocked.shop.open=true;blocked.control.capture();
blocked.root.elements=[blocked.diagnostic,blocked.element("shop",false)];
blocked.control.restore();assert.equal(blocked.root.elements[1].open,true,"in-memory fallback works");
const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
assert.match(index,/id="proDiagnosticDisclosure"[^>]*data-pro-disclosure="diagnostic" open/);
assert.match(index,/<\/div><\/details>\s*<div id="proDiagnosticShop"/,"two independently accessible blocks");
const html=renderDiagnosticShop([{title:"DVA",options:[{item:"Fragment",store:"Campagne",cost:"300",type:"internal",fresh:false}]}]);
assert.match(html,/<details[^>]*data-pro-disclosure="shop"[^>]*>/);
assert.ok(!html.match(/<details[^>]*data-pro-disclosure="shop"[^>]*>/)[0].includes(" open"));
assert.match(html,/Fragment/);assert.match(html,/Campagne/);
assert.match(html,/proDisclosureChevron/);
const css=fs.readFileSync(new URL("../diagnostic-disclosures.css",import.meta.url),"utf8");
assert.match(css,/prefers-reduced-motion/);assert.match(css,/min-height:44px/);
console.log("PASS: independent native disclosures, defaults, session preferences, rerender races, pending-toggle capture, disabled storage, preserved content and reduced-motion support.");