import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

export function assertReleaseTarget(manifest) {
  if(manifest.project_id!=="appgprj_6adcee78662c81919e6740bd2e2aefef"||manifest.d1!=="DB"||manifest.r2!=="BUCKET")throw new Error("A publicação deve preservar o Site existente e os bindings DB/BUCKET.");
}

export function prepareRelease(sha,runId){
  if(!/^[a-f0-9]{40}$/.test(sha||"")||!/^[0-9]{1,20}$/.test(runId||""))throw new Error("Informe o SHA validado e o identificador da execução.");
  assertReleaseTarget(JSON.parse(readFileSync(".openai/hosting.json","utf8")));
  const sourceTree=execFileSync("git",["rev-parse",sha+"^{tree}"],{encoding:"utf8"}).trim();
  const stagedTree=execFileSync("git",["write-tree"],{encoding:"utf8"}).trim();
  if(sourceTree!==stagedTree)throw new Error("O índice precisa corresponder exatamente ao commit validado do GitHub antes de preparar a versão.");
  const release={sourceCommit:sha,sourceRunId:runId,publishedAt:new Date().toISOString()};
  writeFileSync("config/release.json",JSON.stringify(release,null,2)+"\n");
  return release;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{console.log(JSON.stringify(prepareRelease(process.argv[2],process.argv[3])));}catch(cause){console.error(cause instanceof Error?cause.message:"Falha ao preparar a versão.");process.exitCode=1;}
}
