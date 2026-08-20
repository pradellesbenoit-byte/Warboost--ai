export function cleanString(v,max=120){return String(v??"").trim().slice(0,max)}
export function numberOrNull(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
export function clamp(v,min,max){if(v===null||v===undefined||v==="")return min;const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min}
function role(v){const r=cleanString(v).toUpperCase();return /^R[1-5]$/.test(r)?r:"R1"}
export function normalizeState(input={}){
  const now=new Date().toISOString(),player=input.player||{},drone=input.drone||{},alliance=input.alliance||{},vs=input.vs||{},season=input.season||{},sync=input.sync||{};
  const squads=Array.from({length:4},(_,i)=>{const q=input.squads?.[i]||{};return {id:i+1,name:cleanString(q.name||`Squad ${i+1}`,40),power:numberOrNull(q.power),updated_at:q.updated_at||null,heroes:Array.from({length:5},(_,j)=>{const h=q.heroes?.[j]||{};return {name:cleanString(h.name||`Hero ${j+1}`,50),level:numberOrNull(h.level),stars:numberOrNull(h.stars),power:numberOrNull(h.power),exclusive:cleanString(h.exclusive,30)||null,gear:cleanString(h.gear,120)||null}})}});
  return {version:"1.2.0",player_id:cleanString(input.player_id,120),updated_at:input.updated_at||now,
    player:{name:cleanString(player.name,80),server_id:cleanString(player.server_id,20),hq_level:numberOrNull(player.hq_level),power_m:numberOrNull(player.power_m),coordinates:player.coordinates??null,role:role(player.role)},
    drone:{level:numberOrNull(drone.level),power_m:numberOrNull(drone.power_m),updated_at:drone.updated_at||null},squads,
    alliance:{id:cleanString(alliance.id,120)||null,tag:cleanString(alliance.tag,16).toUpperCase(),name:cleanString(alliance.name,100),role:role(alliance.role),invite_code:cleanString(alliance.invite_code,32).toUpperCase(),members:Array.isArray(alliance.members)?alliance.members.slice(0,200).map(m=>({player_id:cleanString(m.player_id,120)||null,name:cleanString(m.name,80),hq_level:numberOrNull(m.hq_level),power_m:numberOrNull(m.power_m),role:role(m.role),delta_m:numberOrNull(m.delta_m),updated_at:m.updated_at||null})):[],updated_at:alliance.updated_at||null},
    vs:{week:numberOrNull(vs.week),day:numberOrNull(vs.day),our_alliance:cleanString(vs.our_alliance,16).toUpperCase(),opponent:cleanString(vs.opponent,60).toUpperCase(),our_score:vs.our_score??null,their_score:vs.their_score??null,updated_at:vs.updated_at||null},
    season:{name:cleanString(season.name,80),number:numberOrNull(season.number),day:numberOrNull(season.day),total_days:numberOrNull(season.total_days),profession:cleanString(season.profession,60),progress_pct:clamp(season.progress_pct||0,0,100),resistance:numberOrNull(season.resistance),updated_at:season.updated_at||null},
    sync:{provider:cleanString(sync.provider||"warboost-hybrid",80),status:cleanString(sync.status||"local",30),last_sync:sync.last_sync||null,last_error:cleanString(sync.last_error,300)||null,auto_ready:sync.auto_ready!==false,last_scan:sync.last_scan||null,public_last_sync:sync.public_last_sync||null,sources:{public:Boolean(sync.sources?.public),scan:Boolean(sync.sources?.scan||sync.last_scan),alliance:Boolean(sync.sources?.alliance)}}
  }
}
export function mergeNewest(current={},incoming={}){
  const cur=normalizeState(current),raw={...cur,...incoming,player:{...cur.player,...incoming.player},alliance:{...cur.alliance,...incoming.alliance},vs:{...cur.vs,...incoming.vs},season:{...cur.season,...incoming.season},sync:{...cur.sync,...incoming.sync,sources:{...cur.sync?.sources,...incoming.sync?.sources}}};
  const incomingDrone=incoming.drone;
  if(incomingDrone){const newer=!cur.drone.updated_at||!incomingDrone.updated_at||new Date(incomingDrone.updated_at)>=new Date(cur.drone.updated_at);raw.drone=newer?{...cur.drone,...incomingDrone}:cur.drone}else raw.drone=cur.drone;
  raw.squads=cur.squads.map((c,i)=>{const n=incoming.squads?.[i];if(!n)return c;const newer=!c.updated_at||!n.updated_at||new Date(n.updated_at)>=new Date(c.updated_at);if(!newer)return c;return {...c,...n,heroes:c.heroes.map((h,j)=>({...h,...(n.heroes?.[j]||{})}))}});
  return normalizeState(raw);
}
