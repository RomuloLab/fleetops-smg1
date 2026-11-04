import { json } from "@/lib/server";
import { EmailAccessError, requireEmailOrigin } from "@/lib/email-security";
import { stelaInputSchema } from "@/lib/stela-model";
import { answerStela, stelaAccess, stelaMetadata } from "@/lib/stela-server";
import { createSpeechTicket, speechMetadata } from "@/lib/stela-speech-server";
export const dynamic = "force-dynamic";
function failure(cause: unknown) {
  const error = cause instanceof EmailAccessError ? cause : new EmailAccessError("Não consegui responder agora. Tente novamente em instantes.",503);
  const response = json({error:error.message,...(error.retryAfter?{retryAfter:error.retryAfter}:{})},error.status);
  if (error.retryAfter) response.headers.set("Retry-After",String(error.retryAfter));
  return response;
}
export async function GET(request: Request) {
  try { const carrier = new URL(request.url).searchParams.get("transportadora") || undefined; return json({...stelaMetadata(await stelaAccess(request,carrier)),speech:await speechMetadata()}); }
  catch(cause) { return failure(cause); }
}
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new EmailAccessError("Envie sua pergunta no formato correto.");
    const reader=request.body?.getReader(); if(!reader)throw new EmailAccessError("Escreva uma pergunta para a Stela.");
    const chunks:Uint8Array[]=[];let length=0;
    try { while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>40000){await reader.cancel();throw new EmailAccessError("A conversa ficou muito longa. Inicie uma nova conversa.",413);}chunks.push(value);} }
    finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new EmailAccessError("Não consegui ler a pergunta. Tente novamente.");}
    const input=stelaInputSchema.safeParse(raw);if(!input.success)throw new EmailAccessError("Revise sua pergunta, a data e o ciclo. A conversa pode ter até 12 mensagens e 20 mil caracteres.");
    const role=await stelaAccess(request,input.data.carrier);
    const reply=await answerStela(role,input.data,request.signal);
    return json({...reply,speechTicket:await createSpeechTicket(role,reply.text)});
  }catch(cause){return failure(cause);}
}
