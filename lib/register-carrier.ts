import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { registeredCarriers } from "@/db/schema";
import { getCarrier } from "./model";
import { carrierRegistrationSchema, carrierSlug, logoFrameSchema, MAX_LOGO_BYTES } from "./carrier-registration-model";
import { registrationWithIdOrName, presentCarrier } from "./carrier-registry";
import { inspectLogo } from "./logo-file";
export class CarrierRegistrationError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
async function boundedForm(request: Request) {
  const limit = MAX_LOGO_BYTES + 16384;
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new CarrierRegistrationError("Envie o formulário com nome e logo.");
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new CarrierRegistrationError("A logo deve ter até 2 MB.",413);
  const reader = request.body?.getReader(); if (!reader) throw new CarrierRegistrationError("Formulário vazio.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > limit) { await reader.cancel(); throw new CarrierRegistrationError("A logo deve ter até 2 MB.",413); } chunks.push(chunk.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); } catch { throw new CarrierRegistrationError("Não foi possível ler o formulário."); }
}
// Call only after the route has authorized the operation's owner.
export async function registerCarrierRequest(request: Request) {
  const form = await boundedForm(request);
  const parsed = carrierRegistrationSchema.safeParse({ id: form.get("id"), name: form.get("name") });
  if (!parsed.success) throw new CarrierRegistrationError(parsed.error.issues[0]?.message ?? "Confira o nome da transportadora.");
  const { id, name } = parsed.data; const slug = carrierSlug(name); const initials = (slug.split("-").length > 1 ? slug.split("-").map(part => part[0]).slice(0,2).join("") : slug.slice(0,2)).toUpperCase();
  if (getCarrier(slug)) throw new CarrierRegistrationError("Essa transportadora já está cadastrada. Use o link existente.",409);
  const file = form.get("logo");
  if (typeof file === "string" && file) throw new CarrierRegistrationError("Selecione uma imagem para a logo.");
  let logoKey: string | null = null, logoMime: string | null = null, logoHash = "", logoWidth = 0, logoHeight = 0, logoViewBox = "", logoBackground = "#ffffff";
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  if (file instanceof File && (file.size || file.name)) {
    if (!file.size || file.size > MAX_LOGO_BYTES) throw new CarrierRegistrationError("A logo deve ter entre 1 byte e 2 MB.",413);
    bytes = new Uint8Array(await file.arrayBuffer()); const info = inspectLogo(bytes);
    if (!info) throw new CarrierRegistrationError("Use uma imagem PNG, JPG ou WebP válida, com até 8.000 pixels por lado.");
    logoMime = info.mime; logoWidth = info.width; logoHeight = info.height;
    const frameText = form.get("logoFrame");
    let frame = { x: 0, y: 0, width: info.width, height: info.height, background: "#ffffff" };
    if (typeof frameText === "string" && frameText) {
      if (frameText.length > 1000) throw new CarrierRegistrationError("Enquadramento inválido.");
      let value: unknown; try { value = JSON.parse(frameText); } catch { throw new CarrierRegistrationError("Enquadramento inválido."); }
      const result = logoFrameSchema.safeParse(value);
      if (!result.success || result.data.x + result.data.width > info.width || result.data.y + result.data.height > info.height) throw new CarrierRegistrationError("Enquadramento inválido.");
      frame = result.data;
    }
    logoViewBox = `${frame.x} ${frame.y} ${frame.width} ${frame.height}`; logoBackground = frame.background;
    logoHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),byte => byte.toString(16).padStart(2,"0")).join("");
    logoKey = `carrier-logos/${id}/${logoHash}.${info.extension}`;
  }
  const current = await registrationWithIdOrName(id,slug);
  const existing = current.find(row => row.id === id);
  if (existing) {
    if (existing.name === name && existing.logoHash === logoHash && existing.logoViewBox === logoViewBox && existing.logoBackground === logoBackground) return { carrier: presentCarrier(existing), replay: true };
    throw new CarrierRegistrationError("Esse cadastro já foi enviado. Inicie um novo cadastro para alterar os dados.",409);
  }
  if (current.length) throw new CarrierRegistrationError("Já existe uma transportadora com esse nome. Use o link cadastrado.",409);
  if (bytes && logoKey && logoMime) {
    if (!env.BUCKET) throw new CarrierRegistrationError("O armazenamento de logos está indisponível. Tente novamente.",503);
    await env.BUCKET.put(logoKey,bytes,{ httpMetadata: { contentType: logoMime } });
  }
  const db = getDb();
  const inserted = await db.insert(registeredCarriers).values({ id, slug, name, nameKey: slug, initials, logoKey, logoMime, logoHash, logoWidth, logoHeight, logoViewBox, logoBackground, createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
  if (inserted[0]) return { carrier: presentCarrier(inserted[0]), replay: false };
  const winner = (await db.select().from(registeredCarriers).where(eq(registeredCarriers.id,id)).limit(1))[0];
  if (logoKey && winner?.logoKey !== logoKey) await env.BUCKET?.delete(logoKey).catch(() => undefined);
  if (winner && winner.name === name && winner.logoHash === logoHash && winner.logoViewBox === logoViewBox && winner.logoBackground === logoBackground) return { carrier: presentCarrier(winner), replay: true };
  throw new CarrierRegistrationError("Essa transportadora acabou de ser cadastrada em outra tela. Atualize a lista.",409);
}
