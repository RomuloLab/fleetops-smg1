import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUEST_MARKER = "<!-- fleetops-sites-deploy-request:v1 -->";
export const deploymentConfig = JSON.parse(readFileSync(new URL("../.github/fleetops-deploy.json", import.meta.url), "utf8"));

export function deploymentRequest(env, config = deploymentConfig) {
  if (env.GITHUB_REPOSITORY !== config.repository || env.GITHUB_REF !== "refs/heads/" + config.branch || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) throw new Error("Publicação permitida somente para push ou execução manual da main deste repositório.");
  if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "") || !/^[0-9]{1,20}$/.test(env.GITHUB_RUN_ID || "")) throw new Error("Commit ou execução do GitHub inválidos.");
  if (!/^[0-9]{1,5}$/.test(env.GITHUB_RUN_ATTEMPT || "")) throw new Error("Tentativa de execução inválida.");
  if (!env.GITHUB_TOKEN || env.GITHUB_API_URL !== "https://api.github.com" || env.GITHUB_SERVER_URL !== "https://github.com") throw new Error("Ambiente autenticado do GitHub Actions indisponível.");
  return {version:1,repository:config.repository,ref:env.GITHUB_REF,sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,workflow:".github/workflows/fleetops.yml"};
}

export async function runSitesDeployment({env=process.env,fetcher=fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=20*60*1000,intervalMs=15000,log=console.log,config=deploymentConfig}={}) {
  const request=deploymentRequest(env,config);
  const api=async(path,method="GET",body)=>{
    const response=await fetcher("https://api.github.com/repos/"+config.repository+path,{method,headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10","Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      let reason="";try{const value=await response.json();if(value.message==="Resource not accessible by integration")reason=" O token não tem a permissão exigida para esta operação.";else if(value.message==="Issues are disabled for this repo")reason=" O recurso de issues está desativado; comentários de PR exigem pull-requests: write.";}catch{}
      throw new Error("GitHub não confirmou "+method+" "+path+" (HTTP "+response.status+")."+reason);
    }
    return response.json();
  };
  const release=async origin=>{
    try {
      const url=new URL("/api/fleetops-release",origin);url.searchParams.set("run",request.runId);url.searchParams.set("t",String(now()));
      const response=await fetcher(url,{headers:{Accept:"application/json","Cache-Control":"no-cache"},redirect:"error",signal:AbortSignal.timeout(12000)});
      if(!response.ok||!response.headers.get("content-type")?.includes("application/json")){await response.body?.cancel();return null;}
      const value=await response.json();return value?.repository===config.repository&&value?.branch===config.branch&&value?.commit===request.sha?value:null;
    }catch{return null;}
  };
  const published=async()=>{
    const states=await Promise.all([release(config.productionOrigin),release(config.nativeOrigin)]);
    return states.every(Boolean);
  };
  const head=await api("/git/ref/heads/"+config.branch);
  if(head.object?.sha!==request.sha){log("Execução superada por um commit mais novo na main. Nenhuma solicitação foi enviada.");return {status:"superseded",commit:request.sha};}
  if(await published()){log("Este commit já está publicado nos dois endereços.");return {status:"published",commit:request.sha,site:config.productionOrigin};}
  const channel=await api("/pulls/"+config.controllerPullRequest);
  if(channel.state!=="open"||channel.draft!==true||channel.head?.ref!==config.controllerBranch||channel.base?.ref!==config.branch||channel.head?.repo?.full_name!==config.repository)throw new Error("O canal técnico de publicação precisa permanecer aberto e em rascunho.");
  const body=REQUEST_MARKER+"\n\nPublicação solicitada após os testes da main.\n\n```json\n"+JSON.stringify(request,null,2)+"\n```";
  const comment=await api("/issues/"+config.controllerPullRequest+"/comments","POST",{body});
  if(!Number.isSafeInteger(comment.id))throw new Error("O GitHub não retornou o identificador da solicitação.");
  log("Solicitação registrada no canal técnico. Aguardando a versão "+request.sha.slice(0,7)+" em produção.");
  const deadline=now()+timeoutMs;
  while(now()<deadline){
    if(await published()){log("Publicação confirmada nos dois endereços.");return {status:"published",commit:request.sha,site:config.productionOrigin,requestCommentId:comment.id};}
    const latest=await api("/git/ref/heads/"+config.branch);
    if(latest.object?.sha!==request.sha){log("Uma versão mais nova chegou à main. Esta execução foi superada.");return {status:"superseded",commit:request.sha,requestCommentId:comment.id};}
    await sleep(intervalMs);
  }
  throw new Error("A publicação não foi confirmada no prazo. Confira a execução do publicador do Sites e o canal técnico; o workflow não considera o comentário como confirmação de deploy.");
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const result=await runSitesDeployment();
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,"## FleetOps\n\nResultado: **"+result.status+"**\n\nCommit: `"+result.commit+"`\n\n[Site de produção]("+deploymentConfig.productionOrigin+")\n");
  }catch(cause){console.error(cause instanceof Error?cause.message:"Falha ao publicar o FleetOps.");process.exitCode=1;}
}
