import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { emailOTP } from "better-auth/plugins/email-otp";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, isNull, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { emailAuthAccounts, emailAuthSessions, emailAuthUsers, emailAuthVerifications, managerUsers, mailDeliveries } from "@/db/schema";
import { completeMail, getMailSettings, reserveMail, sendAccessMail } from "./access-mail";
import { authOrigin, consumeEmailLimit, emailSecret, EmailAccessError, withEmailOperationLock } from "./email-security";
import { EMAIL_OTP_SECONDS, EMAIL_RESEND_SECONDS, REMEMBER_SESSION_DAYS, type MailDelivery } from "./email-model";
import { MANAGER_TABS, readPermissions } from "./manager-access-model";

export async function findEmailMember(email: string) {
  if (email && email === (env.OWNER_EMAIL ?? "").trim().toLowerCase()) return { id: null, name: "Gestor master", email, isMaster: true, permissions: MANAGER_TABS.map(tab => tab.key) };
  const row = (await getDb().select().from(managerUsers).where(eq(managerUsers.email, email)).limit(1))[0];
  if (!row?.active) return null;
  return { id: row.id, name: row.name, email: row.email, isMaster: row.isMaster, permissions: readPermissions(row.permissions) };
}
export function getEmailAuth(delivery?: { id: string; kind: "invite" | "login"; otp?: string }) {
  const origin = authOrigin();
  return betterAuth({ appName: "FleetOps", baseURL: origin, basePath: "/api/auth", secret: emailSecret(),
    database: drizzleAdapter(getDb(), { provider: "sqlite", transaction: false, schema: { user: emailAuthUsers, session: emailAuthSessions, account: emailAuthAccounts, verification: emailAuthVerifications } }),
    trustedOrigins: [origin], emailAndPassword: { enabled: false },
    session: { expiresIn: REMEMBER_SESSION_DAYS * 86400, updateAge: 86400, cookieCache: { enabled: false } },
    advanced: { cookiePrefix: "fleetops", useSecureCookies: origin.startsWith("https:"), defaultCookieAttributes: { httpOnly: true, sameSite: "lax" }, ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    databaseHooks: { session: { create: { before: async (session, context) => {
      if (context?.path === "/sign-in/email-otp" && context.body?.rememberMe !== true) return { data: { ...session, expiresAt: new Date(Date.now() + 86400000) } };
    } } } },
    hooks: { after: createAuthMiddleware(async context => {
      if (context.path !== "/sign-in/email-otp" || !context.context.newSession) return;
      const rememberMe = context.body?.rememberMe === true;
      // The OTP plugin delegates cookie policy to the library cookie helpers.
      // Expire its initial cookie before replacing it with the selected policy.
      expireCookie(context, context.context.authCookies.sessionToken);
      if (rememberMe) expireCookie(context, context.context.authCookies.dontRememberToken);
      await setSessionCookie(context, context.context.newSession, !rememberMe);
    }) },
    rateLimit: { enabled: false }, telemetry: { enabled: false }, logger: { disabled: true },
    plugins: [emailOTP({ otpLength: 6, expiresIn: EMAIL_OTP_SECONDS, allowedAttempts: 5, resendStrategy: "rotate", ...(delivery?.otp ? { generateOTP: () => delivery.otp! } : {}), storeOTP: "hashed", disableSignUp: true, sendVerificationOnSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        if (!delivery || type !== "sign-in") throw new EmailAccessError("Solicitação de acesso inválida.");
        const member = await findEmailMember(email);
        if (!member) throw new EmailAccessError("Solicitação de acesso indisponível.", 403);
        const link = authOrigin() + "/login#" + new URLSearchParams({ email, codigo: otp }).toString();
        await sendAccessMail(delivery.id, { ...member, kind: delivery.kind, otp, loginUrl: link });
      },
    })],
  });
}
export async function getEmailSession() {
  const requestHeaders = await headers();
  if (!env.BETTER_AUTH_SECRET || !requestHeaders.get("cookie")?.includes("fleetops")) return null;
  const session = await getEmailAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
  return session?.user.emailVerified ? session : null;
}
export async function sendEmailCode(email: string, id: string, kind: "invite" | "login", publicLogin = false): Promise<MailDelivery | null> {
  const member = await findEmailMember(email); if (!member) return null;
  const reserved = await reserveMail(id, email, kind, member.id); if (reserved.replay) return reserved.delivery;
  if (!(await getMailSettings()).configured) return completeMail(id, "not_configured", "Configure o remetente para enviar e-mails.");
  try {
    const sendWindow = await consumeEmailLimit("code-email-minute", email, 1, EMAIL_RESEND_SECONDS);
    return await withEmailOperationLock(email, async () => {
      const now = new Date();
      await getDb().insert(emailAuthUsers).values({ id: crypto.randomUUID(), name: member.name, email, emailVerified: false, createdAt: now, updatedAt: now }).onConflictDoNothing();
      const identifier = `sign-in-otp-${email}`;
      const previous = await getDb().select({ value: emailAuthVerifications.value }).from(emailAuthVerifications).where(eq(emailAuthVerifications.identifier, identifier));
      const priorHashes = new Set(previous.map(row => row.value.slice(0, row.value.lastIndexOf(":"))));
      let otp: string;
      do {
        otp = generateRandomString(6, "0-9");
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp)));
        const hash = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        if (!priorHashes.has(hash)) break;
      } while (true);
      // Remove every earlier challenge, including records issued by older builds.
      // The same D1 lock serializes verification so a retry cannot restore one.
      await getDb().delete(emailAuthVerifications).where(eq(emailAuthVerifications.identifier, identifier));
      await getEmailAuth({ id, kind, otp }).api.sendVerificationOTP({ body: { email, type: "sign-in" } });
      const [row] = await getDb().select().from(mailDeliveries).where(eq(mailDeliveries.id, id)).limit(1);
      return { id: row.id, status: row.status as MailDelivery["status"], error: row.error, providerId: row.providerId, retryAfter: Math.max(1, Math.ceil((sendWindow.availableAt - Date.now()) / 1000)) };
    });
  } catch (cause) {
    const [row] = await getDb().select().from(mailDeliveries).where(eq(mailDeliveries.id, id)).limit(1);
    if (row?.status !== "pending") return { id: row.id, status: row.status as MailDelivery["status"], error: row.error, providerId: row.providerId };
    const failed = await completeMail(id, "failed", cause instanceof EmailAccessError ? cause.message : "Não foi possível gerar o convite. Solicite um novo envio.");
    if (publicLogin && cause instanceof EmailAccessError) throw cause;
    return failed;
  }
}
export async function markEmailVerified(email: string) {
  await getDb().update(managerUsers).set({ emailVerifiedAt: new Date().toISOString() }).where(and(eq(managerUsers.email, email), isNull(managerUsers.emailVerifiedAt)));
}
