import {spawnSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
const pkg=JSON.parse(await readFile("package.json","utf8"));
const env={...process.env};
for(const key of ["SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","SESSION_SECRET","OPENAI_API_KEY","WARBOOST_VISION_MODEL"])delete env[key];
const results=[];
for(const name of Object.keys(pkg.scripts).filter(name=>name.startsWith("test:"))){
  // Import-only unauthorized API checks expect configured Auth, but must never use real secrets.
  const testEnv=name==="test:beta-api-imports"?{...env,SUPABASE_URL:"https://fixture.invalid",SUPABASE_ANON_KEY:"synthetic-anon",SUPABASE_SERVICE_ROLE_KEY:"synthetic-service"}:env;
  const run=spawnSync("npm",["run",name],{env:testEnv,encoding:"utf8",timeout:120000});
  console.log(`${run.status===0?"PASS":"FAIL"} ${name}`);
  if(run.status!==0)console.log((run.stdout||"")+(run.stderr||""));
  results.push({name,status:run.status,error:run.error?.message});
}
await writeFile("/tmp/warboost-mobile-test-results.json",JSON.stringify(results,null,2));
console.log(`${results.filter(r=>r.status===0).length}/${results.length} test scripts passed`);
if(results.some(r=>r.status!==0))process.exitCode=1;
