// API/UI release gate only. Direct owner RPC has its own autonomous SQL policy
// and an independent disabled-by-default SQL gate; API tickets are not SQL auth.
// SQL being present in Git is NOT activation approval.
export const GEAR_REPAIR_RELEASE_APPROVED=false;
export const GEAR_REPAIR_CONTRACT="gear-field-v1";
export const gearRepairReadiness=()=>({contract:GEAR_REPAIR_CONTRACT,backend_prepared:true,
  release_approved:false,migration:"not_checked",writes_enabled:false});
