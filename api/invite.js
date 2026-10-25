import {requireProductUser} from "../lib/pro-access.js";
import {accessPolicyRpc} from "../lib/supabase.js";
import {createFounderSpaceHandler} from "../lib/alliance-access-service.js";

// Existing route, no additional serverless function and no invitation codes.
export default createFounderSpaceHandler({authorize:requireProductUser,rpc:accessPolicyRpc});
