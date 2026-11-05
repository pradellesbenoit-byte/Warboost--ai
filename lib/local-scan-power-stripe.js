const HEADER_SAMPLE_X=[0.08,0.15,0.22,0.29,0.36,0.43,0.50,0.57,0.64,0.71,0.78,0.85,0.92];
const MAX_INPUT_PIXELS=12_000_000;
const MAX_OUTPUT_PIXELS=1_300_000;

function validImagePixels(rgba,width,height){
  return Number.isInteger(width)&&Number.isInteger(height)&&width>=320&&height>=640&&
    width*height<=MAX_INPUT_PIXELS&&rgba&&typeof rgba.length==="number"&&rgba.length>=width*height*4;
}

function isHeaderPixel(rgba,index){
  const r=rgba[index],g=rgba[index+1],b=rgba[index+2];
  return r>=60&&r<=175&&g>=r&&g-r<=25&&b-g>=8&&b-g<=45;
}

function rowHeaderMatch(rgba,width,y){
  const reds=[];
  for(const relativeX of HEADER_SAMPLE_X){
    const x=Math.min(width-1,Math.max(0,Math.round(relativeX*(width-1))));
    const index=(y*width+x)*4;
    if(isHeaderPixel(rgba,index))reds.push(rgba[index]);
  }
  if(reds.length<Math.ceil(HEADER_SAMPLE_X.length*0.8))return false;
  const mean=reds.reduce((sum,value)=>sum+value,0)/reds.length;
  const variance=reds.reduce((sum,value)=>sum+(value-mean)**2,0)/reds.length;
  return variance<144;
}

export function findFormationDialogTop(rgba,width,height){
  if(!validImagePixels(rgba,width,height))return null;
  const firstY=Math.ceil(height*0.075),lastY=Math.floor(height*0.42);
  let groupStart=-1,previousY=-1,groupRows=0;
  for(let y=firstY;y<=lastY;y++){
    if(!rowHeaderMatch(rgba,width,y)){
      if(groupRows>=6)return groupStart;
      groupStart=-1;previousY=-1;groupRows=0;
      continue;
    }
    if(groupStart<0||y-previousY>2){
      if(groupRows>=6)return groupStart;
      groupStart=y;groupRows=1;
    }else{
      groupRows++;
    }
    previousY=y;
  }
  return groupRows>=6?groupStart:null;
}

