import {SQUAD_COMPARE_SCHEMA,SQUAD_COMPARE_CATEGORIES,COMPARISON_REASONS} from "./squad-comparison-project.js";
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);
const canonical=input=>Array.isArray(input)?input.map(canonical):input&&typeof input==="object"?
  Object.fromEntries(Object.keys(input).sort().map(key=>[key,canonical(input[key])])):input;
const stable=input=>JSON.stringify(canonical(input));
// Proof flags and normalization metadata are not gameplay values.
function content(input){
  if(!input||typeof input!=="object")return input;
  if(input.kind==="missing")return {kind:"missing"};
  if(input.kind==="value")return content(input.value);
  return Array.isArray(input)?input.map(content):Object.fromEntries(Object.entries(input).map(([key,value])=>[key,content(value)]));
}
function unreadable(input){
  if(!input||typeof input!=="object")return null;
  if(input.kind==="unreadable")return COMPARISON_REASONS.has(input.reason)?input.reason:"value_unreadable";
  for(const item of Object.values(input)){const reason=unreadable(item);if(reason)return reason}
  return null;
}
function entries(row){
  return SQUAD_COMPARE_CATEGORIES.flatMap(category=>{
    if(category==="power")return [{category,slot:null,entry:row.categories.power?.total},
      ...Array.from({length:5},(_,slot)=>({category,slot:slot+1,entry:row.categories.power?.heroes?.[slot]}))];
    if(category==="confirmation"){
      const meta=row.categories.confirmation;
      const present=Boolean(meta&&(meta.composition?.kind!=="missing"||meta.empty||meta.powerStatus?.kind==="value"));
      return [{category,slot:null,entry:present?{kind:"value",value:meta,
        confirmed:meta?.composition?.confirmed===true||Boolean(meta?.empty&&meta.empty!=="unverified")}:{kind:"missing"}}];
    }
    return Array.from({length:5},(_,slot)=>({category,slot:slot+1,entry:row.categories[category]?.[slot]}));
  });
}
const validRow=(row,id)=>row?.id===id&&typeof row.hasData==="boolean"&&Array.isArray(row.issues)&&row.categories&&
  SQUAD_COMPARE_CATEGORIES.every(key=>has(row.categories,key));
