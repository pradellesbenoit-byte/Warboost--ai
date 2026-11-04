import Tesseract from "tesseract.js";
import {TECHNOLOGY_NAMES} from "./technology-scan.js";

const {createWorker,OEM}=Tesseract;
const LANGUAGES=new Set(["eng","fra"]);
const MIN_CONFIDENCE=90;
const normalizeLabel=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const exactTechnologyNames=new Map(Object.entries(TECHNOLOGY_NAMES).flatMap(([key,names])=>names.map(name=>[normalizeLabel(name),{key,name}])));

function makeError(code){
  const error=new Error(code);
  error.code=code;
  return error;
}

export function isSameOriginAssetPath(value,origin){
  try{return new URL(String(value),String(origin)).origin===new URL(String(origin)).origin}catch{return false}
}

export function localOcrWorkerOptions({assetBase="/assets/local-ocr",langPath=null}={}){
  const base=String(assetBase||"/assets/local-ocr").replace(/\/+$/,"");
  const languages=langPath||`${base}/lang`;
  if(typeof process==="undefined"&&typeof location!=="undefined"&&
     (!isSameOriginAssetPath(`${base}/worker.min.js`,location.href)||!isSameOriginAssetPath(`${base}/core`,location.href)||!isSameOriginAssetPath(languages,location.href))){
    throw makeError("external_assets_forbidden");
  }
  return {
    workerPath:`${base}/worker.min.js`,
    corePath:`${base}/core`,
    langPath:languages,
    workerBlobURL:false,
    cacheMethod:"none",
    gzip:true,
    legacyCore:false,
    legacyLang:false
  };
}

function lineConfidence(line){
  const direct=Number(line?.confidence);
  if(Number.isFinite(direct))return Math.max(0,Math.min(100,direct));
  const values=(line?.words||[]).map(word=>Number(word?.confidence)).filter(Number.isFinite);
  return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
}

function rawLines(data){
  const fromLines=Array.isArray(data?.lines)?data.lines:[];
  const fromBlocks=Array.isArray(data?.blocks)?data.blocks.flatMap(block=>(block?.paragraphs||[]).flatMap(paragraph=>paragraph?.lines||[])):[];
  const source=fromLines.length?fromLines:fromBlocks;
  if(source.length)return source.map(line=>({
    text:String(line?.text||(line?.words||[]).map(word=>word?.text||"").join(" ")||"").trim(),
    confidence:lineConfidence(line)
  })).filter(line=>line.text);
  return String(data?.text||"").split(/\r?\n/).map(text=>({text:text.trim(),confidence:null})).filter(line=>line.text);
}

