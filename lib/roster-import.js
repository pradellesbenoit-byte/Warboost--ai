export function rosterNameKey(v){
  return String(v||"").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ");
}

export function parseRosterNumber(v){
  if(v===null||v===undefined)return null;
  const raw=String(v).trim().replace(/\s/g,"").replace(",", ".");
  const m=raw.match(/-?\d+(?:\.\d+)?/);if(!m)return null;
  let n=Number(m[0]);if(!Number.isFinite(n))return null;
  if(/b$/i.test(raw))n*=1000;
  return n;
}

function isHeader(cols,lineNo){
  if(lineNo!==0)return false;
  const joined=cols.join(" ").toLowerCase();
  return /(name|nom|pseudo|joueur|player).*(role|rôle|rang|rank|grade)|(role|rôle|rang|rank|grade).*(hq|qg|power|puissance)/i.test(joined);
}

export function parseRosterImport(text,{now=new Date().toISOString()}={}){
  const lines=String(text||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean),out=[];
  for(let lineNo=0;lineNo<lines.length;lineNo++){
    const raw=lines[lineNo];
    let cols=raw.includes("\t")?raw.split("\t"):raw.includes(";")?raw.split(";"):raw.split(",");
    cols=cols.map(x=>String(x||"").trim().replace(/^["']|["']$/g,""));
    if(isHeader(cols,lineNo))continue;
    const roleIndex=cols.findIndex(x=>/^R[1-5]$/i.test(x)),role=roleIndex>=0?cols[roleIndex].toUpperCase():"R1";
    let name=cols[0]||"";if(roleIndex===0)name=cols[1]||"";
    if(!name||/^R[1-5]$/i.test(name))continue;
    const candidates=cols.map((v,i)=>({v,i,n:parseRosterNumber(v)})).filter(x=>x.i!==roleIndex&&x.i!==0&&x.n!==null);
    let hq=null,power=null;
    for(const c of candidates){
      if(hq===null&&Number.isInteger(c.n)&&c.n>=1&&c.n<=50){hq=c.n;continue}
      if(power===null&&c.n>0)power=c.n;
    }
    if(power===null){const token=cols.find((v,i)=>i!==roleIndex&&/\d\s*[mkb]$/i.test(v));if(token)power=parseRosterNumber(token)}
    out.push({name,role,hq_level:hq,power_m:power,source:"manual_import",imported_at:now,updated_at:now});
  }
  return out;
}

export function mergeRosterMembers(existing,imported){
  const rows=Array.isArray(existing)?existing.map(x=>({...x})):[],byName=new Map(rows.map((m,i)=>[rosterNameKey(m.name),i]));
  for(const incoming of Array.isArray(imported)?imported:[]){
    const key=rosterNameKey(incoming?.name);if(!key)continue;
    const idx=byName.get(key);
    if(idx===undefined){rows.push({...incoming});byName.set(key,rows.length-1);continue}
    const old=rows[idx];
    rows[idx]={...old,name:incoming.name||old.name,role:incoming.role||old.role,hq_level:incoming.hq_level??old.hq_level??null,power_m:incoming.power_m??old.power_m??null,source:old.player_id?(old.source||"cloud"):"manual_import",imported_at:incoming.imported_at||old.imported_at||null,updated_at:incoming.updated_at||old.updated_at||null,player_id:old.player_id||null};
  }
  return rows;
}
