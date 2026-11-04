import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { stelaVoiceSettings, stelaVoiceUsage } from "@/db/schema";
import { consumeEmailLimit, emailSecret, EmailAccessError } from "./email-security";
import { operationDate } from "./model";
import { elevenlabsFailure } from "./elevenlabs-errors";
import type { StelaRole } from "./stela-knowledge";
import { speechText, STELA_SPEECH_MODEL, STELA_SPEECH_TEST, type SpeechInput, type StelaSpeechMetadata, type StelaVoiceOption, type StelaVoiceSettingsInfo, type VoiceSettingsInput } from "./stela-speech-model";

type VoiceRole = StelaRole & { scope: string };
const rowSettings = async () => (await getDb().select().from(stelaVoiceSettings).where(eq(stelaVoiceSettings.id,"elevenlabs")).limit(1))[0];
const period = () => operationDate().slice(0,7);
async function encryptionKey(usage: KeyUsage[]) {
  const source = await crypto.subtle.importKey("raw",new TextEncoder().encode(emailSecret()),"HKDF",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:new TextEncoder().encode("fleetops-stela-voice-v1"),info:new TextEncoder().encode("elevenlabs-api-key")},source,{name:"AES-GCM",length:256},false,usage);
}
async function encryptKey(value: string) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(["encrypt"]),new TextEncoder().encode(value));
  return JSON.stringify({v:1,iv:Array.from(iv),value:Array.from(new Uint8Array(encrypted))});
}
async function decryptKey(value: string) {
  try {
    const stored=JSON.parse(value) as {v:number;iv:number[];value:number[]};
    if(stored.v!==1)throw new Error("Version");
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(stored.iv)},await encryptionKey(["decrypt"]),new Uint8Array(stored.value)));
  } catch { throw new EmailAccessError("O master precisa cadastrar novamente a chave da voz da Stela.",503); }
}
export async function getVoiceSettings(): Promise<StelaVoiceSettingsInfo> {
  const row=await rowSettings(); const current=period();
  const usage=(await getDb().select().from(stelaVoiceUsage).where(eq(stelaVoiceUsage.period,current)).limit(1))[0];
  return {configured:!!row,enabled:row?.enabled??false,voiceId:row?.voiceId??"",voiceName:row?.voiceName??"",monthlyLimit:row?.monthlyLimit??5000,
    usedCharacters:usage?.characters??0,period:current,revision:row?.revision??0,updatedAt:row?.updatedAt??null,
    secretReady:!!env.BETTER_AUTH_SECRET&&env.BETTER_AUTH_SECRET.length>=32,model:STELA_SPEECH_MODEL};
}
export async function speechMetadata(): Promise<StelaSpeechMetadata> {
  const row=await rowSettings();
  return row?.enabled&&row.voiceId ? {provider:"elevenlabs",voiceName:row.voiceName||"Voz da Stela",revision:row.revision} : {provider:"browser"};
}
async function providerError(response: Response, stage: "catalog" | "speech"): Promise<EmailAccessError> {
  const failure = await elevenlabsFailure(response, stage);
  console.warn("stela.elevenlabs.failure", JSON.stringify(failure.diagnostic));
  return new EmailAccessError(failure.message, failure.status);
}
async function voiceList(apiKey: string, search=""): Promise<StelaVoiceOption[]> {
  const url=new URL("https://api.elevenlabs.io/v2/voices");url.searchParams.set("page_size","100");if(search)url.searchParams.set("search",search.slice(0,80));
  let response: Response;
  try { response=await fetch(url,{headers:{"xi-api-key":apiKey},signal:AbortSignal.timeout(12000),redirect:"manual"}); }
  catch { throw new EmailAccessError("Não consegui consultar as vozes. Confira a conexão e tente novamente.",503); }
  if(!response.ok)throw await providerError(response,"catalog");
  const value=await response.json() as {voices?:{voice_id?:unknown;name?:unknown;labels?:Record<string,unknown>;verified_languages?:{language?:unknown;locale?:unknown;accent?:unknown}[]}[]};
  if(!Array.isArray(value.voices))throw new EmailAccessError("A lista de vozes não chegou completa.",503);
  return value.voices.slice(0,150).filter(v=>typeof v.voice_id==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(v.voice_id)&&typeof v.name==="string").map(v=>{
    const portuguese=v.verified_languages?.find(l=>l.language==="pt"||String(l.locale||"").toLowerCase().startsWith("pt"));
    const label=(name:string)=>typeof v.labels?.[name]==="string"?String(v.labels[name]).slice(0,80):"";
    return {id:v.voice_id as string,name:(v.name as string).slice(0,120),language:portuguese?"pt":label("language"),accent:portuguese?String(portuguese.accent||portuguese.locale||"").slice(0,80):label("accent"),gender:label("gender")};
  }).sort((a,b)=>Number(b.language==="pt")-Number(a.language==="pt")||a.name.localeCompare(b.name,"pt-BR"));
}
export async function listVoiceOptions(search="") { const row=await rowSettings();if(!row)throw new EmailAccessError("Cadastre a chave da ElevenLabs primeiro.");return voiceList(await decryptKey(row.encryptedKey),search); }
export async function saveVoiceSettings(input: VoiceSettingsInput) {
  emailSecret(); const db=getDb();const previous=await rowSettings();
  if(previous?.changeId===input.changeId){
    if(previous.voiceId!==input.voiceId||previous.voiceName!==input.voiceName||previous.enabled!==input.enabled||previous.monthlyLimit!==input.monthlyLimit||(input.apiKey&&await decryptKey(previous.encryptedKey)!==input.apiKey))throw new EmailAccessError("Essa atualização já foi utilizada. Atualize a configuração para editar.",409);
    return getVoiceSettings();
  }
  if((previous?.revision??0)!==input.revision)throw new EmailAccessError("A voz foi alterada em outra tela. Atualize para conferir.",409);
  if(input.enabled&&!input.voiceId)throw new EmailAccessError("Selecione uma voz antes de ativar a ElevenLabs.");
  if(input.apiKey&&!/^[A-Za-z0-9_-]{20,512}$/.test(input.apiKey))throw new EmailAccessError("Informe uma chave válida da ElevenLabs.");
  if(!previous&&!input.apiKey)throw new EmailAccessError("Informe a chave da ElevenLabs.");
  if(input.apiKey)await voiceList(input.apiKey);
  const values={encryptedKey:input.apiKey?await encryptKey(input.apiKey):previous!.encryptedKey,voiceId:input.voiceId,voiceName:input.voiceName,enabled:input.enabled,
    monthlyLimit:input.monthlyLimit,revision:input.revision+1,changeId:input.changeId,updatedAt:new Date().toISOString()};
  const saved=previous?await db.update(stelaVoiceSettings).set(values).where(and(eq(stelaVoiceSettings.id,"elevenlabs"),eq(stelaVoiceSettings.revision,input.revision))).returning():await db.insert(stelaVoiceSettings).values({id:"elevenlabs",...values}).onConflictDoNothing().returning();
  if(!saved.length)throw new EmailAccessError("A voz foi alterada em outra tela. Atualize para conferir.",409);
  return getVoiceSettings();
}
function principal(role: VoiceRole) { return role.scope+"|"+JSON.stringify({master:role.isMaster,permissions:[...role.permissions].sort()}); }
async function sign(value: string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(emailSecret()),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("fleetops-stela-speech-v1:"+value)));
}
export async function createSpeechTicket(role: VoiceRole, text: string): Promise<string|undefined> {
  if((await speechMetadata()).provider!=="elevenlabs")return undefined;
  const body=Buffer.from(JSON.stringify({v:1,principal:principal(role),text:speechText(text),expires:Date.now()+3600000})).toString("base64url");
  return body+"."+(await sign(body)).toString("base64url");
}
async function ticketText(role: VoiceRole, ticket: string) {
  const parts=ticket.split(".");if(parts.length!==2||parts.some(p=>!/^[-_a-zA-Z0-9]+$/.test(p)))throw new EmailAccessError("Atualize a conversa para ouvir essa resposta.",403);
  const supplied=Buffer.from(parts[1],"base64url"),expected=await sign(parts[0]);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new EmailAccessError("Atualize a conversa para ouvir essa resposta.",403);
  let value:{v?:unknown;principal?:unknown;text?:unknown;expires?:unknown};
  try{value=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));}catch{throw new EmailAccessError("Atualize a conversa para ouvir essa resposta.",403);}
  if(value.v!==1||value.principal!==principal(role)||typeof value.expires!=="number"||value.expires<Date.now()||typeof value.text!=="string"||!value.text||value.text.length>6000)throw new EmailAccessError("Envie uma nova pergunta à Stela para gerar a voz novamente.",403);
  return value.text;
}
export async function generateStelaSpeech(role: VoiceRole, input: SpeechInput, signal: AbortSignal) {
  const row=await rowSettings();if(!row||!row.voiceId||(!row.enabled&&!("test" in input&&role.isMaster)))throw new EmailAccessError("A voz ElevenLabs aguarda configuração e ativação do master.",409);
  const text="test" in input?STELA_SPEECH_TEST:await ticketText(role,input.ticket);
  await consumeEmailLimit("stela-speech-minute",role.scope,6,60);
  if(text.length>row.monthlyLimit)throw new EmailAccessError("O limite mensal de voz da Stela foi atingido. O master pode conferir a configuração.",429);
  const db=getDb();const [reserved]=await db.insert(stelaVoiceUsage).values({period:period(),characters:text.length}).onConflictDoUpdate({target:stelaVoiceUsage.period,
    set:{characters:sql`${stelaVoiceUsage.characters}+${text.length}`},setWhere:sql`${stelaVoiceUsage.characters}+${text.length} <= ${row.monthlyLimit}`}).returning();
  if(!reserved)throw new EmailAccessError("O limite mensal de voz da Stela foi atingido. O master pode conferir a configuração.",429);
  const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
  const timeout=setTimeout(abort,18000);
  try {
    const key=await decryptKey(row.encryptedKey);
    const response=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(row.voiceId)+"?output_format=mp3_44100_128",{
      method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json",Accept:"audio/mpeg"},
      body:JSON.stringify({text,model_id:STELA_SPEECH_MODEL}),signal:controller.signal,redirect:"manual"});
    if(!response.ok)throw await providerError(response,"speech");
    if(!response.headers.get("content-type")?.toLowerCase().startsWith("audio/mpeg"))throw new EmailAccessError("A ElevenLabs não retornou um áudio válido.",503);
    const reader=response.body?.getReader();if(!reader)throw new EmailAccessError("O áudio não chegou completo.",503);
    const chunks:Uint8Array[]=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>8*1024*1024){await reader.cancel();throw new EmailAccessError("O áudio ficou muito extenso. Envie uma pergunta mais curta.",503);}chunks.push(value);}}
    finally{reader.releaseLock();}
    if(!length)throw new EmailAccessError("O áudio não chegou completo.",503);
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return new Response(bytes,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store","Content-Length":String(length),"X-Content-Type-Options":"nosniff"}});
  } catch(cause) {if(cause instanceof EmailAccessError)throw cause;throw new EmailAccessError("Não consegui gerar a voz agora. Sua resposta continua no chat.",503);}
  finally{clearTimeout(timeout);signal.removeEventListener("abort",abort);}
}
