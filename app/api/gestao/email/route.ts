import { getManagerAccess, listManagerUsers } from "@/lib/manager-access";
import { getMailSettings, saveMailSettings, sendTestMail } from "@/lib/access-mail";
import { sendEmailCode } from "@/lib/email-auth";
import { buildAccessEmail } from "@/lib/access-email-template";
import { emailSettingsSchema, mailActionSchema } from "@/lib/email-model";
import { authOrigin, consumeEmailLimit, EmailAccessError, readEmailInput, requireEmailOrigin } from "@/lib/email-security";
import { json } from "@/lib/server";
export const dynamic = "force-dynamic";
function failure(cause: unknown) { return json({ error: cause instanceof EmailAccessError ? cause.message : "Não foi possível confirmar o envio. Confira a conexão e atualize a tela." }, cause instanceof EmailAccessError ? cause.status : 503); }
export async function GET() {
  try {
    const master = await getManagerAccess(); if (!master?.isMaster) return json({ error: "Apenas masters podem configurar e-mails." }, 403);
    return json({ settings: await getMailSettings(), testEmail: master.email, preview: buildAccessEmail({ kind: "invite", name: "Nome do gestor", email: "gestor@empresa.com", otp: "••••••", loginUrl: authOrigin() + "/login", isMaster: false, permissions: ["dashboard", "scheduling"] }) });
  } catch (cause) { return failure(cause); }
}
export async function PUT(request: Request) {
  try {
    if (!(await getManagerAccess())?.isMaster) return json({ error: "Apenas masters podem configurar e-mails." }, 403);
    requireEmailOrigin(request);
    const input = emailSettingsSchema.safeParse(await readEmailInput(request));
    if (!input.success) return json({ error: input.error.issues[0]?.message ?? "Confira o remetente e a chave." }, 400);
    return json({ settings: await saveMailSettings(input.data) });
  } catch (cause) { return failure(cause); }
}
export async function POST(request: Request) {
  try {
    const master = await getManagerAccess(); if (!master?.isMaster) return json({ error: "Apenas masters podem enviar convites ou testes." }, 403);
    requireEmailOrigin(request);
    const input = mailActionSchema.safeParse(await readEmailInput(request));
    if (!input.success) return json({ error: "Confira o destinatário e tente novamente." }, 400);
    await consumeEmailLimit("master-email", master.id, 12, 600);
    if (input.data.action === "test") return json({ delivery: await sendTestMail("test-" + input.data.id, input.data.email) });
    const userId = input.data.userId;
    const user = (await listManagerUsers(master)).find(user => user.id === userId);
    if (!user?.active || user.isOwner) throw new EmailAccessError("Selecione um gestor ativo para enviar o convite.");
    const delivery = await sendEmailCode(user.email, "invite-resend-" + input.data.id, "invite");
    return json({ delivery, user: (await listManagerUsers(master)).find(row => row.id === user.id) });
  } catch (cause) { return failure(cause); }
}
