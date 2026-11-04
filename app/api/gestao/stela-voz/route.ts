import { getManagerAccess } from "@/lib/manager-access";
import { consumeEmailLimit, EmailAccessError, readEmailInput, requireEmailOrigin } from "@/lib/email-security";
import { getVoiceSettings, listVoiceOptions, saveVoiceSettings } from "@/lib/stela-speech-server";
import { voiceSettingsSchema } from "@/lib/stela-speech-model";
import { json } from "@/lib/server";
export const dynamic="force-dynamic";
function failure(cause:unknown){return json({error:cause instanceof EmailAccessError?cause.message:"Não consegui atualizar a voz da Stela. Tente novamente."},cause instanceof EmailAccessError?cause.status:503);}
export async function GET(request:Request){
  try{
    const master=await getManagerAccess();if(!master?.isMaster)return json({error:"Apenas masters podem configurar a voz da Stela."},403);
    const params=new URL(request.url).searchParams;
    if(params.get("voices")==="1"){
      await consumeEmailLimit("stela-voice-catalog",master.id,12,60);
      return json({voices:await listVoiceOptions(params.get("search")||"")});
    }
    return json({settings:await getVoiceSettings()});
  }catch(cause){return failure(cause);}
}
export async function PUT(request:Request){
  try{
    const master=await getManagerAccess();if(!master?.isMaster)return json({error:"Apenas masters podem configurar a voz da Stela."},403);
    requireEmailOrigin(request);await consumeEmailLimit("stela-voice-settings",master.id,12,600);
    const parsed=voiceSettingsSchema.safeParse(await readEmailInput(request));if(!parsed.success)return json({error:"Confira a chave, a voz e o limite mensal."},400);
    return json({settings:await saveVoiceSettings(parsed.data)});
  }catch(cause){return failure(cause);}
}
