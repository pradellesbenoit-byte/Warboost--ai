export const GAME_RESET_BRANCH = "warboost-preview-isolation-20261110";
export const GAME_RESET_TEST_PROJECT = "zaioadmbhqzeihkvdjsd";

const CORE_GAME_TABLES = Object.freeze([
  {table:"public.wb1_profiles",impact:"Supprime les profils et états de jeu enregistrés; les comptes Supabase Auth restent."},
  {table:"public.wb1_snapshots",impact:"Supprime les historiques de sauvegarde et instantanés de jeu."}
]);

const ALLIANCE_TABLES = Object.freeze([
  {table:"public.wb1_alliance_members",impact:"Supprime les liens d’alliance et rôles R1–R5; ils devront être réattribués."},
  {table:"public.wb1_alliances",impact:"Supprime alliances, rosters canoniques, codes d’invitation et état d’événements qui y est stocké."}
]);

const PRESERVED_TABLES = Object.freeze([
  "auth.users",
  "auth.identities",
  "public.wb1_beta_invites",
  "public.wb1_beta_signup_policy",
  "public.wb1_support_messages",
  "public.wb1_support_tickets",
  "public.warboost_billing_accounts",
  "public.warboost_billing_events",
  "public.warboost_billing_policy",
  "public.warboost_checkout_attempts",
  "public.warboost_live_billing_accounts",
  "public.warboost_live_billing_consents",
  "public.warboost_live_billing_events",
  "public.warboost_live_checkout_attempts",
  "public.warboost_live_subscriptions",
  "public.warboost_pro_grants",
  "public.warboost_subscriptions"
]);

export function buildGameDataResetPreview({environment,branch,projectRef}={}) {
  if(environment!=="test"||branch!==GAME_RESET_BRANCH||projectRef!==GAME_RESET_TEST_PROJECT) {
    throw Object.assign(new Error("Game-data reset preview is restricted to the isolated WarBoost Test branch and project."),{
      code:"GAME_RESET_TARGET_BLOCKED"
    });
  }
  return {
    mode:"preview-only",
    destructive:false,
    databaseConnection:false,
    exactRowCountsAvailable:false,
    target:{environment,branch,projectRef},
    coreGameTables:CORE_GAME_TABLES.map(row=>({...row})),
    allianceTablesRequireSeparateApproval:ALLIANCE_TABLES.map(row=>({...row})),
    preservedTables:[...PRESERVED_TABLES],
    authAccountsPreserved:true,
    executionImplemented:false
  };
}
