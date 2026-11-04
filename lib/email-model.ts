import { z } from "zod/v3";
export const accessEmailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254);
export const requestCodeSchema = z.object({ email: accessEmailSchema, type: z.literal("sign-in"), requestId: z.string().uuid() }).strict();
export const verifyCodeSchema = z.object({ email: accessEmailSchema, otp: z.string().regex(/^\d{6}$/, "Informe os seis números do código."), rememberMe: z.boolean().default(false) }).strict();
export const emailSettingsSchema = z.object({ fromEmail: accessEmailSchema, apiKey: z.string().trim().max(512).optional(), revision: z.number().int().nonnegative(), changeId: z.string().uuid() }).strict();
export const mailActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), id: z.string().uuid(), userId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("test"), id: z.string().uuid(), email: accessEmailSchema }).strict(),
]);
export const EMAIL_OTP_SECONDS = 600;
export const EMAIL_RESEND_SECONDS = 50;
export const REMEMBER_SESSION_DAYS = 30;
export const MAIL_STATUS_LABELS: Record<string, string> = { not_sent: "Não enviado", pending: "Envio em andamento", sent: "Enviado ao serviço", failed: "Falha no envio", unknown: "Envio não confirmado", not_configured: "Aguardando remetente" };
export type MailStatus = "pending" | "sent" | "failed" | "unknown" | "not_configured";
export type MailDelivery = { id: string; status: MailStatus; error: string; providerId: string | null; retryAfter?: number };
export type MailSettingsInfo = { configured: boolean; fromEmail: string; revision: number; updatedAt: string | null; provider: "Resend"; secretReady: boolean };