export function makeFormationPowerStripe(rgba,width,height){
  const headerTop=findFormationDialogTop(rgba,width,height);
  if(headerTop===null)return null;
  const left=Math.floor(width*0.44),right=Math.ceil(width*0.72);
  const top=Math.floor(headerTop+width*0.28),bottom=Math.ceil(headerTop+width*0.38);
  if(top<0||bottom<=top||bottom>=height*0.65)return null;
  const stripeWidth=right-left,stripeHeight=bottom-top,sourcePixels=stripeWidth*stripeHeight;
  if(stripeWidth<1||stripeHeight<1||sourcePixels>MAX_OUTPUT_PIXELS)return null;

  let yellowCount=0,minX=stripeWidth,minY=stripeHeight,maxX=-1,maxY=-1;
  for(let y=0;y<stripeHeight;y++){
    const sourceY=top+y;
    for(let x=0;x<stripeWidth;x++){
      const index=(sourceY*width+left+x)*4;
      const r=rgba[index],g=rgba[index+1],b=rgba[index+2];
      if(r>170&&g>115&&b<145&&r>g+15&&g>b+25){
        yellowCount++;minX=Math.min(minX,x);minY=Math.min(minY,y);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
    }
  }
  const density=yellowCount/sourcePixels;
  const boxWidth=maxX-minX+1,boxHeight=maxY-minY+1;
  if(yellowCount<65||density>0.4||
     boxWidth<Math.max(20,stripeWidth*0.15)||boxHeight<Math.max(8,stripeHeight*0.12))return null;

  let scale=3;
  while(scale>1&&sourcePixels*scale*scale>MAX_OUTPUT_PIXELS)scale--;
  const outputWidth=stripeWidth*scale,outputHeight=stripeHeight*scale;
  if(outputWidth*outputHeight>MAX_OUTPUT_PIXELS)return null;
  const pixels=new Uint8ClampedArray(outputWidth*outputHeight*4);
  for(let y=0;y<outputHeight;y++){
    const sourceY=top+Math.floor(y/scale);
    for(let x=0;x<outputWidth;x++){
      const sourceX=left+Math.floor(x/scale);
      const sourceIndex=(sourceY*width+sourceX)*4;
      const r=rgba[sourceIndex],g=rgba[sourceIndex+1],b=rgba[sourceIndex+2];
      const yellow=r>170&&g>115&&b<145&&r>g+15&&g>b+25;
      const value=yellow?0:255,index=(y*outputWidth+x)*4;
      pixels[index]=value;pixels[index+1]=value;pixels[index+2]=value;pixels[index+3]=255;
    }
  }
  return {
    pixels,width:outputWidth,height:outputHeight,
    sourceRect:{x:left,y:top,width:stripeWidth,height:stripeHeight},
    yellowCount,density,bbox:{x:minX,y:minY,width:boxWidth,height:boxHeight}
  };
}

export function parsePowerStripeText(text,confidence){
  const evidence=String(text??"").trim();
  const score=Number(confidence);
  if(!Number.isFinite(score)||score<75)return null;
  const match=evidence.match(/^(\d{1,3})[.,](\d{1,2})M$/i);
  if(!match)return null;
  const value=Number(`${match[1]}.${match[2]}`);
  if(!Number.isFinite(value)||value<=0||value>999)return null;
  return {
    field:"squad_power_m",value,unit:"M",evidence,confidence:score,
    source:"local_yellow_power_stripe",confirmed:false
  };
}

function cancelledError(){
  const error=new Error("cancelled");error.code="cancelled";return error;
}

function loadLocalImage(imageUrl,signal){
  if(signal?.aborted)return Promise.reject(cancelledError());
  if(typeof imageUrl!=="string"||!/^data:image\/(?:png|jpeg|webp);base64,/i.test(imageUrl))return Promise.resolve(null);
  if(typeof Image!=="function"||typeof document==="undefined")return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const image=new Image();
    let settled=false;
    const cleanup=()=>{
      image.onload=null;image.onerror=null;
      signal?.removeEventListener("abort",onAbort);
    };
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;cleanup();callback(value);
    };
    const onAbort=()=>finish(reject,cancelledError());
    image.onload=()=>finish(resolve,image);
    image.onerror=()=>finish(resolve,null);
    signal?.addEventListener("abort",onAbort,{once:true});
    if(signal?.aborted){onAbort();return}
    image.src=imageUrl;
  });
}

export async function makeFormationPowerDataUrl(imageUrl,{signal}={}){
  if(signal?.aborted)throw cancelledError();
  try{
    const image=await loadLocalImage(imageUrl,signal);
    if(!image)return null;
    if(signal?.aborted)throw cancelledError();
    const width=Number(image.naturalWidth),height=Number(image.naturalHeight);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width*height>MAX_INPUT_PIXELS)return null;
    const sourceCanvas=document.createElement("canvas");
    sourceCanvas.width=width;sourceCanvas.height=height;
    const sourceContext=sourceCanvas.getContext("2d",{willReadFrequently:true});
    if(!sourceContext)return null;
    sourceContext.drawImage(image,0,0);
    const rgba=sourceContext.getImageData(0,0,width,height).data;
    if(signal?.aborted)throw cancelledError();
    const stripe=makeFormationPowerStripe(rgba,width,height);
    if(!stripe)return null;
    const outputCanvas=document.createElement("canvas");
    outputCanvas.width=stripe.width;outputCanvas.height=stripe.height;
    const outputContext=outputCanvas.getContext("2d");
    if(!outputContext)return null;
    const imageData=outputContext.createImageData(stripe.width,stripe.height);
    imageData.data.set(stripe.pixels);outputContext.putImageData(imageData,0,0);
    if(signal?.aborted)throw cancelledError();
    return outputCanvas.toDataURL("image/png");
  }catch(error){
    if(error?.code==="cancelled"||signal?.aborted)throw cancelledError();
    return null;
  }
}
