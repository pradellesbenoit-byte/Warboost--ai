export function unlockDesertStormSearchInput(input){
  if(!input)return input;
  input.removeAttribute?.("readonly");
  input.readOnly=false;
  return input;
}