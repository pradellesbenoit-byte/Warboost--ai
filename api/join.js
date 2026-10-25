import {requireProductUser} from "../lib/pro-access.js";
import {accessPolicyRpc} from "../lib/supabase.js";
import {createAllianceAccessHandler} from "../lib/alliance-access-service.js";

// No code authorizes a membership. Roles are decided atomically from the canonical roster.
export default createAllianceAccessHandler({authorize:requireProductUser,rpc:accessPolicyRpc});
