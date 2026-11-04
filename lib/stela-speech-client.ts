import type { StelaRemoteSpeech } from "./stela-voice";
type AudioPlayer=Pick<HTMLAudioElement,"play"|"pause"|"src"|"onplaying"|"onended"|"onerror">;
type Options={carrier?:string;accessKey?:string;ticket:(id:string)=>string|undefined;fetcher?:typeof fetch;audio?:(url:string)=>AudioPlayer;urls?:Pick<typeof URL,"createObjectURL"|"revokeObjectURL">};
export function stelaCloudSpeech(options:Options){
  const fetcher=options.fetcher??fetch;const urls=options.urls??URL;const audioFactory=options.audio??(url=>new Audio(url));
  const cache=new Map<string,Blob>();let total=0;const stops=new Set<()=>void>();
  const play:StelaRemoteSpeech=async({id,signal,onStart,onEnd,onError})=>{
    if(signal.aborted)throw new DOMException("Cancelled","AbortError");
    let blob=cache.get(id);
    if(!blob){
      const ticket=options.ticket(id);if(id!=="voice-test"&&!ticket)throw new Error("Envie uma nova pergunta à Stela para ouvir essa resposta com a ElevenLabs.");
      const response=await fetcher("/api/stela/voz",{method:"POST",headers:{"Content-Type":"application/json",...(options.accessKey?{Authorization:"Bearer "+options.accessKey}:{})},body:JSON.stringify({...(options.carrier?{carrier:options.carrier}:{}),...(id==="voice-test"?{test:true}:{ticket})}),signal,cache:"no-store"});
      if(!response.ok){let message="Não consegui gerar a voz. Sua resposta continua no chat.";try{const body=await response.json() as {error?:unknown};if(typeof body.error==="string")message=body.error;}catch{/* Keep the generic message. */}throw new Error(message);}
      blob=await response.blob();if(!blob.type.startsWith("audio/mpeg")||!blob.size||blob.size>8*1024*1024)throw new Error("O áudio não chegou completo. Sua resposta continua no chat.");
      if(signal.aborted)throw new DOMException("Cancelled","AbortError");
      cache.set(id,blob);total+=blob.size;
      while(cache.size>6||total>8*1024*1024){const oldest=cache.keys().next().value as string;total-=cache.get(oldest)!.size;cache.delete(oldest);}
    }
    if(signal.aborted)throw new DOMException("Cancelled","AbortError");
    const url=urls.createObjectURL(blob);let audio:AudioPlayer;
    try{audio=audioFactory(url);}catch{urls.revokeObjectURL(url);throw new Error("Este navegador não conseguiu preparar o áudio.");}
    let stopped=false;
    const cleanup=()=>{if(stopped)return;stopped=true;audio.onplaying=null;audio.onended=null;audio.onerror=null;signal.removeEventListener("abort",cleanup);audio.pause();audio.src="";urls.revokeObjectURL(url);stops.delete(cleanup);};
    stops.add(cleanup);signal.addEventListener("abort",cleanup,{once:true});
    audio.onplaying=()=>{if(!stopped&&!signal.aborted)onStart();};
    audio.onended=()=>{if(stopped)return;cleanup();onEnd();};
    audio.onerror=()=>{if(stopped)return;cleanup();onError("Não consegui reproduzir a voz. Sua resposta continua no chat.");};
    try{await audio.play();}catch{cleanup();throw new Error("O navegador bloqueou o áudio. Toque em Ouvir na resposta para reproduzir.");}
    return cleanup;
  };
  return {play,dispose(){for(const stop of [...stops])stop();cache.clear();total=0;}};
}
