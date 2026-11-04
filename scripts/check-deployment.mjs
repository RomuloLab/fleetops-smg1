import assert from "node:assert/strict";
import {deploymentConfig as config,deploymentRequest,REQUEST_MARKER,runSitesDeployment} from "./request-sites-deployment.mjs";
import {assertReleaseTarget} from "./prepare-sites-release.mjs";

const sha="a".repeat(40),other="b".repeat(40),secret="ephemeral-test-token-do-not-log";
const env={GITHUB_REPOSITORY:config.repository,GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"push",GITHUB_SHA:sha,GITHUB_RUN_ID:"12345",GITHUB_RUN_ATTEMPT:"1",GITHUB_TOKEN:secret,GITHUB_API_URL:"https://api.github.com",GITHUB_SERVER_URL:"https://github.com"};
for(const change of [{GITHUB_REPOSITORY:"fork/fleetops"},{GITHUB_REF:"refs/heads/preview"},{GITHUB_EVENT_NAME:"pull_request"},{GITHUB_SHA:"invalid"},{GITHUB_RUN_ID:"https://invalid.test"},{GITHUB_TOKEN:""},{GITHUB_API_URL:"https://invalid.test"}])assert.throws(()=>deploymentRequest({...env,...change}));
assert.ok(!JSON.stringify(deploymentRequest(env)).includes(secret));
assertReleaseTarget({project_id:config.siteProjectId,d1:"DB",r2:"BUCKET"});
for(const change of [{project_id:"another-site"},{d1:"OTHER_DB"},{r2:null}])assert.throws(()=>assertReleaseTarget({project_id:config.siteProjectId,d1:"DB",r2:"BUCKET",...change}));

function harness({initiallyPublished=false,channelOpen=true,head=sha,neverPublish=false,supersede=false,oneOriginOnly=false}={}){
  const calls=[],logs=[];let time=0,queued=false;const responses={};
  const fetcher=async(input,init={})=>{
    const url=new URL(input);calls.push({url:url.href,init});
    if(url.hostname==="api.github.com"){
      assert.equal(init.headers.Authorization,"Bearer "+secret);assert.equal(init.redirect,"error");
      if(url.pathname.endsWith("/git/ref/heads/main"))return Response.json({object:{sha:queued&&supersede?other:head}});
      if(url.pathname.endsWith("/pulls/"+config.controllerPullRequest))return Response.json({state:channelOpen?"open":"closed",draft:true,head:{ref:config.controllerBranch,repo:{full_name:config.repository}},base:{ref:"main"}});
      if(url.pathname.endsWith("/issues/"+config.controllerPullRequest+"/comments")){
        assert.equal(init.method,"POST");assert.ok(!init.body.includes(secret));const body=JSON.parse(init.body).body;assert.ok(body.startsWith(REQUEST_MARKER));
        const request=JSON.parse(body.match(/```json\n([\s\S]+)\n```/)[1]);assert.equal(request.sha,sha);assert.equal(request.runId,env.GITHUB_RUN_ID);queued=true;responses.request=request;return Response.json({id:7});
      }
      throw new Error("Unexpected GitHub endpoint");
    }
    assert.ok([config.productionOrigin,config.nativeOrigin].includes(url.origin));assert.equal(init.headers.Authorization,undefined);
    const available=initiallyPublished||(queued&&time>0&&!neverPublish&&(!oneOriginOnly||url.origin===config.nativeOrigin));
    return available?Response.json({repository:config.repository,branch:"main",commit:sha}):new Response("not yet",{status:404});
  };
  return {calls,logs,responses,options:{env,fetcher,now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:40,intervalMs:10,log:value=>logs.push(value)}};
}
{
  const h=harness();const result=await runSitesDeployment(h.options);assert.equal(result.status,"published");assert.equal(result.requestCommentId,7);assert.ok(h.calls.some(c=>c.init.method==="POST"));assert.ok(!JSON.stringify(h.logs).includes(secret));
}
{
  const h=harness({initiallyPublished:true});assert.equal((await runSitesDeployment(h.options)).status,"published");assert.ok(!h.calls.some(c=>c.init.method==="POST"));
}
{
  const h=harness({head:other});assert.equal((await runSitesDeployment(h.options)).status,"superseded");assert.equal(h.calls.length,1);
}
{
  const h=harness({channelOpen:false});await assert.rejects(runSitesDeployment(h.options),/canal técnico/);assert.ok(!h.calls.some(c=>c.init.method==="POST"));
}
{
  const h=harness({supersede:true});assert.equal((await runSitesDeployment(h.options)).status,"superseded");
}
for(const settings of [{neverPublish:true},{oneOriginOnly:true}]){
  const h=harness(settings);await assert.rejects(runSitesDeployment(h.options),/não foi confirmada/);
}
console.log("PASS: publicação somente da main autorizada; forks/PRs/ambientes externos bloqueados; token fora do payload e da consulta pública; solicitação após preflight; confirmação nos dois domínios; duplicação, supersessão, canal fechado e timeout sem falso sucesso.");
