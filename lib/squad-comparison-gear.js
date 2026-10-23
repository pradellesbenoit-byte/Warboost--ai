// Read-only adapter: never repairs persisted equipment or infers piece positions.
import {parseGear} from "./gear.js";
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const missing=()=>({kind:"missing"});
const bad=reason=>({kind:"unreadable",reason});
const keys=(x,allowed)=>x&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).every(k=>allowed.includes(k));
const integer=(x,min,max)=>typeof x==="number"&&Number.isInteger(x)&&x>=min&&x<=max;
const type=x=>x===null?"null":Array.isArray(x)?"array":typeof x;
const rarity=/^(?:red|rouge|orange|gold|golden|or|purple|violet|violette|blue|bleu|bleue|green|vert|verte)$/i;
function strictParse(text){
  const parsed=parseGear(text);
  if(!parsed.valid)return null;
  if(parsed.segments.some(s=>s.levels&&s.levels.length!==s.count))return null;
  const count=(text.match(/count=/gi)||[]).length;
  if(count&&count!==parsed.segments.length)return null;
  const slotted=parsed.segments.filter(s=>s.slot!==undefined).length;
  if(slotted&&slotted!==parsed.segments.length)return null;
  const rarities=[...text.matchAll(/rarity=([^;|\s]+)/gi)].flatMap(m=>m[1].split(","));
  if(rarities.some(r=>!rarity.test(r)))return null;
  const natural=text.match(/^\d+\s+gear items?,\s*Lv\.?\s*\d+,\s*([a-zÀ-ÿ_-]+)\s+rarity$/i);
  if(natural&&!rarity.test(natural[1]))return null;
  return parsed;
}
function accepted(parsed){
  const segments=parsed.segments.map(x=>({...x}));
  const slotted=segments.length>0&&segments.every(x=>Number.isInteger(x.slot));
  if(slotted)segments.sort((a,b)=>a.slot-b.slot);
  return {kind:"value",value:{segments,levelOnly:parsed.levelOnly},
    layout:parsed.levelOnly!==null?"level_only":slotted?"slotted":"grouped"};
}
function segmentText(x){
  if(!keys(x,["slot","count","level","levels","rarity"])||!own(x,"count")||!integer(x.count,1,4))return null;
  if(own(x,"slot")&&(!integer(x.slot,0,3)||x.count!==1))return null;
  if(x.level!=null&&!integer(x.level,0,100))return null;
  if(x.levels!=null&&(!Array.isArray(x.levels)||x.levels.length!==x.count||
    x.levels.some(n=>!integer(n,0,100))||x.level!=null))return null;
  if(own(x,"slot")&&x.levels?.length>1)return null;
  if(x.rarity!=null&&!/^(?:red|orange|gold|purple|blue|green)$/.test(x.rarity))return null;
  return [...(own(x,"slot")?[`slot=${x.slot}`]:[]),`count=${x.count}`,
    ...(x.level!=null?[`level=${x.level}`]:x.levels?[`levels=${x.levels.join(",")}`]:[]),
    ...(x.rarity?[`rarity=${x.rarity}`]:[])].join(";");
}
function objectGear(x){
  // These shapes are explicitly present in existing fixtures or parseGear's output.
  if(keys(x,["level"])&&own(x,"level")&&integer(x.level,0,100))
    return accepted(parseGear(`level=${x.level}`));
  if(!keys(x,["segments","levelOnly","valid"])||!Array.isArray(x.segments)||x.segments.length>4||
    !own(x,"levelOnly")||x.valid===false||own(x,"valid")&&typeof x.valid!=="boolean")return null;
  if(x.levelOnly!==null){
    return x.segments.length===0&&integer(x.levelOnly,0,100)?accepted(parseGear(`level=${x.levelOnly}`)):null;
  }
  if(!x.segments.length)return null;
  const texts=x.segments.map(segmentText);
  if(texts.some(x=>x===null))return null;
  const parsed=strictParse(texts.join("|"));
  if(!parsed||parsed.segments.length!==texts.length)return null;
  const slotted=parsed.segments.filter(s=>s.slot!==undefined).length;
  if(slotted&&slotted!==texts.length)return null;
  return accepted(parsed);
}
function partialText(text){
  const chunks=text.split("|");
  if(chunks.length<2||chunks.length>4)return null;
  const good=[];
  for(let i=0;i<chunks.length;i++){
    const chunk=chunks[i],parsed=parseGear(chunk);
    if(!/^slot=[0-3];count=1(?:;level=\d{1,3})?(?:;rarity=(?:red|orange|gold|purple|blue|green))?$/.test(chunk)||
      !parsed.valid||parsed.segments.length!==1){
      // Only a terminal damaged piece can be isolated; never skip an internal fault.
      if(i!==chunks.length-1||!good.length||!/^slot=[0-3](?:;|$)/.test(chunk))return null;
      const candidate=Number(chunk[5]);
      if(good.some(s=>s.slot===candidate))return null;
      return {...accepted({segments:good,levelOnly:null}),incomplete:true};
    }
    const piece=parsed.segments[0];
    if(good.some(s=>s.slot===piece.slot))return null;
    good.push(piece);
  }
  return null;
}
export function projectComparisonGear(input,status){
  const inputType=type(input);
  const finish=(entry,format)=>({...entry,diagnostic:{inputType,format}});
  if(["unreadable","illisible","not_detected","ambiguous"].includes(status))
    return finish(bad("value_unreadable"),"unreadable");
  if(input==null||typeof input==="string"&&!input.trim())return finish(missing(),"absent");
  if(typeof input==="number")return finish(bad("gear_number_ambiguous"),"number_ambiguous");
  if(typeof input==="object"){
    const result=objectGear(input);
    return finish(result||bad("gear_format_unsupported"),result?"object_compatible":"unknown_structure");
  }
  if(typeof input!=="string"||input.length>2048)return finish(bad("gear_format_unsupported"),"unknown_structure");
  const text=input.trim();
  if(/^-?\d+(?:\.\d+)?$/.test(text))return finish(bad("gear_number_ambiguous"),"number_ambiguous");
  if(/^(?:\?|—|-|unreadable|illisible|non détecté|unknown|ambiguous)$/i.test(text))
    return finish(bad("value_unreadable"),"unreadable");
  if(/^[\[{]/.test(text)){
    let decoded;try{decoded=JSON.parse(text)}catch{return finish(bad("gear_json_invalid"),"json_invalid")}
    const result=objectGear(decoded);
    return finish(result||bad("gear_format_unsupported"),result?"json_compatible":"unknown_structure");
  }
  const parsed=strictParse(text);
  if(parsed)return finish(accepted(parsed),/^slot=/.test(text)?"slotted":"legacy_known");
  const partial=partialText(text);
  if(partial)return finish(partial,"text_partial");
  return finish(bad("gear_text_invalid"),"text_invalid");
}
