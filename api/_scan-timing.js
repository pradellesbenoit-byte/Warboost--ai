// Leave ten seconds for upload/transport around the frontend's 90-second scan.
export const SCAN_SERVER_BUDGET_MS=80000;
const OPTIONAL_MIN_MS=8000,RETURN_RESERVE_MS=2000,OPTIONAL_MAX_MS=46000;
const STAGES=new Set(["access","profile_context","references","vision_primary","vision_fallback","portrait_optional","total"]);

export function createScanTiming({startedAt=Date.now(),now=Date.now,log=entry=>console.info("WarBoost scan timing",entry)}={}){
  const elapsed=()=>Math.max(0,now()-startedAt);
  function record(stage,durationMs,status){
    if(!STAGES.has(stage))return;
    // Fixed metadata only: no user IDs, filenames, OCR, images, or error messages.
    log({stage,duration_ms:Math.max(0,durationMs),elapsed_ms:elapsed(),status});
  }
  async function measure(stage,work){
    const start=now();
    try{const value=await work();record(stage,now()-start,"ok");return value}
    catch(error){record(stage,now()-start,"error");throw error}
  }
  async function optionalPortrait(work,fallback){
    const remaining=SCAN_SERVER_BUDGET_MS-elapsed()-RETURN_RESERVE_MS;
    if(remaining<OPTIONAL_MIN_MS){record("portrait_optional",0,"skipped_budget");return fallback}
    const start=now(),controller=new AbortController();
    let timer;
    try{
      const deadline=new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          controller.abort();
          reject(Object.assign(new Error("Optional portrait budget exhausted"),{code:"PORTRAIT_BUDGET_TIMEOUT"}));
        },Math.min(remaining,OPTIONAL_MAX_MS));
      });
      const value=await Promise.race([Promise.resolve().then(()=>work(controller.signal)),deadline]);
      record("portrait_optional",now()-start,"ok");return value;
    }catch(error){
      record("portrait_optional",now()-start,controller.signal.aborted||error?.code==="PORTRAIT_BUDGET_TIMEOUT"?"timeout":"error");
      return fallback;
    }finally{clearTimeout(timer)}
  }
  return {measure,optionalPortrait,finish:()=>record("total",elapsed(),"complete")};
}
