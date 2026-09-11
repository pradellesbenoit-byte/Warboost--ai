function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null}
function s(v,max=120){const x=String(v??'').trim();return x?x.slice(0,max):null}
export function scoreKnown(v={}){const us=n(v.our_score),them=n(v.their_score);if(us===null||them===null)return false;return v.score_confirmed===true||(us+them)>0}
export function normalizeVsSnapshot(raw={}){
  const out={};
  for(const k of ['week','day','our_score','their_score','our_percent','their_percent','personal_rank','personal_score','time_remaining_seconds']){const x=n(raw?.[k]);if(x!==null)out[k]=x}
  for(const k of ['theme','our_alliance','opponent','our_tag','opponent_tag','our_server_id','opponent_server_id','personal_name','time_remaining_text','updated_at']){const x=s(raw?.[k],k==='theme'?160:100);if(x)out[k]=x}
  if(raw?.score_confirmed===true)out.score_confirmed=true;
  if(Array.isArray(raw?.leaderboard))out.leaderboard=raw.leaderboard.slice(0,10).map(row=>{
    const r={};const rank=n(row?.rank),score=n(row?.score),name=s(row?.player_name||row?.name,80),tag=s(row?.alliance_tag,24);
    if(rank!==null)r.rank=rank;if(score!==null)r.score=score;if(name)r.player_name=name;if(tag)r.alliance_tag=tag;return r;
  }).filter(r=>r.rank!==undefined||r.player_name||r.score!==undefined);
  return out;
}
function snapKey(x){return [x.updated_at||'',x.week??'',x.day??'',x.our_score??'',x.their_score??''].join('|')}
export function mergeVsState(base={},incoming={}){
  const b=base&&typeof base==='object'?base:{},i=normalizeVsSnapshot(incoming||{}),merged={...b,...i};
  const history=[];const seen=new Set();
  const add=x=>{const z=normalizeVsSnapshot(x);if(!z.updated_at||!scoreKnown(z))return;const key=snapKey(z);if(seen.has(key))return;seen.add(key);history.push(z)};
  for(const x of Array.isArray(b.snapshots)?b.snapshots:[])add(x);
  if(incoming?.source==='scan'&&i.updated_at&&scoreKnown(i))add(i);
  for(const x of Array.isArray(incoming?.snapshots)?incoming.snapshots:[])add(x);
  history.sort((a,c)=>(Date.parse(c.updated_at)||0)-(Date.parse(a.updated_at)||0));
  merged.snapshots=history.slice(0,24);
  if(incoming?.source==='scan')merged.source='scan';
  return merged;
}
export function vsSituation(v={}){
  const us=n(v.our_score),them=n(v.their_score),known=scoreKnown(v);
  if(!known)return {known:false,status:'unknown',gap:null,our_share:null,their_share:null,ratio:null};
  const total=us+them,gap=us-them,ratio=them>0?us/them:(us>0?Infinity:1),our_share=total>0?us/total*100:null,their_share=total>0?them/total*100:null;
  let status='even';
  if(gap>0){status=(ratio>=1.5||(our_share!==null&&our_share>=60))?'strong_lead':(ratio>=1.2||(our_share!==null&&our_share>=55))?'lead':'narrow_lead'}
  else if(gap<0){const oppRatio=us>0?them/us:Infinity;status=(oppRatio>=1.5||(their_share!==null&&their_share>=60))?'strong_trail':(oppRatio>=1.2||(their_share!==null&&their_share>=55))?'trail':'narrow_trail'}
  return {known:true,status,gap,our_share,their_share,ratio,our_score:us,their_score:them};
}
export function vsTrend(v={}){
  const rows=(Array.isArray(v.snapshots)?v.snapshots:[]).filter(scoreKnown).slice().sort((a,b)=>(Date.parse(b.updated_at)||0)-(Date.parse(a.updated_at)||0));
  if(rows.length<2)return null;
  const last=rows[0],prev=rows.find(x=>x.week===last.week&&x.day===last.day&&x.updated_at!==last.updated_at);if(!prev)return null;
  const dt=((Date.parse(last.updated_at)||0)-(Date.parse(prev.updated_at)||0))/1000;if(!(dt>0))return null;
  const our_gain=Math.max(0,(n(last.our_score)||0)-(n(prev.our_score)||0)),their_gain=Math.max(0,(n(last.their_score)||0)-(n(prev.their_score)||0));
  return {elapsed_seconds:dt,our_gain,their_gain,our_per_hour:our_gain*3600/dt,their_per_hour:their_gain*3600/dt,momentum:our_gain>their_gain?'ours':their_gain>our_gain?'theirs':'even',from:prev.updated_at,to:last.updated_at};
}
export function personalVsPosition(v={}){
  const rank=n(v.personal_rank),score=n(v.personal_score),rows=Array.isArray(v.leaderboard)?v.leaderboard:[];
  let gap_to_next=null,next=null;
  if(rank!==null&&score!==null&&rank>1){next=rows.find(r=>n(r.rank)===rank-1)||null;const ns=n(next?.score);if(ns!==null&&ns>=score)gap_to_next=ns-score}
  return {rank,score,gap_to_next,next_player:next?.player_name||null};
}

