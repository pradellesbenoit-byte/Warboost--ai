// Synthetic gameplay fixtures only. No captures, account data or network.
export const at="2026-10-15T08:43:37.000Z";
export const clone=value=>JSON.parse(JSON.stringify(value));
const fields=["level","stars","power","gear","exclusive","awakening"];
const names=[
  ["Murphy","Kimberly","Williams","Marshall","Stetmann"],
  ["DVA","Morrison","Carlie","Lucius","Schuyler"],
  ["Tesla","Adam","McGregor","Fiona","Swift"]
];
export function confirmedSquad(id=1){
  const composition=names[(id-1)%3];
  return {id,power:44.43,field_source:{power:"confirmed_scan"},field_updated_at:{power:at},
    composition_source:"explicit_confirmation",composition_confirmed_at:at,confirmed_composition:[...composition],
    heroes:composition.map(name=>({name,level:155,stars:5,power:6.5,exclusive:0,
      gear:"slot=0;count=1;level=0;rarity=orange|slot=1;count=1;level=40;rarity=orange|slot=2;count=1;level=40;rarity=orange|slot=3;count=1;level=40;rarity=orange",
      awakening:{active:false,level:0},
      field_source:Object.fromEntries(fields.map(field=>[field,"confirmed_scan"])),
      field_updated_at:Object.fromEntries(fields.map(field=>[field,at]))}))};
}
export function fixtureProfile(){
  return {player_id:"synthetic-owner",squads:[1,2,3].map(confirmedSquad),alliance:{role:"R5",members:[]},
    sync:{pending_cloud_save:true,last_error:"squad_freshness_ambiguous",
      save_receipt:{at,write_state:"confirmed"}}};
}
