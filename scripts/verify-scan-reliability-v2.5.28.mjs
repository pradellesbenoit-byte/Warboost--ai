import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseGear,sanitizeGear,formatGearSummary} from '../lib/gear.js';
import {reconcileConfirmedSquad} from '../lib/squad-identity.js';

const log=x=>console.log(`PASS: ${x}`);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Exact real-world regression that exposed V2.5.26 raw technical gear output.
{
  const raw='count=3;level=40;rarity=orange;count=1;level=40;rarity=red';
  const parsed=parseGear(raw);
  assert.equal(parsed.valid,true);
  assert.equal(parsed.segments.length,2);
  assert.equal(parsed.segments.reduce((n,x)=>n+x.count,0),4);
  assert.equal(sanitizeGear(raw),'count=3;level=40;rarity=orange|count=1;level=40;rarity=red');
  const ui=formatGearSummary(raw,{gearItems:'équipements',level:'Nv.',rarity:'rareté',rarityLabel:x=>({orange:'orange',red:'rouge'}[x]||x)});
  assert.equal(ui,'3 équipements · Nv.40 · rareté orange / 1 équipements · Nv.40 · rareté rouge');
  assert.ok(!ui.includes('count='));
  log('mixed orange/red gear is normalized and never leaks raw count=/rarity= syntax');
}

// Unsafe/unparseable AI text must not become player data.
{
  assert.equal(sanitizeGear('probably four orange gears at level forty'),null);
  assert.equal(formatGearSummary('count=9;level=999;rarity=orange'), '');
  log('invalid or implausible gear output is rejected');
}


// Partial canonical gear is valid when Vision can see only some components.
{
  assert.equal(sanitizeGear('count=4;level=40'),'count=4;level=40');
  assert.equal(sanitizeGear('count=4;rarity=red'),'count=4;rarity=red');
  assert.equal(formatGearSummary('count=4;level=40',{gearItems:'équipements',level:'Nv.',rarity:'rareté'}),'4 équipements · Nv.40');
  log('partial but explicit gear facts remain usable without inventing missing rarity/level');
}

