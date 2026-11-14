const SAFE_PREVIEW_CONFIG_CODES=new Set([
  "PREVIEW_SUPABASE_URL_NOT_TEST",
  "PREVIEW_SUPABASE_URL_ALIAS_MISMATCH",
  "PREVIEW_SUPABASE_PUBLIC_KEY_NOT_TEST",
  "PREVIEW_SUPABASE_SERVICE_KEY_NOT_TEST",
  "PREVIEW_SUPABASE_ISOLATION_FAILED"
]);

/**
 * Return only a known, non-sensitive guard code from the isolated Preview API.
 * Ignore arbitrary response fields, messages, and non-503 responses.
 */
export function safePreviewCloudConfigDiagnostic(status,payload){
  if(status!==503||payload?.preview_diagnostic!==true)return "";
  const code=String(payload?.error||"");
  return SAFE_PREVIEW_CONFIG_CODES.has(code)?code:"";
}
