
// Contrôle technique uniquement. Ne remplace pas la validation fiscale du commerçant.
// Pur / sans réseau / ne traite aucune donnée client.
const taxCodeValid=code=>typeof code==="string"&&/^txcd_[A-Za-z0-9]+$/.test(code);
const countryCode=value=>String(value||"").trim().toUpperCase();

// Sales countries are an explicit operator allowlist. Empty or malformed
// configuration denies every country; a browser declaration never grants PRO.
export function parseLiveApprovedBillingCountries(value){
  const raw=String(value||"").trim();
  if(!raw)return [];
  const entries=raw.split(/[,\s]+/).filter(Boolean).map(countryCode);
  if(entries.some(code=>!/^[A-Z]{2}$/.test(code)))return [];
  return [...new Set(entries)].sort();
}

export function validateLiveDeclaredBillingCountry(country,approvedCountries=[]){
  const declared=countryCode(country);
  if(!/^[A-Z]{2}$/.test(declared))return {allowed:false,reason:"BILLING_COUNTRY_REQUIRED"};
  const approved=new Set((Array.isArray(approvedCountries)?approvedCountries:[]).map(countryCode));
  if(!approved.has(declared))return {allowed:false,reason:"BILLING_COUNTRY_NOT_APPROVED"};
  return {allowed:true,reason:"BILLING_COUNTRY_PRECHECK_ONLY",country:declared};
}

export function evaluateLiveBillingCountry({
  declaredCountry,authoritativeCountry,subscriptionCountryHint,approvedCountries=[],requireSubscriptionHint=false
}={}){
  const declared=countryCode(declaredCountry),actual=countryCode(authoritativeCountry),hint=countryCode(subscriptionCountryHint);
  const declaredCheck=validateLiveDeclaredBillingCountry(declared,approvedCountries);
  if(!declaredCheck.allowed)return declaredCheck;
  const approved=new Set((Array.isArray(approvedCountries)?approvedCountries:[]).map(countryCode));
  if(requireSubscriptionHint&&!/^[A-Z]{2}$/.test(hint))return {allowed:false,reason:"BILLING_COUNTRY_HINT_MISSING"};
  if(requireSubscriptionHint&&hint!==declared)return {allowed:false,reason:"BILLING_COUNTRY_HINT_MISMATCH"};
  if(!/^[A-Z]{2}$/.test(actual))return {allowed:false,reason:"STRIPE_BILLING_COUNTRY_UNKNOWN"};
  if(!approved.has(actual))return {allowed:false,reason:"STRIPE_BILLING_COUNTRY_NOT_APPROVED"};
  if(actual!==declared)return {allowed:false,reason:"BILLING_COUNTRY_MISMATCH"};
  if(requireSubscriptionHint&&hint!==actual)return {allowed:false,reason:"BILLING_COUNTRY_MISMATCH"};
  return {allowed:true,reason:"BILLING_COUNTRY_APPROVED",country:actual};
}

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
