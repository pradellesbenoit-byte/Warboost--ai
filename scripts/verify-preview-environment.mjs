import {assertPreviewEnvironment} from "../lib/preview-environment.js";

const result = assertPreviewEnvironment();
if (result.skipped) {
  console.log("SKIP preview isolation guard: not a Vercel Preview build.");
} else {
  console.log("PASS preview isolation guard: target branch and WarBoost-Test project verified; billing and paid AI credentials absent.");
}
