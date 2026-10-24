const DEFAULT_WINDOW_MS=60_000;
const DEFAULT_MAX_BURST=12;
const DEFAULT_MAX_CONCURRENT=3;
const DEFAULT_MAX_USERS=2_048;
const DEFAULT_REQUEST_TIMEOUT_MS=46_000;

export function createScanAbuseGuard({
  windowMs=DEFAULT_WINDOW_MS,
  maxBurst=DEFAULT_MAX_BURST,
  maxConcurrent=DEFAULT_MAX_CONCURRENT,
  maxUsers=DEFAULT_MAX_USERS,
  requestTimeoutMs=DEFAULT_REQUEST_TIMEOUT_MS
}={}){
  const users=new Map();
  const limits={windowMs,maxBurst,maxConcurrent,maxUsers,requestTimeoutMs};

  function removeExpired(now){
    for(const [id,record] of users){
      record.events=record.events.filter(at=>now-at<limits.windowMs);
      if(!record.active&&record.events.length===0)users.delete(id);
    }
  }

  function acquire(userId,now=Date.now()){
    const id=String(userId||"").trim();
    if(!id)return {allowed:false,retryAfterSeconds:1,release(){}};
    removeExpired(now);
    let record=users.get(id);
    if(!record){
      if(users.size>=limits.maxUsers)return {allowed:false,retryAfterSeconds:60,release(){}};
      record={events:[],activeStarts:[],active:0};
      users.set(id,record);
    }
    if(record.active>=limits.maxConcurrent){
      const oldest=record.activeStarts.length?Math.min(...record.activeStarts):now;
      return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((oldest+limits.requestTimeoutMs-now)/1000)),release(){}};
    }
    if(record.events.length>=limits.maxBurst){
      return {allowed:false,retryAfterSeconds:Math.max(1,Math.ceil((record.events[0]+limits.windowMs-now)/1000)),release(){}};
    }
    record.events.push(now);
    record.active++;
    record.activeStarts.push(now);
    let released=false;
    return {
      allowed:true,
      retryAfterSeconds:0,
      release(){
        if(released)return;
        released=true;
        record.active=Math.max(0,record.active-1);
        const index=record.activeStarts.indexOf(now);
        if(index>=0)record.activeStarts.splice(index,1);
      }
    };
  }

  return {acquire};
}

// This is deliberately process-local: it is a bounded beta safeguard, not a
// durable quota and does not coordinate across serverless instances.
export const scanAbuseGuard=createScanAbuseGuard();