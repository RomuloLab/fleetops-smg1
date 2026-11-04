import assert from "node:assert/strict";
import {StelaVoice} from "../lib/stela-voice.ts";
import {stelaCloudSpeech} from "../lib/stela-speech-client.ts";

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const states=[],calls=[],stops=[];
const controller=new StelaVoice({secure:true,createRecognition:null,synthesis:null,createUtterance:null},state=>states.push(state),()=>{});
controller.start();assert.equal(controller.state.synthesis,false);
let resolvePending;
controller.setRemoteSpeech(async input=>{calls.push(input);return new Promise(resolve=>{resolvePending=resolve;});});
controller.setEnabled(true);assert.equal(controller.state.enabled,true);
controller.speak("Resposta em áudio.","first");assert.equal(controller.state.pendingId,"first");await tick();
const first=calls[0];first.onStart();assert.equal(controller.state.speakingId,"first");
controller.suspend();assert.equal(first.signal.aborted,true);assert.equal(controller.state.speakingId,null);
resolvePending(()=>stops.push("first"));await tick();assert.deepEqual(stops,["first"]);
first.onStart();first.onEnd();assert.equal(controller.state.speakingId,null,"late events after suspension cannot resume playback");
controller.speak("Segunda resposta.","second");await tick();const second=calls.at(-1);resolvePending(()=>stops.push("second"));await tick();second.onStart();assert.equal(controller.state.speakingId,"second");
controller.speak("Terceira resposta.","third");await tick();const third=calls.at(-1);resolvePending(()=>stops.push("third"));await tick();second.onEnd();assert.equal(controller.state.pendingId,"third");third.onStart();third.onEnd();assert.equal(controller.state.speakingId,null);assert.ok(stops.includes("third"));
controller.setRemoteSpeech(async()=>{throw new Error("Falha simulada de voz.");});controller.speak("Texto preservado.","failed");await tick();assert.equal(controller.state.pendingId,null);assert.match(controller.state.error,/Falha simulada/);controller.dispose();

const requests=[],audios=[],created=[],revoked=[];let rejectPlay=false;let failRequest=false;
const cloud=stelaCloudSpeech({carrier:"alc",accessKey:"isolated-carrier-token",ticket:id=>id==="reply"?"isolated-signed-ticket":undefined,
  fetcher:async(url,options)=>{requests.push({url,options});if(failRequest)return Response.json({error:"Limite mensal atingido."},{status:429});return new Response(new Uint8Array([73,68,51,0,0,0,0]),{headers:{"Content-Type":"audio/mpeg"}});},
  urls:{createObjectURL:blob=>{const url="blob:isolated-"+created.length;created.push({url,blob});return url;},revokeObjectURL:url=>revoked.push(url)},
  audio:url=>{const audio={src:url,onplaying:null,onended:null,onerror:null,paused:false,async play(){if(rejectPlay)throw new Error("not allowed");},pause(){this.paused=true;}};audios.push(audio);return audio;},
});
let started=0,ended=0;const makeInput=(id="reply",signal=new AbortController().signal)=>({id,text:"Client text must never be sent to the provider.",signal,onStart:()=>started++,onEnd:()=>ended++,onError:()=>{}});
const cleanup=await cloud.play(makeInput());assert.equal(requests.length,1);assert.equal(requests[0].url,"/api/stela/voz");
assert.equal(requests[0].options.headers.Authorization,"Bearer isolated-carrier-token");
assert.deepEqual(JSON.parse(requests[0].options.body),{carrier:"alc",ticket:"isolated-signed-ticket"});
assert.ok(!requests[0].options.body.includes("Client text"));audios[0].onplaying();assert.equal(started,1);audios[0].onended();assert.equal(ended,1);assert.equal(audios[0].paused,true);cleanup();assert.equal(revoked.length,1);
const cancel=new AbortController();await cloud.play(makeInput("reply",cancel.signal));assert.equal(requests.length,1,"replay reuses the cached authorized audio instead of spending more credits");cancel.abort();assert.equal(audios.at(-1).paused,true);assert.equal(revoked.length,2);
await assert.rejects(()=>cloud.play(makeInput("unsigned")),/nova pergunta/);
const aborted=new AbortController();aborted.abort();await assert.rejects(()=>cloud.play(makeInput("voice-test",aborted.signal)),{name:"AbortError"});assert.equal(requests.length,1);
rejectPlay=true;await assert.rejects(()=>cloud.play(makeInput()),/Toque em Ouvir/);assert.equal(revoked.length,3);rejectPlay=false;
failRequest=true;await assert.rejects(()=>cloud.play(makeInput("voice-test")),/Limite mensal/);cloud.dispose();
console.log("PASS: voz ElevenLabs sem síntese nativa; áudio somente por ação; cancelamento, troca de resposta e eventos tardios; ticket autorizado sem texto livre; cache de replay sem nova geração; descarte de URLs e erro de reprodução sem perder o chat.");
