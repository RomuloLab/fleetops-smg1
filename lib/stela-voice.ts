export type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } };
export type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
export type StelaRecognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
export type StelaVoicePlatform = {
  secure: boolean;
  createRecognition: (() => StelaRecognition) | null;
  synthesis: Pick<SpeechSynthesis, "speak" | "cancel" | "resume" | "getVoices"> | null;
  createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
};
export type StelaVoiceState = {
  recognition: boolean; synthesis: boolean; phase: "idle" | "starting" | "listening" | "finishing";
  enabled: boolean; speakingId: string | null; pendingId: string | null; message: string; error: string;
};
export type StelaRemoteSpeech = (input: { text: string; id: string; signal: AbortSignal; onStart: () => void; onEnd: () => void; onError: (message: string) => void }) => Promise<() => void>;
export const INITIAL_STELA_VOICE: StelaVoiceState = { recognition: false, synthesis: false, phase: "idle", enabled: false, speakingId: null, pendingId: null, message: "", error: "" };
export function browserStelaVoicePlatform(): StelaVoicePlatform {
  const target = window as typeof window & { SpeechRecognition?: new () => StelaRecognition; webkitSpeechRecognition?: new () => StelaRecognition };
  const Recognition = target.SpeechRecognition ?? target.webkitSpeechRecognition;
  return { secure: window.isSecureContext, createRecognition: Recognition ? () => new Recognition() : null,
    synthesis: "speechSynthesis" in window ? window.speechSynthesis : null,
    createUtterance: typeof window.SpeechSynthesisUtterance === "function" ? text => new window.SpeechSynthesisUtterance(text) : null };
}
export function speechChunks(value: string): string[] {
  let text = value.replace(/[`*#]/g, "").replace(/\s+/g, " ").trim().slice(0,6000); const chunks: string[]=[];
  while (text.length > 220) {
    const part=text.slice(0,220);const punctuation=Math.max(part.lastIndexOf(". "),part.lastIndexOf("? "),part.lastIndexOf("! "),part.lastIndexOf("; "));
    const space=part.lastIndexOf(" ");const cut=punctuation>=80?punctuation+1:space>0?space:220;
    chunks.push(text.slice(0,cut).trim());text=text.slice(cut).trim();
  }
  if(text)chunks.push(text);return chunks;
}
const recognitionErrors: Record<string,string> = {
  "not-allowed":"O microfone foi bloqueado. Permita o acesso nas configurações do site ou digite sua pergunta.",
  "service-not-allowed":"O navegador não liberou o reconhecimento de voz. Abra o FleetOps em uma guia e confira a permissão do microfone.",
  "audio-capture":"Não encontrei um microfone disponível. Confira o dispositivo ou digite sua pergunta.",
  "no-speech":"Não consegui ouvir sua fala. Toque no microfone para tentar novamente.",
  "network":"O reconhecimento de voz perdeu a conexão. Seu texto foi preservado; tente novamente ou continue digitando.",
  "language-not-supported":"O reconhecimento em português não está disponível neste navegador. Continue pelo texto.",
};
export class StelaVoice {
  state: StelaVoiceState;
  private recognizer: StelaRecognition | null=null;
  private recognitionTimer: ReturnType<typeof setTimeout> | undefined;
  private speechTimer: ReturnType<typeof setTimeout> | undefined;
  private speechGeneration=0; private disposed=false;
  private utterance: SpeechSynthesisUtterance | null=null;
  private remote:StelaRemoteSpeech|null=null;private remoteAbort:AbortController|null=null;private remoteStop:(()=>void)|null=null;
  private platform:StelaVoicePlatform; private change:(state:StelaVoiceState)=>void; private transcript:(value:string)=>void;
  constructor(platform:StelaVoicePlatform, change:(state:StelaVoiceState)=>void, transcript:(value:string)=>void) {
    this.platform=platform;this.change=change;this.transcript=transcript;
    this.state={...INITIAL_STELA_VOICE,recognition:platform.secure && !!platform.createRecognition,synthesis:!!platform.synthesis && !!platform.createUtterance};
  }
  start(){this.publish({});try{this.platform.synthesis?.getVoices();}catch{/* The default voice can still become available on playback. */}}
  private publish(next:Partial<StelaVoiceState>){if(this.disposed)return;this.state={...this.state,...next};this.change(this.state);}
  clearFeedback(){this.publish({message:"",error:""});}
  setRemoteSpeech(remote:StelaRemoteSpeech|null){this.stopSpeaking();this.remote=remote;const synthesis=!!remote||!!this.platform.synthesis&&!!this.platform.createUtterance;this.publish({synthesis,enabled:this.state.enabled&&synthesis});}
  setEnabled(enabled:boolean){if(!this.state.synthesis)return;if(!enabled)this.stopSpeaking();this.publish({enabled,error:"",message:enabled?"As próximas respostas também serão lidas em voz alta.":"Respostas por voz desativadas. O chat continua disponível."});}
  startListening(draft:string){
    if(this.disposed || this.state.phase!=="idle")return;
    if(!this.state.recognition){this.publish({error:this.platform.secure?"Este navegador não oferece ditado por voz. Você pode digitar sua pergunta.":"Para usar o microfone, abra o endereço seguro do FleetOps com HTTPS.",message:""});return;}
    this.stopSpeaking();const prefix=draft.trim();let heard=false;let truncated=false;
    let recognition:StelaRecognition;
    try{recognition=this.platform.createRecognition!();}catch{this.publish({error:"Não consegui iniciar o microfone. Confira as permissões do navegador."});return;}
    this.recognizer=recognition;recognition.lang="pt-BR";recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
    if(this.state.synthesis)this.publish({enabled:true});
    this.publish({phase:"starting",error:"",message:"Aguardando o microfone. Se o navegador solicitar, permita o acesso."});
    const current=()=>!this.disposed && this.recognizer===recognition;
    recognition.onstart=()=>{if(!current())return;clearTimeout(this.recognitionTimer);this.publish({phase:"listening",message:"Estou ouvindo. Ao terminar, toque em Parar e confira o texto."});this.recognitionTimer=setTimeout(()=>this.stopListening(),60000);};
    recognition.onresult=event=>{
      if(!current())return;
      const recognized=Array.from(event.results,result=>result[0]?.transcript ?? "").join(" ").trim();if(!recognized)return;
      heard=true;const combined=(prefix?prefix+" ":"")+recognized;truncated=combined.length>1200;
      this.transcript(combined.slice(0,1200));
      if(truncated){this.publish({message:"O texto chegou ao limite de 1.200 caracteres. Revise antes de enviar."});this.stopListening();}
    };
    recognition.onerror=event=>{if(!current())return;this.releaseRecognition(true);this.publish({phase:"idle",message:"",error:recognitionErrors[event.error] || "Não consegui concluir o ditado. O texto já captado foi preservado."});};
    recognition.onend=()=>{if(!current())return;this.releaseRecognition(false);this.publish({phase:"idle",message:truncated?"O texto chegou ao limite de 1.200 caracteres. Revise antes de enviar.":heard?"Texto pronto. Confira a transcrição e toque em Enviar.":"Nenhuma fala foi captada. Toque no microfone para tentar novamente."});};
    this.recognitionTimer=setTimeout(()=>{if(!current())return;this.releaseRecognition(true);this.publish({phase:"idle",message:"",error:"O microfone não iniciou. Confira a permissão e tente novamente."});},30000);
    try{recognition.start();}catch{this.releaseRecognition(true);this.publish({phase:"idle",message:"",error:"Não consegui iniciar o microfone. Confira as permissões e tente novamente."});}
  }
  stopListening(){
    if(!this.recognizer)return;
    if(this.state.phase==="starting"){this.cancelListening();return;}
    if(this.state.phase==="finishing")return;
    const recognition=this.recognizer;clearTimeout(this.recognitionTimer);this.publish({phase:"finishing",message:"Finalizando a transcrição…"});
    this.recognitionTimer=setTimeout(()=>{if(this.recognizer!==recognition)return;this.releaseRecognition(true);this.publish({phase:"idle",message:"Confira o texto captado e toque em Enviar."});},4000);
    try{recognition.stop();}catch{this.cancelListening();}
  }
  private releaseRecognition(abort:boolean){const recognition=this.recognizer;this.recognizer=null;clearTimeout(this.recognitionTimer);if(!recognition)return;recognition.onstart=null;recognition.onend=null;recognition.onresult=null;recognition.onerror=null;if(abort)try{recognition.abort();}catch{/* Already stopped. */}}
  cancelListening(){const active=this.state.phase!=="idle";this.releaseRecognition(true);this.publish({phase:"idle",...(active?{message:"Ditado pausado. O texto já captado foi preservado."}:{})});}
  speak(text:string,id:string){
    if(this.disposed)return;
    if(!this.state.synthesis){this.publish({error:"A leitura em voz alta não está disponível neste navegador. A resposta continua no chat."});return;}
    if(this.remote){this.speakRemote(text,id);return;}
    this.cancelListening();this.stopSpeaking();const chunks=speechChunks(text);if(!chunks.length)return;
    const generation=++this.speechGeneration;this.publish({pendingId:id,error:"",message:"Preparando a voz da Stela…"});
    const current=()=>!this.disposed && generation===this.speechGeneration;
    const play=(index:number)=>{
      if(!current())return;
      let utterance:SpeechSynthesisUtterance;
      try{utterance=this.platform.createUtterance!(chunks[index]);}catch{this.stopSpeaking();this.publish({error:"Não consegui preparar a leitura. Você pode continuar pelo texto."});return;}
      this.utterance=utterance;utterance.lang="pt-BR";utterance.rate=1;utterance.pitch=1.05;
      try{const voices=this.platform.synthesis!.getVoices();const voice=voices.find(item=>item.lang.replace("_","-").toLowerCase()==="pt-br") ?? voices.find(item=>item.lang.toLowerCase().startsWith("pt"));if(voice)utterance.voice=voice;}catch{/* Use the browser's voice for pt-BR if enumeration is unavailable. */}
      clearTimeout(this.speechTimer);this.speechTimer=setTimeout(()=>{if(!current())return;this.stopSpeaking();this.publish({error:"A leitura não foi concluída. Toque em Ouvir para tentar novamente.",message:""});},Math.max(20000,chunks[index].length*180));
      utterance.onstart=()=>{if(current())this.publish({pendingId:null,speakingId:id,message:"Stela está lendo a resposta. Você pode parar a qualquer momento."});};
      utterance.onend=()=>{if(!current())return;clearTimeout(this.speechTimer);utterance.onstart=null;utterance.onend=null;utterance.onerror=null;this.utterance=null;if(index+1<chunks.length)play(index+1);else{this.speechGeneration++;this.publish({pendingId:null,speakingId:null,message:"Leitura concluída."});}};
      utterance.onerror=event=>{if(!current())return;this.stopSpeaking();this.publish({error:event.error==="not-allowed"?"O navegador bloqueou a reprodução automática. Toque em Ouvir na resposta.":"Não consegui reproduzir a voz. Confira o áudio do dispositivo ou continue pelo texto.",message:""});};
      try{this.platform.synthesis!.resume();this.platform.synthesis!.speak(utterance);}catch{if(current()){this.stopSpeaking();this.publish({error:"O navegador não conseguiu reproduzir a voz. Toque em Ouvir para tentar novamente.",message:""});}}
    };
    play(0);
  }
  private speakRemote(text:string,id:string){
    this.cancelListening();this.stopSpeaking();const remote=this.remote;if(!remote)return;
    const generation=++this.speechGeneration;const controller=new AbortController();this.remoteAbort=controller;
    const current=()=>!this.disposed&&generation===this.speechGeneration;
    const fail=(message:string)=>{if(!current())return;this.stopSpeaking();this.publish({error:message,message:""});};
    this.publish({pendingId:id,error:"",message:"Preparando a voz da Stela na ElevenLabs…"});
    this.speechTimer=setTimeout(()=>fail("A voz demorou para chegar. Toque em Ouvir para tentar novamente."),22000);
    void Promise.resolve().then(()=>remote({text,id,signal:controller.signal,onStart:()=>{
      if(!current())return;clearTimeout(this.speechTimer);
      this.speechTimer=setTimeout(()=>fail("A leitura chegou ao tempo limite. Sua resposta continua no chat."),Math.min(600000,Math.max(30000,text.length*200)));
      this.publish({pendingId:null,speakingId:id,message:"Stela está lendo com a voz ElevenLabs. Você pode parar a qualquer momento."});
    },onEnd:()=>{if(!current())return;this.stopSpeaking();this.publish({message:"Leitura concluída."});},onError:fail}))
      .then(stop=>{if(current())this.remoteStop=stop;else stop();})
      .catch(cause=>{if(current())fail(cause instanceof Error?cause.message:"Não consegui reproduzir a voz. Sua resposta continua no chat.");});
  }
  stopSpeaking(){const active=!!this.utterance || !!this.state.pendingId || !!this.state.speakingId;const native=!!this.utterance;this.speechGeneration++;clearTimeout(this.speechTimer);this.remoteAbort?.abort();this.remoteAbort=null;this.remoteStop?.();this.remoteStop=null;if(this.utterance){this.utterance.onstart=null;this.utterance.onend=null;this.utterance.onerror=null;this.utterance=null;}if(native)try{this.platform.synthesis?.cancel();}catch{/* The system may already have stopped audio. */}this.publish({speakingId:null,pendingId:null,...(active?{message:""}:{})});}
  suspend(){this.cancelListening();this.stopSpeaking();this.publish({message:""});}
  dispose(){this.suspend();this.disposed=true;}
}