// Defense in depth: server scan sanitizes gear before returning state, confirmation sanitizes again.
{
  const scan=fs.readFileSync(path.join(root,'api/scan.js'),'utf8');
  const identity=fs.readFileSync(path.join(root,'lib/squad-identity.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(scan,/import \{sanitizeGear\} from "\.\.\/lib\/gear\.js"/);
  assert.match(scan,/const gear=sanitizeGear\(h\?\.gear\)/);
  assert.match(scan,/if\(gear\)hx\.gear=gear;x\.heroes\[idx\]=hx/);
  assert.doesNotMatch(scan,/\bgearx\b/,'scan sanitizer must never reference an undefined gearx identifier');
  assert.match(identity,/const safeGear=sanitizeGear\(rawScanned\.gear\)/);
  assert.match(app,/formatGearSummary\(raw/);
  log('gear validation is enforced at API, confirmation, and UI layers');
}

// Confirmed order must remain EXACTLY player-confirmed, and slot details stay with that confirmed slot.
{
  const now='2026-09-06T17:00:00.000Z';
  const blank=()=>({name:'',level:null,stars:null,power:null,exclusive:null,gear:null,awakening:null});
  const base={player_id:'p1',hero_profiles:[],exclusive_weapons:[],hero_progression:[],squads:Array.from({length:4},(_,i)=>({id:i+1,name:`Squad ${i+1}`,power:i?null:42.47,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:Array.from({length:5},blank)}))};
  const names=['Carlie','Lucius','Morrison','DVA','Skyler'];
  const incoming=[
    {level:150,stars:5,gear:'count=4;level=40;rarity=orange'},
    {level:150,stars:5,gear:'count=4;level=40;rarity=orange'},
    {level:150,stars:5,power:5.33,gear:'count=3;level=40;rarity=orange;count=1;level=40;rarity=red'},
    {level:150,stars:5,gear:'count=3;level=40;rarity=orange;count=1;level=40;rarity=red'},
    {level:150,stars:5,power:4.84,gear:'count=4;level=40;rarity=orange'}
  ];
  const out=reconcileConfirmedSquad(base,{squadId:1,names,incomingHeroes:incoming,updatedAt:now}).state;
  assert.deepEqual(out.squads[0].heroes.map(h=>h.name),names);
  assert.equal(out.squads[0].heroes[2].name,'Morrison');
  assert.equal(out.squads[0].heroes[2].power,5.33);
  assert.equal(out.squads[0].heroes[3].name,'DVA');
  assert.equal(out.squads[0].heroes[3].gear,'count=3;level=40;rarity=orange|count=1;level=40;rarity=red');
  log('Carlie/Lucius/Morrison/DVA/Skyler order and slot details remain exact after confirmation');
}

// Invalid fresh scan gear must NEVER overwrite a known hero gear value.
{
  const hero=(name,gear)=>({name,level:150,stars:5,power:null,exclusive:null,gear,awakening:null});
  const base={player_id:'p1',hero_profiles:[],exclusive_weapons:[],hero_progression:[],squads:[
    {id:1,name:'Squad 1',power:42.47,updated_at:'2026-09-05T00:00:00.000Z',needs_rescan:false,composition_changed_at:null,heroes:[hero('Carlie','count=4;level=40;rarity=orange'),hero('Lucius','count=4;level=40;rarity=orange'),hero('Morrison','count=4;level=40;rarity=orange'),hero('DVA','count=4;level=40;rarity=red'),hero('Skyler','count=4;level=40;rarity=orange')]},
    ...Array.from({length:3},(_,i)=>({id:i+2,name:`Squad ${i+2}`,power:null,updated_at:null,needs_rescan:false,composition_changed_at:null,heroes:Array.from({length:5},()=>hero('',null))}))
  ]};
  const incoming=base.squads[0].heroes.map(h=>({level:150,stars:5,gear:h.name==='DVA'?'uncertain red/orange text':h.gear}));
  const out=reconcileConfirmedSquad(base,{squadId:1,names:['Carlie','Lucius','Morrison','DVA','Skyler'],incomingHeroes:incoming,updatedAt:'2026-09-06T17:00:00.000Z'}).state;
  assert.equal(out.squads[0].heroes[3].gear,'count=4;level=40;rarity=red');
  log('invalid scan gear cannot overwrite trusted DVA gear data');
}


// V2.5.28 regression: the Season scan must import the lifecycle normalizer explicitly.
{
  const scan=fs.readFileSync(path.join(root,'api/scan.js'),'utf8');
  assert.match(scan,/import \{normalizeSeasonLifecycle\} from "\.\.\/lib\/season-lifecycle\.js"/);
  assert.doesNotMatch(scan,/\bgearx\b/);
  log('Season scan lifecycle helper is explicitly imported and HF1 gearx regression remains blocked');
}

// Exact Squad 3 real-world HF2 fixture confirmed in Preview by the player.
{
  const labels={gearItems:'équipements',level:'Nv.',rarity:'rareté',rarityLabel:x=>({orange:'orange',purple:'violette',red:'rouge'}[x]||x)};
  const cases=[
    ['Adam','count=4;levels=38,36,36,36;rarity=orange','4 équipements · Nv.38/Nv.36/Nv.36/Nv.36 · rareté orange'],
    ['Violet','count=4;levels=0,30,0,30;rarity=orange,purple,purple,purple','4 équipements · Nv.0/Nv.30/Nv.0/Nv.30 · rareté orange/violette/violette/violette'],
    ['Tesla','count=4;levels=12,9,5,40;rarity=orange','4 équipements · Nv.12/Nv.9/Nv.5/Nv.40 · rareté orange'],
    ['Sarah','count=4;levels=18,30,30,30;rarity=purple','4 équipements · Nv.18/Nv.30/Nv.30/Nv.30 · rareté violette'],
    ['Mason','count=4;levels=0,30,0,30;rarity=orange,purple,orange,purple','4 équipements · Nv.0/Nv.30/Nv.0/Nv.30 · rareté orange/violette/orange/violette']
  ];
  for(const [heroName,raw,expected] of cases){
    const normalized=sanitizeGear(raw);
    assert.ok(normalized,`${heroName} gear must sanitize`);
    assert.equal(formatGearSummary(normalized,labels),expected,`${heroName} exact gear mismatch`);
  }
  log('Squad 3 exact Adam/Violet/Tesla/Sarah/Mason gear levels and rarities, including true Lv.0, remain exact');
}

console.log('WarBoost V2.5.28 Scan Reliability verification complete.');
