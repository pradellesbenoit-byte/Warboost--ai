const RARITY_ALIASES={
  red:"red",rouge:"red",
  orange:"orange",
  gold:"gold",golden:"gold",or:"gold",
  purple:"purple",violet:"purple",violette:"purple",
  blue:"blue",bleu:"blue",bleue:"blue",
  green:"green",vert:"green",verte:"green"
};

function cleanRarity(value){
  const raw=String(value||"").trim().toLowerCase();
  if(!raw)return null;
  const parts=raw.split(",").map(x=>RARITY_ALIASES[x.trim()]||null).filter(Boolean);
  return parts.length?parts.join(","):null;
}
function safeInt(value,min,max){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:null}
function safeLevels(value){
  const values=String(value||"").split(",");
  if(values.some(x=>! /^\d+$/.test(x.trim())))return null;
  const rows=values.map(x=>safeInt(x.trim(),0,100));
  return rows.length&&rows.length<=4&&rows.every(x=>x!==null)?rows:null;
}
function pushSegment(out,{slot=null,count,level=null,levels=null,rarity=null}){
  const c=safeInt(count,1,4);if(c===null)return;
  const position=slot===null?null:safeInt(slot,0,3);
  if(slot!==null&&(position===null||c!==1))return;
  const one=level===null?null:safeInt(level,0,100),many=levels?safeLevels(levels):null,r=cleanRarity(rarity);
  if(level!==null&&one===null||levels&&!many)return;
  if(position!==null&&many?.length>1)return;
  out.push({...(position!==null?{slot:position}:{}),count:c,level:one,levels:many,rarity:r});
}

/**
 * Parse both the canonical WarBoost form and older/raw variants.
 * Multiple visible gear groups are supported, e.g.
 * count=3;level=40;rarity=orange;count=1;level=40;rarity=red
 */
export function parseGear(raw){
  const s=String(raw||"").trim();if(!s)return {segments:[],levelOnly:null,valid:false};
  const out=[];
  const canonical=/(?:slot=(\d+);)?count=(\d+)(?:;(level|levels)=([0-9,]+))?(?:;rarity=([a-zÀ-ÿ_-]+(?:,[a-zÀ-ÿ_-]+)*))?/gi;
  let m;
  while((m=canonical.exec(s))){pushSegment(out,{slot:m[1]??null,count:m[2],...(m[3]?{[m[3].toLowerCase()]:m[4]}:{}),rarity:m[5]})}
  if(out.length){
    const total=out.reduce((sum,x)=>sum+x.count,0);
    const slots=out.filter(x=>x.slot!==undefined).map(x=>x.slot);
    const valid=total<=4&&new Set(slots).size===slots.length&&
      !s.replace(canonical,"").replace(/[|;\s]/g,"");
    return {segments:valid?out:[],levelOnly:null,valid:Boolean(valid)};
  }
  const natural=s.match(/^(\d+)\s+gear items?,\s*Lv\.?\s*(\d+),\s*([a-zÀ-ÿ_-]+)\s+rarity$/i);
  if(natural){pushSegment(out,{count:natural[1],level:natural[2],rarity:natural[3]});return {segments:out,levelOnly:null,valid:Boolean(out.length)}}
  const lv=s.match(/^(?:Lv\.?|level=)\s*(\d+)$/i);
  if(lv){const n=safeInt(lv[1],0,100);return {segments:[],levelOnly:n,valid:n!==null}}
  return {segments:[],levelOnly:null,valid:false};
}

export function sanitizeGear(raw){
  const parsed=parseGear(raw);if(!parsed.valid)return null;
  if(parsed.levelOnly!==null)return `level=${parsed.levelOnly}`;
  return parsed.segments.map(x=>{
    const bits=[...(x.slot!==undefined?[`slot=${x.slot}`]:[]),`count=${x.count}`];
    if(x.level!==null)bits.push(`level=${x.level}`);
    else if(x.levels?.length)bits.push(`levels=${x.levels.join(",")}`);
    if(x.rarity)bits.push(`rarity=${x.rarity}`);
    return bits.join(";");
  }).join("|");
}

export function formatGearSummary(raw,{gearItems="gear items",level="Lv.",rarity="Rarity",rarityLabel=x=>x}={}){
  const parsed=parseGear(raw);if(!parsed.valid)return "";
  if(parsed.levelOnly!==null)return `${level}${parsed.levelOnly}`;
  return parsed.segments.map(x=>{
    const bits=[`${x.count} ${gearItems}`];
    if(x.level!==null)bits.push(`${level}${x.level}`);
    else if(x.levels?.length)bits.push(x.levels.map(v=>`${level}${v}`).join("/"));
    if(x.rarity)bits.push(`${rarity} ${x.rarity.split(",").map(rarityLabel).join("/")}`);
    return bits.join(" · ");
  }).join(" / ");
}
