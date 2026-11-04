import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mailDeliveries, mailSettings, managerUsers } from "@/db/schema";
import { buildAccessEmail, type AccessEmailData } from "./access-email-template";
import { authOrigin, decryptMailKey, emailSecret, EmailAccessError, encryptMailKey } from "./email-security";
import type { MailDelivery, MailSettingsInfo, MailStatus, emailSettingsSchema } from "./email-model";
import type { z } from "zod/v3";

export async function getMailSettings(): Promise<MailSettingsInfo> {
  const row = (await getDb().select().from(mailSettings).where(eq(mailSettings.id, "resend")).limit(1))[0];
  return { configured: !!row, fromEmail: row?.fromEmail ?? "", revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? null, provider: "Resend", secretReady: !!env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32 };
}
export async function saveMailSettings(input: z.infer<typeof emailSettingsSchema>) {
  emailSecret(); const db = getDb(); const previous = (await db.select().from(mailSettings).where(eq(mailSettings.id, "resend")).limit(1))[0];
  if (previous?.changeId === input.changeId) return getMailSettings();
  if ((previous?.revision ?? 0) !== input.revision) throw new EmailAccessError("O remetente foi alterado em outra tela. Atualize para conferir.", 409);
  if (input.apiKey && !/^re_[a-zA-Z0-9_\-]{16,}$/.test(input.apiKey)) throw new EmailAccessError("Informe uma chave válida do Resend.");
  if (!previous && !input.apiKey) throw new EmailAccessError("Informe a chave do serviço de envio.");
  const values = { fromEmail: input.fromEmail, encryptedKey: input.apiKey ? await encryptMailKey(input.apiKey) : previous!.encryptedKey, revision: input.revision + 1, changeId: input.changeId, updatedAt: new Date().toISOString() };
  const saved = previous ? await db.update(mailSettings).set(values).where(and(eq(mailSettings.id, "resend"), eq(mailSettings.revision, input.revision))).returning() : await db.insert(mailSettings).values({ id: "resend", ...values }).onConflictDoNothing().returning();
  if (!saved.length) throw new EmailAccessError("O remetente foi alterado em outra tela. Atualize para conferir.", 409);
  return getMailSettings();
}
function present(row: typeof mailDeliveries.$inferSelect): MailDelivery { return { id: row.id, status: row.status as MailStatus, error: row.error, providerId: row.providerId }; }
export async function reserveMail(id: string, email: string, purpose: string, managerId: string | null) {
  const db = getDb(); const inserted = await db.insert(mailDeliveries).values({ id, email, purpose, managerId, createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
  if (inserted[0]) return { delivery: present(inserted[0]), replay: false };
  const row = (await db.select().from(mailDeliveries).where(eq(mailDeliveries.id, id)).limit(1))[0];
  if (!row || row.email !== email || row.purpose !== purpose || row.managerId !== managerId) throw new EmailAccessError("Esta tentativa já foi utilizada. Atualize a tela.", 409);
  return { delivery: present(row), replay: true };
}
export async function completeMail(id: string, status: MailStatus, error = "", providerId: string | null = null): Promise<MailDelivery> {
  const db = getDb(); const [row] = await db.update(mailDeliveries).set({ status, error, providerId, completedAt: new Date().toISOString() }).where(eq(mailDeliveries.id, id)).returning();
  if (row.managerId && row.purpose === "invite") await db.update(managerUsers).set({ inviteStatus: status, inviteError: error, ...(status === "sent" ? { inviteSentAt: row.completedAt } : {}) }).where(eq(managerUsers.id, row.managerId));
  return present(row);
}
export async function sendAccessMail(id: string, data: AccessEmailData): Promise<MailDelivery> {
  const row = (await getDb().select().from(mailSettings).where(eq(mailSettings.id, "resend")).limit(1))[0];
  if (!row) return completeMail(id, "not_configured", "Configure o remetente para enviar e-mails.");
  const message = buildAccessEmail(data);
  try {
    const providerKey = await decryptMailKey(row.encryptedKey);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + providerKey, "Content-Type": "application/json", "Idempotency-Key": "fleetops-" + id }, body: JSON.stringify({ from: `FleetOps <${row.fromEmail}>`, to: [data.email], ...message }), signal: AbortSignal.timeout(12000), redirect: "manual" });
    if (!response.ok) {
      const error = response.status === 401 ? "Chave de envio recusada. Confira a configuração." : response.status === 403 || response.status === 422 ? "Confira a chave, o remetente e o domínio verificado no Resend." : response.status === 429 ? "O serviço limitou os envios. Aguarde antes de reenviar." : "O serviço de envio não confirmou a mensagem.";
      return completeMail(id, response.status >= 500 ? "unknown" : "failed", error);
    }
    const result = await response.json() as { id?: unknown };
    if (typeof result.id !== "string" || result.id.length > 200) return completeMail(id, "unknown", "O serviço não confirmou o identificador da mensagem. Confira antes de reenviar.");
    return completeMail(id, "sent", "", result.id);
  } catch { return completeMail(id, "unknown", "O envio não foi confirmado. Confira no serviço antes de reenviar."); }
}
export async function sendTestMail(id: string, email: string) {
  const reserved = await reserveMail(id, email, "test", null); if (reserved.replay) return reserved.delivery;
  return sendAccessMail(id, { kind: "test", name: "master", email, loginUrl: authOrigin() + "/login", isMaster: false, permissions: [] });
}
