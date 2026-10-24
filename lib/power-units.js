const RAW_POWER_THRESHOLD=100_000;

function parsedNumber(value){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  const text=String(value).trim().replace(/\s+/g,"").replace(",",".");
  const match=text.match(/^([+-]?\d+(?:\.\d+)?)\s*(m)?$/i);
  if(!match)return null;
  const number=Number(match[1]);
  return Number.isFinite(number)?number:null;
}

/**
 * WarBoost stores account, drone and squad power in millions.
 * Vision providers and legacy states can instead contain raw units (34290000).
 */
export function canonicalPowerMillions(value){
  const number=parsedNumber(value);
  if(number===null)return null;
  const millions=Math.abs(number)>=RAW_POWER_THRESHOLD?number/1_000_000:number;
  return Math.round(millions*1_000_000)/1_000_000;
}
