export function invalidatePendingAccountCacheState(value,{nestedState=false}={}){
  const state=nestedState?value?.state:value;
  if(!state||typeof state!=="object"||!state.alliance||typeof state.alliance!=="object")return {value,changed:false};
  const pending=state.alliance.unlinked_accounts;
  if(!Array.isArray(pending)||pending.length===0)return {value,changed:false};
  const nextState={...state,alliance:{...state.alliance,unlinked_accounts:[]}};
  return {value:nestedState?{...value,state:nextState}:nextState,changed:true};
}