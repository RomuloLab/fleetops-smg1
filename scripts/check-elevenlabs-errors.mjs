import assert from "node:assert/strict";
import { elevenlabsFailure } from "../lib/elevenlabs-errors.ts";

const privateData = "sk_private_provider_content_do_not_return";
const cases = [
  [400, {detail:{code:"missing_permissions",message:privateData}}, "catalog", /Voices.*Ler/, "missing_permissions"],
  [401, {detail:{status:"quota_exceeded",message:privateData}}, "speech", /créditos/, "quota_exceeded"],
  [402, {detail:{code:"payment_required",message:privateData}}, "speech", /voz.*API.*plano.*Voice Library/, "payment_required"],
  [402, {}, "speech", /exige pagamento/, "unclassified"],
  [401, {detail:{code:"invalid_api_key"}}, "catalog", /chave.*recusada/, "invalid_api_key"],
  [403, {detail:{code:"insufficient_permissions"}}, "speech", /Text to Speech/, "insufficient_permissions"],
  [422, {detail:{code:"invalid_page_size"}}, "catalog", /parâmetros.*vozes/, "invalid_page_size"],
  [400, {detail:{status:"max_character_limit_exceeded"}}, "speech", /parâmetros.*áudio/, "max_character_limit_exceeded"],
  [404, {}, "speech", /voz escolhida/, "unclassified"],
  [429, {}, "speech", /Aguarde/, "unclassified"],
  [503, {detail:{code:"service_unavailable"}}, "catalog", /falha de serviço/, "service_unavailable"],
  [400, {detail:{status:"detected_unusual_activity"}}, "catalog", /atividade incomum/, "detected_unusual_activity"],
  [422, {detail:{code:privateData,message:privateData}}, "catalog", /HTTP 422/, "unclassified"],
  [307, {}, "catalog", /redirecionamento/, "unclassified"],
];
for(const [status,body,stage,expected,code] of cases){
  const result=await elevenlabsFailure(Response.json(body,{status}),stage);
  assert.match(result.message,expected);assert.match(result.message,new RegExp("HTTP "+status));assert.equal(result.diagnostic.code,code);
  assert.equal(result.status,status===429?429:503);assert.ok(!JSON.stringify(result).includes(privateData));
}
for(const body of ["<html>"+privateData+"</html>","{",'x'.repeat(17000)]){
  const result=await elevenlabsFailure(new Response(body,{status:502}),"catalog");
  assert.match(result.message,/HTTP 502/);assert.equal(result.diagnostic.code,"unclassified");assert.ok(!JSON.stringify(result).includes(privateData));
}
let cancelled=false;
const oversized=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(16385));},cancel(){cancelled=true;}}),{status:500});
assert.equal((await elevenlabsFailure(oversized,"catalog")).diagnostic.code,"unclassified");assert.equal(cancelled,true);
console.log("PASS: erros modernos e legados ElevenLabs identificados por código antes do HTTP; parâmetros, permissões, saldo, voz, limite, restrição e serviço; HTML, respostas extensas e dados privados descartados.");
