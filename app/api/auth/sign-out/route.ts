import { getEmailAuth } from "@/lib/email-auth";
import { EmailAccessError, requireEmailOrigin } from "@/lib/email-security";
import { json } from "@/lib/server";
import { gatewayOrigin } from "@/lib/gateway-context";
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const response = await getEmailAuth().api.signOut({ headers: request.headers, asResponse: true });
    const nextPath = gatewayOrigin() ? "/login" : "/signout-with-chatgpt?return_to=%2Flogin";
    const result = json({ success: response.ok, nextPath }); for (const cookie of response.headers.getSetCookie()) result.headers.append("Set-Cookie", cookie); return result;
  } catch (cause) { return json({ error: "Não foi possível sair. Tente novamente." }, cause instanceof EmailAccessError ? cause.status : 503); }
}