function powerCandidate(line){
  if(!Number.isFinite(line.confidence)||line.confidence<MIN_CONFIDENCE)return null;
  const match=line.text.match(/(?:total\s+power|power\s+total|squad\s+power|formation\s+power|puissance\s+totale|puissance\s+(?:de\s+)?l['’]?escouade|force\s+totale)\s*[:：–—-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(m|million(?:s)?)\b/i);
  if(!match)return null;
  const value=Number(match[1].replace(",","."));
  if(!Number.isFinite(value)||value<0)return null;
  return {field:"squad_power_m",value,unit:"M",evidence:line.text,confidence:line.confidence};
}

function technologyCandidate(line){
  if(!Number.isFinite(line.confidence)||line.confidence<MIN_CONFIDENCE)return null;
  const valueMatch=line.text.match(/(\d{1,3}(?:[.,]\d{1,2})?\s*%|niveau\s+max|level\s+max|max\s+level|locked|verrouillée?|verrouillee?)\s*$/i);
  if(!valueMatch)return null;
  const label=normalizeLabel(line.text.slice(0,valueMatch.index).replace(/[\s:：–—-]+$/,""));
  const exact=exactTechnologyNames.get(label);
  if(!exact)return null;
  const visible=valueMatch[1].trim();
  const percent=visible.match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*%$/);
  if(percent){
    const value=Number(percent[1].replace(",","."));
    if(!Number.isFinite(value)||value<0||value>100)return null;
    return {field:"technology",key:exact.key,name:exact.name,state:"percent",value,evidence:line.text,confidence:line.confidence};
  }
  const normalized=normalizeLabel(visible);
  const state=["niveau max","level max","max level"].includes(normalized)?"max":"locked";
  return {field:"technology",key:exact.key,name:exact.name,state,evidence:line.text,confidence:line.confidence};
}

export function parseLocalScanOcrData(data,scanType){
  const lines=rawLines(data);
  const candidates=[];
  if(/^squad[1-4]$/.test(String(scanType||""))){
    const powers=lines.map(powerCandidate).filter(Boolean);
    if(powers.length===1)candidates.push(powers[0]);
  }else if(scanType==="technology"){
    const found=lines.map(technologyCandidate).filter(Boolean);
    const byKey=new Map(),ambiguous=new Set();
    for(const candidate of found){
      if(ambiguous.has(candidate.key))continue;
      const previous=byKey.get(candidate.key);
      if(!previous)byKey.set(candidate.key,candidate);
      else if(previous.state!==candidate.state||previous.value!==candidate.value){byKey.delete(candidate.key);ambiguous.add(candidate.key)}
    }
    for(const candidate of byKey.values())candidates.push(candidate);
  }
  return {
    text:lines.map(line=>line.text).join("\n"),
    lines,
    candidates
  };
}

export async function runLocalScanOcrBatch(images,{language="eng",scanType="squad1",assetBase="/assets/local-ocr",langPath=null,signal,onProgress=()=>{},timeoutMs=120000,workerFactory=createWorker}={}){
  const inputs=Array.from(images||[]);
  if(!LANGUAGES.has(language))throw makeError("unsupported_language");
  if(!["technology","squad1","squad2","squad3","squad4"].includes(scanType))throw makeError("unsupported_scan_type");
  if(!inputs.length||inputs.length>4||inputs.some(image=>!image))throw makeError("invalid_images");
  if(typeof WebAssembly==="undefined")throw makeError("wasm_unavailable");
  const isNode=typeof process!=="undefined"&&Boolean(process.versions?.node);
  if(!isNode&&typeof Worker!=="function")throw makeError("worker_unavailable");
  if(signal?.aborted)throw makeError("cancelled");

  const workerOptions={
    ...localOcrWorkerOptions({assetBase,langPath}),
    logger:message=>{
      try{
        const progress=Number(message?.progress);
        onProgress({status:String(message?.status||""),progress:Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):null});
      }catch{}
    },
    errorHandler:()=>{}
  };
  let worker=null,cancelled=false,interruptReject=null,termination=null;
  const interruption=new Promise((_,reject)=>{interruptReject=reject});
  const terminate=()=>{
    if(!worker)return Promise.resolve();
    if(!termination)termination=Promise.resolve(worker.terminate()).catch(()=>{});
    return termination;
  };
  const interrupt=code=>{
    if(cancelled)return;
    cancelled=true;
    interruptReject?.(makeError(code));
    void terminate();
  };
  const onAbort=()=>interrupt("cancelled");
  signal?.addEventListener("abort",onAbort,{once:true});
  const timeout=setTimeout(()=>interrupt("timeout"),Math.max(1000,Number(timeoutMs)||120000));
  if(typeof workerFactory!=="function")throw makeError("worker_unavailable");
  const workerPromise=Promise.resolve().then(()=>workerFactory(language,OEM.LSTM_ONLY,workerOptions)).then(async created=>{
    worker=created;
    if(cancelled){await terminate();throw makeError("cancelled")}
    return created;
  });
  try{
    worker=await Promise.race([workerPromise,interruption]);
    const results=[];
    for(let index=0;index<inputs.length;index++){
      if(signal?.aborted)throw makeError("cancelled");
      const {data}=await Promise.race([worker.recognize(inputs[index],{}, {text:true,blocks:true}),interruption]);
      results.push(parseLocalScanOcrData(data,scanType));
      try{onProgress({status:"recognizing text",progress:(index+1)/inputs.length,index:index+1,total:inputs.length})}catch{}
    }
    return results;
  }catch(error){
    if(error?.code)throw error;
    throw makeError("ocr_failed");
  }finally{
    clearTimeout(timeout);
    signal?.removeEventListener("abort",onAbort);
    cancelled=true;
    await terminate();
  }
}
