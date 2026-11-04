import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { emailRateLimits } from "@/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { gatewayOrigin } from "./gateway-context";

export class EmailAccessError extends Error { constructor(message: string, public status = 400, public retryAfter?: number) { super(message); } }
export function emailSecret() {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new EmailAccessError("O acesso por e-mail aguarda configuração do master.", 503);
  return env.BETTER_AUTH_SECRET;
}
export function authOrigin() {
  const forwardedOrigin = gatewayOrigin();
  if (forwardedOrigin) return forwardedOrigin;
  if (import.meta.env.DEV) return "http://terminal.local:4173";
  const origin = new URL(env.AUTH_BASE_URL || "https://disponibilidade-cpm-chp.shadycharm33.chatgpt.site").origin;
  if (!origin.startsWith("https://")) throw new EmailAccessError("Configuração de acesso indisponível.", 503);
  return origin;
}
async function keyFor(purpose: string, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(emailSecret()), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("fleetops-email-v1"), info: new TextEncoder().encode(purpose) }, material, { name: "AES-GCM", length: 256 }, false, usage);
}
export async function encryptMailKey(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor("mail-provider", ["encrypt"]), new TextEncoder().encode(value)));
  return JSON.stringify({ v: 1, iv: Array.from(iv), value: Array.from(encrypted) });
}
export async function decryptMailKey(value: string) {
  const stored = JSON.parse(value) as { v: number; iv: number[]; value: number[] };
  if (stored.v !== 1) throw new EmailAccessError("Reconfigure o remetente de e-mail.", 503);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(stored.iv) }, await keyFor("mail-provider", ["decrypt"]), new Uint8Array(stored.value));
  return new TextDecoder().decode(plain);
}
async function privateEmailKey(scope: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(emailSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(scope + ":" + value)));
  return Array.from(digest, n => n.toString(16).padStart(2, "0")).join("");
}
export async function consumeEmailLimit(scope: string, value: string, maximum: number, seconds: number) {
  const privateKey = await privateEmailKey(scope, value); const now = Date.now();
  const [row] = await getDb().insert(emailRateLimits).values({ key: privateKey, count: 1, resetsAt: now + seconds * 1000 }).onConflictDoUpdate({ target: emailRateLimits.key,
    set: { count: sql`case when ${emailRateLimits.resetsAt} <= ${now} then 1 else ${emailRateLimits.count} + 1 end`, resetsAt: sql`case when ${emailRateLimits.resetsAt} <= ${now} then ${now + seconds * 1000} else ${emailRateLimits.resetsAt} end` } }).returning();
  const retryAfter = Math.max(1, Math.ceil((row.resetsAt - now) / 1000));
  if (row.count > maximum) throw new EmailAccessError(scope === "code-email-minute" ? `Aguarde ${retryAfter} segundos para solicitar outro código.` : "Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429, retryAfter);
  return { retryAfter, availableAt: row.resetsAt };
}
export async function withEmailOperationLock<T>(email: string, operation: () => Promise<T>): Promise<T> {
  const key = await privateEmailKey("email-operation", email); const now = Date.now();
  const owner = crypto.getRandomValues(new Uint32Array(1))[0] + 1; const db = getDb();
  const claimed = await db.insert(emailRateLimits).values({ key, count: owner, resetsAt: now + 30000 }).onConflictDoUpdate({ target: emailRateLimits.key, set: { count: owner, resetsAt: now + 30000 }, setWhere: lte(emailRateLimits.resetsAt, now) }).returning();
  if (!claimed.length) throw new EmailAccessError("Uma solicitação para este e-mail está em andamento. Tente novamente em instantes.", 409, 2);
  try { return await operation(); }
  finally { await db.update(emailRateLimits).set({ resetsAt: 0 }).where(and(eq(emailRateLimits.key, key), eq(emailRateLimits.count, owner))); }
}
export function requireEmailOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || origin !== authOrigin() || request.headers.get("sec-fetch-site") === "cross-site") throw new EmailAccessError("Abra o FleetOps para continuar.", 403);
}
export async function readEmailInput(request: Request, maximum = 5000) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new EmailAccessError("Envie os dados em JSON.");
  const reader = request.body?.getReader(); if (!reader) throw new EmailAccessError("Dados inválidos.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > maximum) { await reader.cancel(); throw new EmailAccessError("Informações muito extensas.", 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new EmailAccessError("Dados inválidos."); }
}
