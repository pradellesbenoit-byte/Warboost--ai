// WarBoost V2.3.4 — single source of truth for hero identity.
// This table is used by browser UI, Scan/Vision, normalization and AI advice.
// Visual assets are original WarBoost placeholder art, not official Last War assets.

export const HERO_DEFINITIONS = [
  {name:'Adam',type:'missile'},
  {name:'Ambolt',type:'aircraft'},
  {name:'Braz',type:'missile',aliases:['Blaz']},
  {name:'Cage',type:'aircraft'},
  {name:'Carlie',type:'aircraft'},
  {name:'DVA',type:'aircraft',aliases:['D.V.A','D V A']},
  {name:'Elsa',type:'missile'},
  {name:'Farhad',type:'tank'},
  {name:'Fiona',type:'missile'},
  {name:'Gump',type:'tank'},
  {name:'Kane',type:'missile'},
  {name:'Kimberly',type:'tank',aliases:['Kimberley']},
  {name:'Loki',type:'tank'},
  {name:'Lucius',type:'aircraft'},
  {name:'Marshall',type:'tank'},
  {name:'Mason',type:'tank'},
  {name:'Maxwell',type:'aircraft'},
  {name:'McGregor',type:'missile'},
  {name:'Monica',type:'tank'},
  {name:'Morrison',type:'aircraft',aliases:['Morrisson']},
  {name:'Murphy',type:'tank'},
  {name:'Richard',type:'tank'},
  {name:'Sarah',type:'aircraft'},
  {name:'Scarlett',type:'tank'},
  // User-facing WarBoost name kept as Skyler; Schuyler/Shuyler are accepted aliases.
  {name:'Skyler',type:'aircraft',aliases:['Schuyler','Shuyler']},
  {name:'Stetmann',type:'tank',aliases:['Stetman']},
  {name:'Swift',type:'missile'},
  {name:'Tesla',type:'missile'},
  {name:'Venom',type:'missile'},
  {name:'Violet',type:'tank'},
  {name:'Williams',type:'tank'}
];

export const HERO_CATALOG = HERO_DEFINITIONS.map(x=>x.name);
export const HERO_TYPES = Object.freeze(Object.fromEntries(HERO_DEFINITIONS.map(x=>[x.name,x.type])));

export function heroKey(v=''){
  return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'');
}

const BY_KEY = new Map();
for(const h of HERO_DEFINITIONS){
  BY_KEY.set(heroKey(h.name),h);
  for(const a of h.aliases||[])BY_KEY.set(heroKey(a),h);
}

export function isGenericHeroName(v){
  const s=String(v??'').trim();
  return !s||/^(?:hero|héros|heroe|héroe|held|英雄|بطل)\s*\d+$/i.test(s);
}

export function catalogHero(v){
  if(isGenericHeroName(v))return null;
  return BY_KEY.get(heroKey(v))||null;
}

export function catalogHeroName(v){return catalogHero(v)?.name||null}

// Canonicalize known heroes, but preserve a non-generic unknown string rather than inventing an identity.
export function canonicalHeroName(v){
  const s=String(v??'').trim();
  if(isGenericHeroName(s))return '';
  return catalogHeroName(s)||s;
}

export function heroType(v){return catalogHero(v)?.type||null}

export function canonicalHeroKey(v){return heroKey(catalogHeroName(v)||canonicalHeroName(v))}

export function heroAssetSlug(v){
  const h=catalogHero(v);if(!h)return null;
  return heroKey(h.name);
}

export function heroPresentation(v){
  const h=catalogHero(v);if(!h)return null;
  const slug=heroAssetSlug(h.name);
  return {name:h.name,type:h.type,src:`/assets/heroes/${slug}.svg`,fallback:null};
}

export function allHeroAssetPaths(){return HERO_CATALOG.map(n=>`/assets/heroes/${heroAssetSlug(n)}.svg`)}
