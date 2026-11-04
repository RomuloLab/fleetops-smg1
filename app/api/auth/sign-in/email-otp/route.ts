import { findEmailMember, getEmailAuth, markEmailVerified } from "@/lib/email-auth";
import { verifyCodeSchema } from "@/lib/email-model";
import { consumeEmailLimit, EmailAccessError, readEmailInput, requireEmailOrigin, withEmailOperationLock } from "@/lib/email-security";
import { json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const input = verifyCodeSchema.safeParse(await readEmailInput(request));
    if (!input.success) return json({ error: "Informe o e-mail e os seis números do código." }, 400);
    await consumeEmailLimit("verify-ip", request.headers.get("cf-connecting-ip") || "unknown", 40, 600);
    await consumeEmailLimit("verify-email", input.data.email, 10, 600);
    if (!await findEmailMember(input.data.email)) return json({ error: "Código inválido ou vencido. Confira o cadastro com o master ou solicite outro código." }, 400);
    const response = await withEmailOperationLock(input.data.email, () => getEmailAuth().api.signInEmailOTP({ body: input.data, headers: request.headers, asResponse: true }));
    if (!response.ok) return json({ error: "Código inválido ou vencido. Solicite outro código se necessário." }, response.status === 429 ? 429 : 400);
    await markEmailVerified(input.data.email);
    const result = json({ success: true });
    // Forward only the last policy for each cookie, including the library's
    // after-hook replacement of a persistent cookie with a session cookie.
    const cookies = new Map(response.headers.getSetCookie().map(cookie => [cookie.slice(0, cookie.indexOf("=")), cookie]));
    for (const cookie of cookies.values()) result.headers.append("Set-Cookie", cookie);
    return result;
  } catch (cause) { return json({ error: cause instanceof EmailAccessError ? cause.message : "Não foi possível verificar o código. Tente novamente." }, cause instanceof EmailAccessError ? cause.status : 503); }
}