const DECISION_BASE={
  strong_lead:{decision:'save',urgency:'low',rescan_minutes:45},
  lead:{decision:'save',urgency:'low',rescan_minutes:30},
  narrow_lead:{decision:'monitor',urgency:'medium',rescan_minutes:20},
  even:{decision:'monitor',urgency:'high',rescan_minutes:15},
  narrow_trail:{decision:'push',urgency:'high',rescan_minutes:15},
  trail:{decision:'push',urgency:'high',rescan_minutes:10},
  strong_trail:{decision:'push_hard',urgency:'critical',rescan_minutes:10},
  unknown:{decision:'scan',urgency:'unknown',rescan_minutes:0}
};
const URGENCY_WEIGHT={unknown:0,low:1,medium:2,high:3,critical:4};
function maxUrgency(a,b){return (URGENCY_WEIGHT[b]||0)>(URGENCY_WEIGHT[a]||0)?b:a}
function finitePositive(v){const x=n(v);return x!==null&&x>0?x:null}

/**
 * Decision-only VS model. It never infers rewards, inactive players or a final result.
 * ETA is a simple projection from the two latest scans and is explicitly conditional
 * on the observed scoring pace remaining unchanged.
 */
export function vsDecisionEngine(v={}){
  const sit=vsSituation(v),trend=vsTrend(v),remain=finitePositive(v.time_remaining_seconds);
  const base=DECISION_BASE[sit.status]||DECISION_BASE.unknown;
  const out={
    known:sit.known,
    situation:sit.status,
    decision:base.decision,
    urgency:base.urgency,
    rescan_minutes:base.rescan_minutes,
    risk:'no_trend',
    trend,
    eta_seconds:null,
    eta_kind:null,
    time_remaining_seconds:remain,
    gap:sit.gap,
    our_share:sit.our_share,
    their_share:sit.their_share
  };
  if(!sit.known){out.risk='score_unknown';return out}

  if(trend){
    const ours=finitePositive(trend.our_per_hour)||0,theirs=finitePositive(trend.their_per_hour)||0;
    const opponentNet=theirs-ours,ourNet=ours-theirs;
    out.risk='pace_stable';
    if(sit.gap>0&&opponentNet>0){
      const eta=sit.gap/opponentNet*3600;
      if(Number.isFinite(eta)&&eta>0){
        out.eta_seconds=eta;out.eta_kind='opponent_catchup';
        if(remain&&eta<=remain){
          out.risk='opponent_catchup_before_end';
          out.decision=eta<=7200?'protect':'monitor';
          out.urgency=maxUrgency(out.urgency,eta<=7200?'critical':'high');
          out.rescan_minutes=eta<=7200?10:15;
        }else{
          out.risk='opponent_catchup_after_end';
          if(trend.momentum==='theirs'&&out.decision==='save')out.rescan_minutes=Math.min(out.rescan_minutes,30);
        }
      }
    }else if(sit.gap<0&&ourNet>0){
      const eta=Math.abs(sit.gap)/ourNet*3600;
      if(Number.isFinite(eta)&&eta>0){
        out.eta_seconds=eta;out.eta_kind='our_catchup';
        if(remain&&eta<=remain){out.risk='our_catchup_possible';out.decision='push';out.urgency=maxUrgency(out.urgency,'high');out.rescan_minutes=Math.min(out.rescan_minutes||15,15)}
        else{out.risk='our_catchup_after_end';out.decision='push_hard';out.urgency='critical';out.rescan_minutes=10}
      }
    }else if(sit.gap<=0&&trend.momentum==='theirs'){
      out.risk='opponent_extending';out.urgency=maxUrgency(out.urgency,'high');
    }else if(sit.gap>0&&trend.momentum==='ours')out.risk='lead_growing';
  }

  if(remain!==null&&remain<=7200){
    if(['trail','strong_trail','even','narrow_trail','narrow_lead'].includes(sit.status))out.urgency=maxUrgency(out.urgency,'high');
    if(remain<=3600&&sit.gap<0){out.urgency='critical';out.decision='push_hard';out.rescan_minutes=5}
    else if(out.rescan_minutes>0)out.rescan_minutes=Math.min(out.rescan_minutes,15);
  }
  return out;
}