function blocks(row,field){
  return row.issues.some(issue=>issue.scope==="squad"||
    field.slot!==null&&(issue.scope==="heroes"||(issue.scope==="slot"||issue.scope==="identity")&&issue.slot===field.slot));
}
export function compareSquadProjections(local,remote,{available=true}={}){
  return Array.from({length:4},(_,index)=>{
    const id=index+1,left=local?.rows?.[index],right=remote?.rows?.[index],issues=[],fields=[];
    const add=(reason,category="structure",slot=null,side="both")=>{
      const safe={reason:COMPARISON_REASONS.has(reason)?reason:"legacy_shape_unsupported",
        category:[...SQUAD_COMPARE_CATEGORIES,"structure"].includes(category)?category:"structure",
        slot:Number.isInteger(slot)&&slot>=1&&slot<=5?slot:null,side:["local","cloud","both"].includes(side)?side:"both"};
      const old=issues.find(item=>item.reason===safe.reason&&item.category===safe.category&&item.slot===safe.slot);
      if(old){if(old.side!==safe.side)old.side="both";return}issues.push(safe);
    };
    const early=reason=>{add(reason);return {id,kind:"unknown",categories:[],fields,issues,
      counts:{same:0,different:0,unknown:0,absent:0,confirmedSame:0,unconfirmed:0},incomplete:true}};
    if(!available)return early("cloud_data_unavailable");
    if(local?.schema!==SQUAD_COMPARE_SCHEMA||remote?.schema!==SQUAD_COMPARE_SCHEMA)return early("schema_unsupported");
    if(!validRow(left,id)||!validRow(right,id))return early("legacy_shape_unsupported");
    for(const [side,row] of [["local",left],["cloud",right]])
      for(const issue of row.issues)add(issue.reason,issue.category,issue.slot,side);
    const a=entries(left),b=entries(right);
    for(let i=0;i<a.length;i++){
      const field=a[i],other=b[i],x=field.entry,y=other.entry,{category,slot}=field;
      let state="unknown",confirmed=false,pieces;
      if(blocks(left,field)||blocks(right,field)){
        for(const [side,row] of [["local",left],["cloud",right]])
          for(const issue of row.issues)if(issue.scope==="squad"||slot!==null&&(
            issue.scope==="heroes"||(issue.scope==="slot"||issue.scope==="identity")&&issue.slot===slot))
            add(issue.reason,category,slot,side);
      }else if(!x||!y||!["value","missing","unreadable"].includes(x.kind)||!["value","missing","unreadable"].includes(y.kind)){
        add("legacy_shape_unsupported",category,slot);
      }else{
        const badX=unreadable(x),badY=unreadable(y);
        const identityX=slot?left.categories.composition[slot-1]:null,identityY=slot?right.categories.composition[slot-1]:null;
        const namesDiffer=slot&&identityX?.kind==="value"&&identityY?.kind==="value"&&identityX.value!==identityY.value;
        if(category!=="composition"&&namesDiffer){
          add("hero_identity_mismatch",category,slot);
        }else if(badX||badY){
          if(badX)add(badX,category,slot,"local");
          if(badY)add(badY,category,slot,"cloud");
        }else if(category==="gear"&&x.kind==="value"&&y.kind==="value"&&x.layout!==y.layout){
          add("gear_layout_mismatch",category,slot);
        }else if(category==="gear"&&(x.incomplete||y.incomplete)){
          if(x.incomplete)add("gear_text_partial",category,slot,"local");
          if(y.incomplete)add("gear_text_partial",category,slot,"cloud");
          if(x.kind==="value"&&y.kind==="value"&&x.layout==="slotted"&&y.layout==="slotted"){
            pieces=x.value.segments.flatMap(leftPiece=>{
              const rightPiece=y.value.segments.find(p=>p.slot===leftPiece.slot);
              if(!rightPiece)return [];
              // Missing level/rarity is not equivalent to explicit zero or a known value.
              return ["level","rarity"].filter(key=>leftPiece[key]!=null&&rightPiece[key]!=null)
                .map(key=>({piece:leftPiece.slot+1,attribute:key,
                  state:stable(leftPiece[key])===stable(rightPiece[key])?"same":"different"}));
            });
            if(pieces.some(piece=>piece.state==="different"))state="different";
          }
        }else if(x.kind==="missing"&&y.kind==="missing"){
          state="absent";
          if(category==="composition"&&(left.hasData||right.hasData))add("identity_missing",category,slot);
        }else{
          state=stable(content(x))===stable(content(y))?"same":"different";
          const identityCompatible=!slot||category==="composition"||identityX?.kind==="value"&&identityY?.kind==="value"&&identityX.value===identityY.value;
          const identityConfirmed=!slot||category==="composition"||identityX?.confirmed===true&&identityY?.confirmed===true;
          confirmed=x.confirmed===true&&y.confirmed===true&&identityCompatible&&identityConfirmed;
          if(x.kind==="missing")add("value_absent",category,slot,"local");
          if(y.kind==="missing")add("value_absent",category,slot,"cloud");
          if(!confirmed&&x.kind==="value"&&y.kind==="value")add(!identityCompatible?"identity_missing":
            !identityConfirmed||category==="composition"?"confirmation_missing":"field_confirmation_missing",category,slot);
        }
      }
      fields.push({category,slot,state,confirmed,...(pieces?{pieces}:{}),
        ...(category==="gear"?{formats:{local:x?.diagnostic||null,cloud:y?.diagnostic||null}}:{})});
    }
    const count=state=>fields.filter(field=>field.state===state).length;
    const counts={same:count("same"),different:count("different"),unknown:count("unknown"),absent:count("absent"),
      confirmedSame:fields.filter(field=>field.state==="same"&&field.confirmed).length,
      unconfirmed:fields.filter(field=>["same","different"].includes(field.state)&&!field.confirmed).length};
    const categories=[...new Set(fields.filter(field=>field.state==="different").map(field=>field.category))];
    const incomplete=issues.length>0||counts.unknown>0||counts.unconfirmed>0;
    const empty=!left.hasData&&!right.hasData&&!incomplete&&!counts.different;
    const kind=empty?"empty":counts.different?"different":incomplete?(counts.same?"partial":"unknown"):left.marker||right.marker?"marker":"same";
    return {id,kind,categories,incomplete,fields,issues,counts,marker:left.marker||right.marker};
  });
}
