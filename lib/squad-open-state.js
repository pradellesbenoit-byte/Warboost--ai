const SELECTOR="details.squad[data-squad-id]";
const VALID_IDS=new Set(["1","2","3","4"]);

export function captureOpenSquadIds(container){
  const rows=container?.querySelectorAll?.(SELECTOR)||[];
  return new Set([...rows]
    .filter(row=>row?.open===true)
    .map(row=>String(row?.dataset?.squadId||""))
    .filter(id=>VALID_IDS.has(id)));
}

export function restoreOpenSquadIds(container,openIds=new Set()){
  const preserved=openIds instanceof Set?openIds:new Set();
  const rows=container?.querySelectorAll?.(SELECTOR)||[];
  for(const row of rows){
    const id=String(row?.dataset?.squadId||"");
    if(VALID_IDS.has(id))row.open=preserved.has(id);
  }
}
