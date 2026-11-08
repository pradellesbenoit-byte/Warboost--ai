
// Contrôle technique uniquement. Ne remplace pas la validation fiscale du commerçant.
// Pur / sans réseau / ne traite aucune donnée client.
const taxCodeValid=code=>typeof code==="string"&&/^txcd_[A-Za-z0-9]+$/.test(code);

/**
 * Stripe Checkout LIVE uses automatic_tax[enabled]=true and a 4.99 EUR price
 * with inclusive tax_behavior. Fail closed until Stripe Tax has been configured.
 * An active tax setup DOES NOT by itself establish legal tax compliance.
 */
export function inspectLiveStripeTaxSettings(settings,product,{expectedCountry="FR"}={}){
  if(settings?.object!=="tax.settings"||settings?.livemode!==true)
    return {ready:false,reason:"TAX_SETTINGS_WRONG_MODE"};
  if(settings.status!=="active")
    return {ready:false,reason:"TAX_SETTINGS_NOT_ACTIVE"};
  if(settings.head_office?.address?.country!==expectedCountry)
    return {ready:false,reason:"TAX_HEAD_OFFICE_UNVERIFIED"};
  if(!taxCodeValid(product?.tax_code))
    return {ready:false,reason:"PRODUCT_TAX_CODE_MISSING"};
  return {ready:true,reason:"READY_FOR_SEPARATE_LEGAL_REVIEW"};
}
