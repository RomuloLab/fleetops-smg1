import { findEmailMember, sendEmailCode } from "@/lib/email-auth";
import { getMailSettings } from "@/lib/access-mail";
import { EMAIL_RESEND_SECONDS, requestCodeSchema } from "@/lib/email-model";
import { consumeEmailLimit, EmailAccessError, readEmailInput, requireEmailOrigin } from "@/lib/email-security";
import { json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireEmailOrigin(request);
    const input = requestCodeSchema.safeParse(await readEmailInput(request));
    if (!input.success) return json({ error: "Informe um e-mail válido." }, 400);
    await consumeEmailLimit("send-ip", request.headers.get("cf-connecting-ip") || "unknown", 12, 600);
    if (!await findEmailMember(input.data.email)) return json({ error: "Este e-mail não está cadastrado ou não possui acesso ativo ao FleetOps. Solicite a liberação ao gestor master.", code: "EMAIL_NOT_AUTHORIZED" }, 403);
    if (!(await getMailSettings()).configured) throw new EmailAccessError("O envio de códigos aguarda a configuração do remetente pelo master.", 503);
    const delivery = await sendEmailCode(input.data.email, input.data.requestId, "login", true);
    if (!delivery || delivery.status !== "sent") throw new EmailAccessError(delivery?.error || "O envio ainda não foi confirmado. Confira com o master antes de tentar novamente.", 503, EMAIL_RESEND_SECONDS);
    return json({ message: "Código enviado. Use o código do e-mail mais recente; os anteriores foram invalidados. Confira também o spam.", retryAfter: delivery.retryAfter ?? EMAIL_RESEND_SECONDS }, 202);
  } catch (cause) {
    const result = json({ error: cause instanceof EmailAccessError ? cause.message : "Não foi possível solicitar o código. Tente novamente.", ...(cause instanceof EmailAccessError && cause.retryAfter ? { retryAfter: cause.retryAfter } : {}) }, cause instanceof EmailAccessError ? cause.status : 503);
    if (cause instanceof EmailAccessError && cause.retryAfter) result.headers.set("Retry-After", String(cause.retryAfter));
    return result;
  }
}
