import { env } from "cloudflare:workers";
import { findCarrier } from "./carrier-registry";
async function signCarrierKey(slug: string) {
  if (!env.LINK_SECRET) throw new Error("Configuração de acesso indisponível.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LINK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("dispo-carrier-v1:" + slug));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function carrierKey(slug: string) {
  if (!await findCarrier(slug)) throw new Error("Configuração de acesso indisponível.");
  return signCarrierKey(slug);
}
export async function validCarrierKey(request: Request, slug: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token) || !await findCarrier(slug)) return false;
  const expected = await signCarrierKey(slug);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return mismatch === 0;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
