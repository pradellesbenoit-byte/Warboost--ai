export function unlockDesertStormSearchInput(input){
  if(!input)return input;
  const editableState=input.getAttribute?.("contenteditable");
  if(editableState==="false")return input;
  if(input.isContentEditable||editableState){
    return input;
  }
  input.removeAttribute?.("readonly");
  input.readOnly=false;
  return input;
}