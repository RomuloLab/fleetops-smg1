import { canManage } from "@/lib/manager-access";
import { carrierSlugSchema } from "@/lib/model";
import { assignModalsSchema, createModalSchema, updateModalSchema } from "@/lib/modal-catalog-model";
import { createGeneralModal, ensureGeneralModalCatalog, listGeneralModals, ModalCatalogError, readCarrierModals, saveCarrierModals, updateGeneralModal } from "@/lib/modal-catalog";
import { json, sameOrigin } from "@/lib/server";
export const dynamic = "force-dynamic";

function failure(cause: unknown) {
  return cause instanceof ModalCatalogError ? json({ error: cause.message }, cause.status)
    : json({ error: "Não foi possível confirmar os modais. Verifique a conexão e tente novamente." }, 503);
}
export async function GET(request: Request) {
  try {
    if (!await canManage("registration")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const carrier = new URL(request.url).searchParams.get("transportadora");
    if (carrier !== null && !carrierSlugSchema.safeParse(carrier).success) return json({ error: "Selecione uma transportadora válida." }, 400);
    await ensureGeneralModalCatalog();
    return json({ modals: await listGeneralModals(), ...(carrier ? { selection: await readCarrierModals(carrier) } : {}) });
  } catch (cause) { return failure(cause); }
}

async function input(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ModalCatalogError("Envie os dados em JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > 24000) throw new ModalCatalogError("Informações muito extensas.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new ModalCatalogError("Dados inválidos.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 24000) { await reader.cancel(); throw new ModalCatalogError("Informações muito extensas.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new ModalCatalogError("Dados inválidos."); }
}
export async function POST(request: Request) {
  try {
    if (!await canManage("registration") || !sameOrigin(request)) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const parsed = createModalSchema.safeParse(await input(request));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confira o nome e a configuração do modal." }, 400);
    await ensureGeneralModalCatalog();
    const result = await createGeneralModal(parsed.data);
    return json(result, result.replay ? 200 : 201);
  } catch (cause) { return failure(cause); }
}
export async function PATCH(request: Request) {
  try {
    if (!await canManage("registration") || !sameOrigin(request)) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const parsed = updateModalSchema.safeParse(await input(request));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confira a configuração do modal." }, 400);
    return json(await updateGeneralModal(parsed.data));
  } catch (cause) { return failure(cause); }
}
export async function PUT(request: Request) {
  try {
    if (!await canManage("registration") || !sameOrigin(request)) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const parsed = assignModalsSchema.safeParse(await input(request));
    if (!parsed.success) return json({ error: "Confira a transportadora e selecione até 200 modais válidos, sem repetições." }, 400);
    await ensureGeneralModalCatalog();
    return json(await saveCarrierModals(parsed.data));
  } catch (cause) { return failure(cause); }
}
