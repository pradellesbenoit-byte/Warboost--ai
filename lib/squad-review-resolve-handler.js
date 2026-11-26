import {planSquadReview,isReviewReceiptValid} from "./squad-review-resolution.js";
import {projectSquads} from "./squad-comparison-project.js";
import {compareSquadProjections} from "./squad-comparison-results.js";

const safeError = (status, code) => ({status,code});
const acceptCode = "I_REVIEWED_MY_SQUAD_FIELDS";

// Single-slot resolution. No service-role fallback and no full local profile upload.
export function createSquadReviewResolveHandler({requireProductUser,readForUser,saveForUser,consentVersion}) {
  return async function squadReviewResolveHandler(req,res) {
    res.setHeader("Cache-Control","no-store");
    res.setHeader("Vary","Authorization");
    if (req.method !== "POST") {
      res.setHeader("Allow","POST");
      return res.status(405).json({error:"method_not_allowed"});
    }
    try {
      const body = req.body;
      if (!body || Array.isArray(body) || typeof body!=="object" ||
          body.acknowledgement !== acceptCode ||
          !Number.isInteger(body.squad_id) ||
          !body.local_squad ||
          typeof body.expected_revision!=="string" ||
          !Array.isArray(body.reviewed_fields) ||
          body.reviewed_fields.length>10)
        return res.status(400).json({error:"review_invalid_request"});
      if (String(req.headers?.["x-warboost-beta-consent"]||"")!==consentVersion)
        return res.status(428).json({error:"BETA_CONSENT_REQUIRED"});
      const {user} = await requireProductUser(req,{consent:true});
      const owner = String(user?.id||"");
      const bearer = String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
      if (!owner || !bearer) return res.status(401).json({error:"AUTH_REQUIRED"});
      // Required read of the ACTUAL latest own-row state. Never use client's
      // public JSON state or the value from an earlier GET response as base.
      const current = await readForUser(owner,bearer,{timeoutMs:8000});
      if (!current?.state || !current?.updated_at)
        return res.status(409).json({error:"review_cloud_profile_unavailable"});
      const compare=(localSquad,cloudSquad,id)=>{
        const mine=projectSquads([localSquad]);
        const theirs=projectSquads([cloudSquad]);
        return compareSquadProjections(mine,theirs,{available:true})[id-1];
      };
      const plan=planSquadReview({cloudState:current.state,owner,
        revision:current.updated_at,expectedRevision:body.expected_revision,
        squadId:body.squad_id,localSquad:body.local_squad,
        reviewedFields:body.reviewed_fields,now:new Date().toISOString(),compare});
      // If the old marker exists only in the device, the latest authenticated
      // cloud read may already be authoritative. A no-op is not a cloud write.
      if (JSON.stringify(plan.candidate)===JSON.stringify(current.state))
        return res.status(200).json({ok:true,cloud_verified:true,write_confirmed:false,
          squad_id:body.squad_id,squad:current.state.squads[body.squad_id-1],
          updated_at:current.updated_at,confirmed_fields:plan.confirmedFields});
      // Atomic expected_updated_at guard is in the established Supabase helper.
      const saved=await saveForUser(owner,plan.candidate,bearer,current.updated_at);
      if (!isReviewReceiptValid({saved,previousRevision:current.updated_at,
        expectedSquad:plan.squad,candidate:plan.candidate,owner,squadId:body.squad_id}))
        return res.status(503).json({error:"review_write_not_confirmed"});
      return res.status(200).json({ok:true,write_confirmed:true,squad_id:body.squad_id,
        squad:saved.state.squads[body.squad_id-1],updated_at:saved.updated_at,
        confirmed_fields:plan.confirmedFields});
    } catch(error) {
      const status=Number(error?.status);
      const known={review_owner_mismatch:403,review_revision_changed:409,
        review_cloud_structure_ambiguous:409,review_marker_not_current:409,
        review_comparison_incomplete:409,review_unverified_field_unsupported:409,
        review_fields_changed:409,review_hero_missing:409,review_field_missing:409,
        review_field_unresolved:409,review_identity_evidence_pending:409,
        review_invalid_selection:400,profile_write_conflict:409,profile_revision_required:409};
      const code=String(error?.code||"");
      const mapped=known[code]||([401,403,409,428].includes(status)?status:503);
      const safe=known[code]?code:(mapped===401?"AUTH_REQUIRED":mapped===403?"review_forbidden":mapped===409?"review_revision_changed":"review_unavailable");
      return res.status(mapped).json({error:safe});
    }
  };
}
