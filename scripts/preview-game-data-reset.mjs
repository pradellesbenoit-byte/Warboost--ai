import {buildGameDataResetPreview} from "../lib/game-data-reset-plan.js";

function argument(name) {
  const prefix=`--${name}=`;
  return process.argv.find(value=>value.startsWith(prefix))?.slice(prefix.length);
}

try {
  const plan=buildGameDataResetPreview({
    environment:argument("environment"),
    branch:argument("branch"),
    projectRef:argument("project-ref")
  });
  console.log(JSON.stringify(plan,null,2));
  console.log("No database was contacted or changed. This command cannot execute a reset.");
} catch(error) {
  console.error(`${error.code||"GAME_RESET_PREVIEW_FAILED"}: ${error.message}`);
  process.exitCode=1;
}
