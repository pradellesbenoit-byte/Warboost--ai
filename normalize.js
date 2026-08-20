export function cleanString(v,max=120){return String(v??"").trim().slice(0,max)}
export function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}
export function clamp(v,min,max){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min}
export function normalizeState(input={}){
  const now=new Date().toISOString();
  const player=input.player||{},alliance=input.alliance||{},vs=input.vs||{},season=input.season||{};
  const squads=Array.from({length:4},(_,i)=>{
    const q=input.squads?.[i]||{};
    return {id:i+1,name:cleanString(q.name||`Escouade ${i+1}`,40),power:numberOrNull(q.power),updated_at:q.updated_at||null,heroes:Array.from({length:5},(_,j)=>{const h=q.heroes?.[j]||{};return {name:cleanString(h.name||`Héros ${j+1}`,50),level:numberOrNull(h.level),stars:numberOrNull(h.stars),power:numberOrNull(h.power),exclusive:cleanString(h.exclusive,30)||null,gear:cleanString(h.gear,80)||null}})}
  });
  return {
    version:"1.0.0",player_id:cleanString(input.player_id,120),updated_at:input.updated_at||now,
    player:{name:cleanString(player.name,80),server_id:cleanString(player.server_id,20),hq_level:numberOrNull(player.hq_level),power_m:numberOrNull(player.power_m),coordinates:player.coordinates??null,role:/^R[1-5]$/i.test(cleanString(player.role))?cleanString(player.role).toUpperCase():"R1"},
    squads,
    alliance:{id:cleanString(alliance.id,120)||null,tag:cleanString(alliance.tag,16).toUpperCase(),name:cleanString(alliance.name,100),role:/^R[1-5]$/i.test(cleanString(alliance.role))?cleanString(alliance.role).toUpperCase():"R1",invite_code:cleanString(alliance.invite_code,32).toUpperCase(),members:Array.isArray(alliance.members)?alliance.members.slice(0,200).map(m=>({name:cleanString(m.name,80),hq_level:numberOrNull(m.hq_level),power_m:numberOrNull(m.power_m),role:/^R[1-5]$/i.test(cleanString(m.role))?cleanString(m.role).toUpperCase():"R1",delta_m:numberOrNull(m.delta_m)})):[],updated_at:alliance.updated_at||null},
    vs:{week:numberOrNull(vs.week),day:numberOrNull(vs.day),our_alliance:cleanString(vs.our_alliance,16).toUpperCase(),opponent:cleanString(vs.opponent,40).toUpperCase(),our_score:vs.our_score??null,their_score:vs.their_score??null,updated_at:vs.updated_at||null},
    season:{name:cleanString(season.name,80),number:numberOrNull(season.number),day:numberOrNull(season.day),total_days:numberOrNull(season.total_days),profession:cleanString(season.profession,60),progress_pct:clamp(season.progress_pct||0,0,100),resistance:numberOrNull(season.resistance),updated_at:season.updated_at||null},
    sync:{provider:cleanString(input.sync?.provider||"local",80),status:cleanString(input.sync?.status||"local",30),last_sync:input.sync?.last_sync||null,last_error:cleanString(input.sync?.last_error,250)||null,auto_ready:Boolean(input.sync?.auto_ready)}
  }
}

export function mergeNewest(current={},incoming={}){
  const cur=normalizeState(current),inc=normalizeState({...current,...incoming,player:{...current.player,...incoming.player},alliance:{...current.alliance,...incoming.alliance},vs:{...current.vs,...incoming.vs},season:{...current.season,...incoming.season}});
  inc.squads=cur.squads.map((c,i)=>{
    const n=inc.squads[i];
    if(!n)return c;
    if(!c.updated_at)return n;
    if(!n.updated_at)return c;
    return new Date(n.updated_at)>=new Date(c.updated_at)?n:c;
  });
  return inc;
}
