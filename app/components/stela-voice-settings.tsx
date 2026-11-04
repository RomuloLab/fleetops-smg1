"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, RefreshCw, Volume2 } from "lucide-react";
import { newRequestId } from "@/lib/request-id";
import type { StelaVoiceOption, StelaVoiceSettingsInfo } from "@/lib/stela-speech-model";

export default function StelaVoiceSettings({onSaved,fetcher=fetch}:{onSaved:()=>void;fetcher?:typeof fetch}){
  const [settings,setSettings]=useState<StelaVoiceSettingsInfo|null>(null);const [key,setKey]=useState("");const [voiceId,setVoiceId]=useState("");
  const [voiceName,setVoiceName]=useState("");const [enabled,setEnabled]=useState(false);const [limit,setLimit]=useState(5000);
  const [voices,setVoices]=useState<StelaVoiceOption[]>([]);const [search,setSearch]=useState("");const [busy,setBusy]=useState("");
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [audioUrl,setAudioUrl]=useState("");
  const pending=useRef<AbortController|null>(null);const audio=useRef<HTMLAudioElement>(null);const live=useRef(true);const lock=useRef(false);
  function apply(value:StelaVoiceSettingsInfo){setSettings(value);setVoiceId(value.voiceId);setVoiceName(value.voiceName);setEnabled(value.enabled);setLimit(value.monthlyLimit);}
  useEffect(()=>{live.current=true;const controller=new AbortController();pending.current=controller;setBusy("load");
    void fetcher("/api/gestao/stela-voz",{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json() as {settings?:StelaVoiceSettingsInfo;error?:string};if(!response.ok||!body.settings)throw new Error(body.error||"Não consegui carregar a configuração.");if(live.current)apply(body.settings);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Não consegui carregar a configuração.");}).finally(()=>{if(live.current)setBusy("");});
    const hidden=()=>{if(document.hidden){audio.current?.pause();pending.current?.abort("hidden");}};
    const pagehide=()=>{audio.current?.pause();pending.current?.abort("hidden");};
    document.addEventListener("visibilitychange",hidden);window.addEventListener("pagehide",pagehide);
    return()=>{live.current=false;pending.current?.abort();audio.current?.pause();document.removeEventListener("visibilitychange",hidden);window.removeEventListener("pagehide",pagehide);};
  },[fetcher]);
  useEffect(()=>{const player=audio.current;return()=>{player?.pause();if(audioUrl)URL.revokeObjectURL(audioUrl);};},[audioUrl]);
  useEffect(()=>{if(audioUrl)void audio.current?.play().catch(()=>{if(live.current)setNotice("Áudio pronto. Toque em Reproduzir no controle abaixo.");});},[audioUrl]);
  async function run(kind:string,task:(signal:AbortSignal)=>Promise<void>){if(lock.current)return;lock.current=true;audio.current?.pause();pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(kind);setError("");setNotice("");const timeout=setTimeout(()=>controller.abort(),23000);
    try{await task(controller.signal);}catch(cause){if(live.current&&controller.signal.reason!=="hidden")setError(controller.signal.aborted?"A solicitação demorou. Atualize a configuração antes de tentar novamente.":cause instanceof Error?cause.message:"Não consegui concluir. Tente novamente.");}
    finally{clearTimeout(timeout);lock.current=false;if(live.current)setBusy("");}
  }
  async function save(event:React.FormEvent){event.preventDefault();if(!settings)return;await run("save",async signal=>{
    const response=await fetcher("/api/gestao/stela-voz",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key||undefined,voiceId,voiceName,enabled,monthlyLimit:limit,revision:settings.revision,changeId:newRequestId()}),signal});
    const body=await response.json() as {settings?:StelaVoiceSettingsInfo;error?:string};if(!response.ok||!body.settings)throw new Error(body.error||"Não consegui salvar a voz.");
    if(live.current){apply(body.settings);setKey("");setNotice(body.settings.enabled?"Voz ElevenLabs ativada para os gestores e transportadoras.":"Chave e configuração salvas. Escolha uma voz, teste e ative quando estiver pronta.");onSaved();}
  });}
  async function loadVoices(){await run("voices",async signal=>{
    const response=await fetcher("/api/gestao/stela-voz?voices=1&search="+encodeURIComponent(search),{cache:"no-store",signal});const body=await response.json() as {voices?:StelaVoiceOption[];error?:string};
    if(!response.ok||!body.voices)throw new Error(body.error||"Não consegui consultar as vozes.");if(live.current){setVoices(body.voices);setNotice(body.voices.length?"Selecione uma voz. As identificadas em português aparecem primeiro.":"Nenhuma voz encontrada. Tente outro nome ou adicione uma voz à sua conta ElevenLabs.");}
  });}
  async function test(){audio.current?.pause();await run("test",async signal=>{
    const response=await fetcher("/api/stela/voz",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({test:true}),signal});
    if(!response.ok){const body=await response.json() as {error?:string};throw new Error(body.error||"Não consegui gerar o teste.");}
    const blob=await response.blob();if(!blob.size||!blob.type.startsWith("audio/mpeg"))throw new Error("O áudio não chegou completo.");if(live.current&&!signal.aborted)setAudioUrl(URL.createObjectURL(blob));
  });}
  return <div className="stela-voice-settings"><span className="stela-eyebrow">CONFIGURAÇÃO MASTER</span><h3>Uma voz para a Stela</h3><p>Cadastre a chave da ElevenLabs, carregue suas vozes e escolha uma voz em português brasileiro.</p>
    {error&&<p role="alert" className="stela-settings-error">{error}</p>}{notice&&<p role="status" className="stela-settings-notice">{notice}</p>}
    {!settings?<p>{busy?<><LoaderCircle className="spin" size={14}/>Carregando configuração…</>:"Feche e abra a configuração para tentar novamente."}</p>:<>
      <form onSubmit={save}><fieldset disabled={!!busy}><label>Chave API ElevenLabs<input type="password" autoComplete="off" maxLength={512} required={!settings.configured} placeholder={settings.configured?"Chave cadastrada · preencha apenas para trocar":"Cole a chave criada na ElevenLabs"} value={key} onChange={event=>{setKey(event.target.value);if(event.target.value){setVoiceId("");setVoiceName("");setEnabled(false);setVoices([]);}}}/></label><small>A chave é protegida no servidor e não fica disponível para as transportadoras.</small>
      <label>Voz da Stela<select value={voiceId} onChange={event=>{setVoiceId(event.target.value);setVoiceName(voices.find(voice=>voice.id===event.target.value)?.name||"");}} disabled={!voices.length}><option value="">Selecione uma voz</option>{voiceId&&!voices.some(voice=>voice.id===voiceId)&&<option value={voiceId}>{voiceName||"Voz salva"}</option>}{voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name}{voice.language==="pt"?" · Português":""}{voice.accent?" · "+voice.accent:""}</option>)}</select></label>
      <label>Limite mensal de caracteres<input type="number" min={100} max={1000000} step={1} required value={limit} onChange={event=>setLimit(Number(event.target.value))}/></label><small>{settings.usedCharacters.toLocaleString("pt-BR")} caracteres reservados em {settings.period.split("-").reverse().join("/")}. A contagem inclui tentativas. O limite de créditos da chave também se aplica.</small>
      <label className="stela-settings-check"><input type="checkbox" checked={enabled} disabled={!voiceId} onChange={event=>setEnabled(event.target.checked)}/>Ativar ElevenLabs nos dois painéis</label>
      <p className="stela-settings-privacy">Ao ativar, as respostas escolhidas para leitura são enviadas à ElevenLabs para gerar áudio, conforme as configurações da sua conta. O microfone continua usando o ditado do navegador.</p>
      <button type="submit" className="button primary small" disabled={!settings.secretReady}>{busy==="save"?<LoaderCircle className="spin" size={14}/>:<CheckCircle2 size={14}/>}Salvar chave e configuração</button></fieldset></form>
      <div className="stela-settings-catalog"><label>Buscar voz na minha conta<input value={search} maxLength={80} disabled={!!busy||!settings.configured} onChange={event=>setSearch(event.target.value)} placeholder="Nome da voz ou português"/></label><button type="button" className="button secondary small" disabled={!!busy||!settings.configured||!!key} onClick={()=>void loadVoices()}>{busy==="voices"?<LoaderCircle className="spin" size={14}/>:<RefreshCw size={14}/>}Carregar vozes</button></div>
      <button type="button" className="button secondary small" disabled={!!busy||!settings.voiceId||!!key||voiceId!==settings.voiceId} onClick={()=>void test()}>{busy==="test"?<LoaderCircle className="spin" size={14}/>:<Volume2 size={14}/>}Testar voz salva</button><small>O teste gera áudio e consome créditos. Salve a voz selecionada antes de testar.</small>
      {audioUrl&&<audio ref={audio} src={audioUrl} controls aria-label="Teste da voz ElevenLabs da Stela"/>}
      <p className="stela-settings-model">Modelo: Multilingual v2 · qualidade consistente em português e leitura de números. Sem ativação, a Stela mantém a voz disponível no dispositivo.</p>
    </>}
  </div>;
}
