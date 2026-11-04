import { json } from "@/lib/server";
import { EmailAccessError, readEmailInput, requireEmailOrigin } from "@/lib/email-security";
import { speechInputSchema } from "@/lib/stela-speech-model";
import { generateStelaSpeech } from "@/lib/stela-speech-server";
import { stelaAccess } from "@/lib/stela-server";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  try{
    requireEmailOrigin(request);
    const parsed=speechInputSchema.safeParse(await readEmailInput(request,40000));if(!parsed.success)return json({error:"Envie uma nova pergunta à Stela para ouvir a resposta."},400);
    const role=await stelaAccess(request,parsed.data.carrier);
    return await generateStelaSpeech(role,parsed.data,request.signal);
  }catch(cause){
    const error=cause instanceof EmailAccessError?cause:new EmailAccessError("A voz está indisponível. Sua resposta continua no chat.",503);
    const response=json({error:error.message},error.status);if(error.retryAfter)response.headers.set("Retry-After",String(error.retryAfter));return response;
  }
}
