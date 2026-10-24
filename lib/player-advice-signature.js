function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(!value||typeof value!=="object")return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}

export function playerAdviceInputSignature(state={}){
  if(!state||typeof state!=="object")return "";
  const {updated_at,version,sync,migration,...inputs}=state;
  return JSON.stringify(stable(inputs));
}