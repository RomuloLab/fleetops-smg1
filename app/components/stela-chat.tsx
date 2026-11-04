"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, ChevronRight, CircleHelp, LoaderCircle, Mic, Minimize2, Play, RotateCcw, Settings2, ShieldCheck, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { formatDate, type Cycle } from "@/lib/model";
import { stelaSuggestions, type StelaRole } from "@/lib/stela-knowledge";
import type { StelaReply } from "@/lib/stela-model";
import { newRequestId } from "@/lib/request-id";
import { browserStelaVoicePlatform, INITIAL_STELA_VOICE, StelaVoice, type StelaVoicePlatform } from "@/lib/stela-voice";
import StelaRobot from "./stela-robot";
import StelaVoiceSettings from "./stela-voice-settings";
import { stelaCloudSpeech } from "@/lib/stela-speech-client";
import type { StelaSpeechMetadata } from "@/lib/stela-speech-model";

type Message = { id: string; role: "user" | "assistant"; content: string; reply?: StelaReply };
type Props = { audience: StelaRole; accessKey?: string; date: string; cycle: Cycle; view: string; onNavigate: (view: string) => void; voicePlatformFactory?: () => StelaVoicePlatform; fetcher?: typeof fetch };
export default function StelaChat({ audience, accessKey, date, cycle, view, onNavigate, voicePlatformFactory = browserStelaVoicePlatform, fetcher = fetch }: Props) {
  const [open,setOpen] = useState(false); const [draft,setDraft] = useState(""); const [messages,setMessages] = useState<Message[]>([]);
  const [busy,setBusy] = useState(false); const [speaking,setSpeaking] = useState(false); const [engine,setEngine] = useState<"ai"|"guide">("guide"); const [configured,setConfigured]=useState(false);
  const [suggestions,setSuggestions] = useState(()=>stelaSuggestions(audience));
  const [ready,setReady] = useState(false); const [error,setError] = useState(""); const [metadataAttempt,setMetadataAttempt] = useState(0);
  const [speech,setSpeech]=useState<StelaSpeechMetadata>({provider:"browser"});const [voiceSettings,setVoiceSettings]=useState(false);
  const speechTickets=useRef(new Map<string,string>());const settingsVisible=audience.isMaster&&voiceSettings;
  const launcher = useRef<HTMLButtonElement>(null); const input = useRef<HTMLTextAreaElement>(null); const end = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController|null>(null); const sendLock=useRef(false); const heading = useRef<HTMLHeadingElement>(null);
  const hasOpened=useRef(false);
  const [voice,setVoice]=useState(INITIAL_STELA_VOICE);const voiceController=useRef<StelaVoice|null>(null);const visible=useRef(open);visible.current=open;
  useEffect(()=>{
    const controller=new StelaVoice(voicePlatformFactory(),setVoice,setDraft);voiceController.current=controller;controller.start();
    function hidden(){if(document.hidden)controller.suspend();}function pagehide(){controller.suspend();}
    document.addEventListener("visibilitychange",hidden);window.addEventListener("pagehide",pagehide);
    return()=>{document.removeEventListener("visibilitychange",hidden);window.removeEventListener("pagehide",pagehide);controller.dispose();if(voiceController.current===controller)voiceController.current=null;};
  },[voicePlatformFactory]);
  const endpoint = "/api/stela" + (audience.carrier ? "?transportadora=" + encodeURIComponent(audience.carrier) : "");
  const requestHeaders = () => ({ "Content-Type":"application/json", ...(accessKey ? {Authorization:`Bearer ${accessKey}`} : {}) });
  useEffect(()=>{
    const controller=voiceController.current;if(!controller)return;
    if(speech.provider!=="elevenlabs"){controller.setRemoteSpeech(null);return;}
    const player=stelaCloudSpeech({carrier:audience.carrier,accessKey,fetcher,ticket:id=>speechTickets.current.get(id)});
    controller.setRemoteSpeech(player.play);
    return()=>{controller.setRemoteSpeech(null);player.dispose();};
  },[speech.provider,speech.revision,accessKey,audience.carrier,voicePlatformFactory,fetcher]);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus();
    const controller = new AbortController();setError("");setReady(false);
    fetcher(endpoint,{headers:accessKey?{Authorization:`Bearer ${accessKey}`}:{},cache:"no-store",signal:controller.signal}).then(async response=>{
      const body=await response.json() as {engine?:"ai"|"guide";suggestions?:string[];speech?:StelaSpeechMetadata;error?:string};
      if(!response.ok)throw new Error(body.error || "Não consegui conectar. Tente novamente.");
      if(!controller.signal.aborted){setConfigured(body.engine === "ai");setEngine(body.engine === "ai"?"ai":"guide");setSpeech(body.speech?.provider==="elevenlabs"?body.speech:{provider:"browser"});if(body.suggestions)setSuggestions(body.suggestions);setReady(true);}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Não consegui conectar.");});
    return ()=>controller.abort();
  },[open,endpoint,accessKey,metadataAttempt,fetcher]);
  useEffect(()=>()=>pending.current?.abort(),[]);
  useEffect(()=>{if(open)hasOpened.current=true;else if(hasOpened.current)launcher.current?.focus();},[open]);
  useEffect(()=>{if(!open)return;function key(event:KeyboardEvent){if(event.key==="Escape"){event.preventDefault();close();}}document.addEventListener("keydown",key);return()=>document.removeEventListener("keydown",key);},[open]);
  useEffect(()=>{if(!open)return;if(messages.length||busy)end.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});else end.current?.parentElement?.scrollTo({top:0,behavior:"auto"});},[messages,busy,open]);
  useEffect(()=>{if(!speaking)return;const timer=setTimeout(()=>setSpeaking(false),4000);return()=>clearTimeout(timer);},[speaking]);
  async function send(value = draft) {
    const text=value.trim();if(!text || text.length>1200 || sendLock.current || !ready || voiceController.current?.state.phase!=="idle")return;
    voiceController.current?.stopSpeaking();voiceController.current?.clearFeedback();
    sendLock.current=true;setBusy(true);setError("");setDraft("");setSpeaking(false);
    const outgoing:Message={id:newRequestId(),role:"user",content:text};
    const history=[...messages,outgoing];setMessages(history);
    const controller=new AbortController();pending.current=controller;const timeout=setTimeout(()=>controller.abort("timeout"),26000);
    try {
      const response=await fetcher("/api/stela",{method:"POST",headers:requestHeaders(),body:JSON.stringify({...(audience.carrier?{carrier:audience.carrier}:{}),messages:history.slice(-7).map(message=>({role:message.role,content:message.content.slice(0,1800)})),context:{date,cycle,view}}),signal:controller.signal});
      const body=await response.json() as StelaReply & {error?:string;retryAfter?:number};
      if(!response.ok)throw new Error(body.error || "Não consegui responder. Tente novamente.");
      if(!body.text || !["ai","guide"].includes(body.engine))throw new Error("A resposta não chegou completa. Tente novamente.");
      const replyId=newRequestId();if(body.speechTicket)speechTickets.current.set(replyId,body.speechTicket);setMessages(current=>[...current,{id:replyId,role:"assistant",content:body.text,reply:body}]);setEngine(body.engine);setSuggestions(body.suggestions);
      if(voiceController.current?.state.enabled && visible.current && !document.hidden)voiceController.current.speak(body.text,replyId);else setSpeaking(true);
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Falha de conexão. Tente novamente.");else if(controller.signal.reason==="timeout")setError("A resposta demorou mais que o esperado. Tente novamente.");}
    finally{clearTimeout(timeout);if(pending.current===controller)pending.current=null;sendLock.current=false;setBusy(false);}
  }
  function close(){voiceController.current?.suspend();setVoiceSettings(false);setOpen(false);}
  function navigate(target:string){onNavigate(target);close();}
  const profile=audience.kind==="carrier"?audience.name:audience.isMaster?"Painel master":"Painel do gestor";
  const capturing=voice.phase!=="idle";const reading=!!voice.speakingId || !!voice.pendingId;
  const mood=voice.phase==="listening"?"listening":busy?"thinking":voice.speakingId||speaking?"speaking":"idle";
  return <div className="stela-widget">
    {!open && <div className="stela-launcher-group"><span className="stela-invitation"><strong>Uma ajuda por aqui?</strong><span>Converse com a Stela<Sparkles size={12}/></span></span><button ref={launcher} className="stela-launcher" aria-label="Conversar com a Stela" aria-expanded={open} aria-controls="stela-chat-panel" onClick={()=>setOpen(true)}><StelaRobot mood={speaking?"speaking":"idle"}/><span className="stela-launcher-name">Stela<span/></span></button></div>}
    {open && <section id="stela-chat-panel" className="stela-panel" role="dialog" aria-modal="false" aria-labelledby="stela-title">
      <header className="stela-header"><span className="stela-header-avatar"><StelaRobot mood={mood}/></span><div><div className="stela-name-row"><h2 id="stela-title" ref={heading} tabIndex={-1}>Stela<span>.</span></h2><span className="stela-mode">{engine==="ai"?"IA":"GUIA"}</span></div><p>Sua assistente no FleetOps</p></div><div className="stela-header-buttons">{audience.isMaster&&<button type="button" aria-label={settingsVisible?"Voltar à conversa da Stela":"Configurar voz da Stela"} title={settingsVisible?"Voltar à conversa":"Configurar voz · Master"} aria-expanded={settingsVisible} disabled={busy} onClick={()=>{voiceController.current?.suspend();setVoiceSettings(value=>!value);}}><Settings2 size={16}/></button>}<button aria-label="Iniciar nova conversa com a Stela" title="Nova conversa" disabled={busy} onClick={()=>{voiceController.current?.suspend();setMessages([]);speechTickets.current.clear();setVoiceSettings(false);setError("");setDraft("");input.current?.focus();}}><RotateCcw size={16}/></button><button aria-label="Minimizar conversa com a Stela" onClick={close}><Minimize2 size={18}/></button></div></header>
      <div className="stela-context"><span><span className="stela-context-dot"/>{profile}</span><span>{formatDate(date)} · {cycle}</span></div>
      <div className="stela-voice-toolbar"><button type="button" role="switch" aria-label="Respostas por voz da Stela" aria-checked={voice.enabled} className={"stela-voice-toggle"+(voice.enabled?" enabled":"")} disabled={!voice.synthesis||settingsVisible} onClick={()=>voiceController.current?.setEnabled(!voice.enabled)}>{voice.enabled?<Volume2 size={14}/>:<VolumeX size={14}/>}<span>Respostas por voz<strong>{voice.enabled?"Ativadas":"Desativadas"}</strong></span><span className="stela-voice-switch-thumb"/></button><div>{reading?<button type="button" aria-label="Parar a voz da Stela" title="Parar voz" onClick={()=>voiceController.current?.stopSpeaking()}><Square size={13}/></button>:<button type="button" aria-label="Testar voz da Stela" title="Testar voz" disabled={!voice.synthesis || busy || capturing || settingsVisible} onClick={()=>voiceController.current?.speak("Olá! Eu sou a Stela. Posso ajudar você por texto e por voz.","voice-test")}><Play size={14}/></button>}<details className="stela-voice-help"><summary aria-label="Sobre o microfone e a voz da Stela"><CircleHelp size={14}/></summary><p>{speech.provider==="elevenlabs"?"As respostas escolhidas para leitura são enviadas à ElevenLabs para gerar áudio, conforme as configurações da conta. ":"A leitura usa as vozes disponíveis no dispositivo. "}O navegador pode usar um serviço externo para transcrever sua fala. O FleetOps recebe o texto enviado no chat e não grava seu microfone. Confira a transcrição antes de enviar.</p></details></div></div>
      {(voice.message||voice.error||!voice.recognition||!voice.synthesis)&&<div className={"stela-voice-feedback"+(voice.error?" error":"")+(capturing?" capturing":"")} role={voice.error?"alert":"status"}>{voice.phase==="listening"&&<span className="stela-listening-bars" aria-hidden="true"><i/><i/><i/><i/></span>}<span>{voice.error||voice.message||(!voice.recognition?"Ditado indisponível neste navegador. Você pode continuar digitando.":"Leitura em voz alta indisponível neste navegador. A resposta continua no chat.")}</span>{(voice.error||voice.message)&&!capturing&&<button type="button" aria-label="Fechar aviso de voz" onClick={()=>voiceController.current?.clearFeedback()}><X size={12}/></button>}</div>}
      <div className="stela-voice-source">{speech.provider==="elevenlabs"?"ElevenLabs · "+speech.voiceName:"Voz do dispositivo"}</div>
      <div className="stela-conversation" role={settingsVisible?"region":"log"} aria-live="polite" aria-label={settingsVisible?"Configuração da voz da Stela":"Conversa com a Stela"} aria-relevant="additions text">
        {settingsVisible?<StelaVoiceSettings fetcher={fetcher} onSaved={()=>setMetadataAttempt(value=>value+1)}/>:<>
        {!messages.length && <div className="stela-welcome"><div className="stela-welcome-art"><span className="stela-orbit stela-orbit-one"/><span className="stela-orbit stela-orbit-two"/><StelaRobot/><span className="stela-twinkle stela-twinkle-one">✦</span><span className="stela-twinkle stela-twinkle-two">✧</span></div><span className="stela-eyebrow">PRAZER, EU SOU A STELA</span><h3>Vamos facilitar<br/>sua operação?</h3><p>Posso explicar a ferramenta, tirar dúvidas e ajudar você a encontrar o próximo passo.</p><div className="stela-suggested"><span>Você pode começar por aqui</span>{suggestions.map(question=><button key={question} disabled={!ready || busy || capturing} onClick={()=>void send(question)}><CircleHelp size={15}/><span>{question}</span><ChevronRight size={15}/></button>)}</div></div>}
        {messages.map(message=><article key={message.id} className={"stela-message "+message.role} aria-label={message.role==="user"?"Sua mensagem":"Resposta da Stela"}>{message.role==="assistant"&&<span className="stela-message-name"><Sparkles size={12}/>Stela<span>{message.reply?.engine==="ai"?"IA":"Base de ajuda"}</span></span>}<p>{message.content}</p>{message.reply?.notice&&<small className="stela-reply-notice">{message.reply.notice}</small>}{message.reply&&<div className="stela-sources"><ShieldCheck size={11}/><span>Guia FleetOps{message.reply.sources.length?" · "+message.reply.sources.map(source=>source.title).join(" / "):""}</span></div>}{!!message.reply?.actions.length&&<div className="stela-message-actions">{message.reply.actions.map(action=><button key={action.view} onClick={()=>navigate(action.view)}>{action.label}<ArrowUpRight size={13}/></button>)}</div>}{message.role==="assistant"&&<button type="button" className="stela-read-reply" disabled={!voice.synthesis||busy||capturing} aria-label={voice.speakingId===message.id||voice.pendingId===message.id?"Parar leitura da resposta":"Ouvir resposta da Stela"} onClick={()=>{setSpeaking(false);if(voice.speakingId===message.id||voice.pendingId===message.id)voiceController.current?.stopSpeaking();else voiceController.current?.speak(message.content,message.id);}}>{voice.speakingId===message.id||voice.pendingId===message.id?<Square size={12}/>:<Volume2 size={13}/>}<span>{voice.pendingId===message.id?"Preparando…":voice.speakingId===message.id?"Parar leitura":"Ouvir"}</span></button>}</article>)}
        {busy&&<div className="stela-thinking" role="status"><span/><span/><span/><small>Stela está consultando…</small></div>}
        {error&&<div className="stela-error" role="alert"><span>{error}</span>{!ready&&<button onClick={()=>setMetadataAttempt(value=>value+1)}>Tentar conectar</button>}<button className="stela-dismiss-error" aria-label="Fechar aviso da Stela" onClick={()=>setError("")}><X size={13}/></button></div>}
        <div ref={end}/>
        </>}
      </div>
      {!settingsVisible&&!!messages.length&&<div className="stela-followups" aria-label="Perguntas sugeridas">{suggestions.slice(0,2).map(question=><button key={question} disabled={busy || !ready || capturing} onClick={()=>void send(question)}>{question}<ChevronRight size={12}/></button>)}</div>}
      {!settingsVisible&&<form className="stela-composer" onSubmit={event=>{event.preventDefault();void send();}}><label className="sr-only" htmlFor="stela-question">Sua mensagem para a Stela</label><textarea ref={input} id="stela-question" rows={2} maxLength={1200} value={draft} disabled={busy || !ready || capturing} placeholder={capturing?"Estou ouvindo…":ready?"Digite ou toque no microfone…":"Conectando à Stela…"} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/><div className="stela-composer-buttons"><button type="button" className={"stela-microphone"+(capturing?" listening":"")} aria-label={capturing?"Parar ditado da Stela":"Falar com a Stela"} aria-pressed={capturing} disabled={busy||!ready||!voice.recognition||(!capturing&&draft.length>=1200)} title={capturing?"Parar e revisar o texto":voice.recognition?"Falar com a Stela e ativar respostas por voz":"Ditado não disponível neste navegador"} onClick={()=>{setSpeaking(false);if(capturing)voiceController.current?.stopListening();else voiceController.current?.startListening(draft);}}>{voice.phase==="starting"||voice.phase==="finishing"?<LoaderCircle className="spin" size={17}/>:capturing?<Square size={14}/>:<Mic size={18}/>}</button>{busy?<button type="button" className="stela-stop" aria-label="Interromper resposta da Stela" onClick={()=>pending.current?.abort()}><Square size={15}/></button>:<button type="submit" aria-label="Enviar mensagem para a Stela" disabled={!ready||!draft.trim()||capturing}>{!ready?<LoaderCircle className="spin" size={18}/>:<ArrowUp size={20}/>}</button>}</div></form>}
      <footer className="stela-footer"><ShieldCheck size={11}/><span>{engine==="ai"?"IA com conhecimento do FleetOps. Confira informações importantes.":configured?"Base de ajuda do FleetOps · IA indisponível no momento.":"Base de ajuda do FleetOps · IA generativa aguarda ativação."}</span></footer>
    </section>}
  </div>;
}
