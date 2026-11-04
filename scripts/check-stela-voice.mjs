import assert from "node:assert/strict";
import { StelaVoice, browserStelaVoicePlatform, speechChunks } from "../lib/stela-voice.ts";

function fixture({secure=true,recognition=true,synthesis=true}={}) {
  const sessions=[];const spoken=[];const transcripts=[];const states=[];let cancels=0;
  const pt={name:"Voz brasileira",lang:"pt-BR"};
  const platform={secure,createRecognition:recognition?()=>{
    const instance={onstart:null,onend:null,onresult:null,onerror:null,starts:0,stops:0,aborts:0,start(){this.starts++;},stop(){this.stops++;},abort(){this.aborts++;}};sessions.push(instance);return instance;
  }:null,synthesis:synthesis?{getVoices:()=>[{lang:"en-US"},{lang:"pt-PT"},pt],speak:utterance=>spoken.push(utterance),cancel:()=>cancels++,resume(){}}:null,
  createUtterance:synthesis?text=>({text,lang:"",voice:null,onstart:null,onend:null,onerror:null}):null};
  const controller=new StelaVoice(platform,state=>states.push(state),text=>transcripts.push(text));controller.start();
  return {controller,sessions,spoken,transcripts,states,pt,cancels:()=>cancels};
}
const result=(text,isFinal=false)=>({0:{transcript:text},isFinal});
const f=fixture();assert.equal(f.sessions.length,0);assert.equal(f.spoken.length,0); // No audio or permission request on mount.
f.controller.startListening("Minha dúvida:");const rec=f.sessions[0];assert.equal(rec.starts,1);assert.equal(rec.lang,"pt-BR");assert.equal(rec.continuous,false);assert.equal(rec.interimResults,true);assert.equal(f.controller.state.enabled,true);assert.equal(f.controller.state.phase,"starting");
rec.onstart();assert.equal(f.controller.state.phase,"listening");
rec.onresult({results:[result("Como usar")]});rec.onresult({results:[result("Como usar",true),result("o Scheduling?")]});assert.equal(f.transcripts.at(-1),"Minha dúvida: Como usar o Scheduling?");
f.controller.stopListening();assert.equal(rec.stops,1);assert.equal(f.controller.state.phase,"finishing");rec.onresult({results:[result("Como usar o Scheduling?",true)]});rec.onend();assert.equal(f.transcripts.at(-1),"Minha dúvida: Como usar o Scheduling?");assert.equal(f.controller.state.phase,"idle");assert.match(f.controller.state.message,/Confira a transcrição/);
f.controller.speak("A resposta continua aparecendo no chat.","answer-1");assert.equal(f.controller.state.pendingId,"answer-1");const utterance=f.spoken[0];assert.equal(utterance.lang,"pt-BR");assert.equal(utterance.voice,f.pt);utterance.onstart();assert.equal(f.controller.state.speakingId,"answer-1");utterance.onend();assert.equal(f.controller.state.speakingId,null);assert.equal(f.controller.state.pendingId,null);
f.controller.startListening("Texto preservado");const denied=f.sessions.at(-1);denied.onerror({error:"not-allowed"});assert.equal(f.controller.state.phase,"idle");assert.match(f.controller.state.error,/microfone foi bloqueado/);assert.equal(f.transcripts.at(-1),"Minha dúvida: Como usar o Scheduling?");
f.controller.startListening("");const late=f.sessions.at(-1);late.onstart();const callback=late.onresult;f.controller.suspend();callback({results:[result("Não deve entrar",true)]});assert.equal(late.aborts,1);assert.ok(!f.transcripts.includes("Não deve entrar"));assert.equal(f.controller.state.phase,"idle");
f.controller.startListening("");const long=f.sessions.at(-1);long.onstart();long.onresult({results:[result("a".repeat(1300),true)]});assert.equal(f.transcripts.at(-1).length,1200);assert.equal(long.stops,1);long.onend();assert.match(f.controller.state.message,/1.200/);
f.controller.speak("Primeira resposta.","old");const old=f.spoken.at(-1);const oldEnd=old.onend;f.controller.speak("Nova resposta.","new");const current=f.spoken.at(-1);oldEnd();assert.equal(f.controller.state.pendingId,"new");assert.equal(old.onstart,null);current.onstart();assert.equal(f.controller.state.speakingId,"new");f.controller.setEnabled(false);assert.equal(f.controller.state.enabled,false);assert.equal(f.controller.state.speakingId,null);assert.ok(f.cancels()>0);
f.controller.speak("Leitura bloqueada.","blocked");f.spoken.at(-1).onerror({error:"not-allowed"});assert.match(f.controller.state.error,/Toque em Ouvir/);assert.equal(f.controller.state.pendingId,null);
const text=Array.from({length:30},(_,i)=>`Parte ${i+1}: confira os pedidos e a disponibilidade da operação.`).join(" ");const chunks=speechChunks(text);assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>chunk.length<=220));assert.equal(chunks.join(" "),text);assert.equal(speechChunks("x".repeat(600)).length,3);
const initial=f.spoken.length;f.controller.speak(text,"long");for(let index=0;index<chunks.length;index++){assert.ok(f.spoken[initial+index]);f.spoken[initial+index].onstart();f.spoken[initial+index].onend();}assert.equal(f.spoken.length-initial,chunks.length);assert.equal(f.controller.state.speakingId,null);
f.controller.startListening("");const active=f.sessions.at(-1);active.onstart();f.controller.speak("Sem captar a própria voz.","echo");assert.equal(active.aborts,1);assert.equal(f.controller.state.phase,"idle");f.controller.dispose();assert.equal(f.controller.state.speakingId,null);
const insecure=fixture({secure:false});insecure.controller.startListening("");assert.equal(insecure.sessions.length,0);assert.match(insecure.controller.state.error,/HTTPS/);insecure.controller.dispose();
const noInput=fixture({recognition:false});noInput.controller.startListening("");assert.match(noInput.controller.state.error,/digitar/);noInput.controller.speak("Ainda consigo ler.","read-only");assert.equal(noInput.spoken.length,1);noInput.controller.dispose();
const noOutput=fixture({synthesis:false});noOutput.controller.startListening("");assert.equal(noOutput.sessions.length,1);assert.equal(noOutput.controller.state.enabled,false);noOutput.controller.speak("Sem voz.","no-voice");assert.match(noOutput.controller.state.error,/continua no chat/);noOutput.controller.dispose();
const ctor=function(){};globalThis.window={isSecureContext:true,webkitSpeechRecognition:ctor,speechSynthesis:{},SpeechSynthesisUtterance:function(text){this.text=text;}};
const native=browserStelaVoicePlatform();assert.ok(native.createRecognition());assert.equal(native.createUtterance("Teste").text,"Teste");assert.equal(native.secure,true);delete globalThis.window;
console.log("PASS: voz começa somente por ação; ditado pt-BR sem duplicar resultados; revisão e limites; permissão negada e falta de suporte; TTS com voz brasileira, leitura longa e repetição; parada, troca de resposta e descarte de eventos tardios; captura e reprodução não se sobrepõem.");
