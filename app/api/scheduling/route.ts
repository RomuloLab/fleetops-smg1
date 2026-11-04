import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { carrierModals, modalCatalog, schedulingRequests } from "@/db/schema";
import { DATE_CLOSED_MESSAGE, operationWindow } from "@/lib/model";
import { presentSchedulingRequest, schedulingOperation, schedulingSubmissionSchema, sameSchedulingPayload, submittedLicensePlates } from "@/lib/scheduling";
import { json, sameOrigin, validCarrierKey } from "@/lib/server";
import { ensureConfiguredCarrierModals } from "@/lib/carrier-modal-config";
import { orderCarrierModals } from "@/config/carrier-modals";
import { calendarType, validPlate } from "@/lib/calendarization-model";
import { checkOrderCalendar } from "@/lib/calendarization";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams; const carrier = query.get("transportadora") ?? "";
    if (!await validCarrierKey(request, carrier)) return json({ error: "Link inválido. Solicite um novo link à operação." }, 403);
    const operation = schedulingOperation(query);
    if (!operation.success) return json({ error: "Selecione uma data e um ciclo disponíveis." }, 400);
    await ensureConfiguredCarrierModals(carrier);
    const db = getDb();
    const where = and(eq(schedulingRequests.carrier, carrier), eq(schedulingRequests.date, operation.data.date), eq(schedulingRequests.cycle, operation.data.cycle));
    const [modals, requests, count] = await Promise.all([
      db.select({ id: carrierModals.id, code: carrierModals.code, name: carrierModals.name, isFixedFleet: sql<number>`coalesce(${modalCatalog.isFixedFleet},0)`, calendarizationType: sql<string>`coalesce(${modalCatalog.calendarizationType},'none')` }).from(carrierModals).leftJoin(modalCatalog, eq(modalCatalog.code, carrierModals.code)).where(and(eq(carrierModals.carrier, carrier), eq(carrierModals.active, 1))).orderBy(carrierModals.name),
      db.select().from(schedulingRequests).where(where).orderBy(desc(schedulingRequests.seq)).limit(100),
      db.select({ total: sql<number>`count(*)` }).from(schedulingRequests).where(where),
    ]);
    return json({ modals: orderCarrierModals(carrier, modals.map(modal => ({ ...modal, isFixedFleet: !!modal.isFixedFleet, calendarizationType: calendarType(modal.calendarizationType) }))), requests: requests.map(presentSchedulingRequest), total: count[0]?.total ?? 0, window: operationWindow(operation.data.date) });
  } catch { return json({ error: "Não foi possível carregar o Scheduling. Tente novamente." }, 503); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) return json({ error: "Solicitação inválida." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > 200000) return json({ error: "Informações muito extensas." }, 413);
    const reader = request.body?.getReader(); if (!reader) return json({ error: "Dados inválidos." }, 400);
    const decoder = new TextDecoder(); let raw = ""; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 200000) { await reader.cancel(); return json({ error: "Informações muito extensas." }, 413); } raw += decoder.decode(value, { stream: true }); } raw += decoder.decode(); }
    finally { reader.releaseLock(); }
    let value: unknown; try { value = JSON.parse(raw); } catch { return json({ error: "Dados inválidos." }, 400); }
    const parsed = schedulingSubmissionSchema.safeParse(value);
    if (!parsed.success) return json({ error: parsed.error.issues.find(issue => issue.path[0] === "cycle")?.message ?? parsed.error.issues.find(issue => issue.path[0] === "ambulanceReleasedBy")?.message ?? "Confira o modal, a quantidade, a data e o nome do responsável." }, 400);
    const data = parsed.data;
    if (!await validCarrierKey(request, data.carrier)) return json({ error: "Link inválido. Solicite um novo link à operação." }, 403);
    const db = getDb();
    const existing = (await db.select().from(schedulingRequests).where(eq(schedulingRequests.id, data.id)).limit(1))[0];
    if (existing) return sameSchedulingPayload(presentSchedulingRequest(existing), data)
      ? json({ request: presentSchedulingRequest(existing), replay: true, window: operationWindow(data.date) })
      : json({ error: "Este pedido já foi registrado. Atualize a página para iniciar um novo pedido." }, 409);
    const access = operationWindow(data.date);
    const closed = () => json({ error: DATE_CLOSED_MESSAGE, code: "DATE_CLOSED", window: operationWindow(data.date) }, 403);
    if (!access.editable) return closed();
    await ensureConfiguredCarrierModals(data.carrier);
    const modal = (await db.select({ id: carrierModals.id, name: carrierModals.name, isFixedFleet: sql<number>`coalesce(${modalCatalog.isFixedFleet},0)`, calendarizationType: sql<string>`coalesce(${modalCatalog.calendarizationType},'none')`, sourceModalName: sql<string>`coalesce(${modalCatalog.sourceModalName},'')`, revision: sql<number>`coalesce(${modalCatalog.revision},0)` }).from(carrierModals).leftJoin(modalCatalog, eq(modalCatalog.code, carrierModals.code)).where(and(eq(carrierModals.id, data.modalId), eq(carrierModals.carrier, data.carrier), eq(carrierModals.active, 1))).limit(1))[0];
    if (!modal) return json({ error: "Este modal ainda não está liberado para sua transportadora. Aguarde a configuração pela operação." }, 422);
    const fixed = !!modal.isFixedFleet;
    const plates = fixed ? submittedLicensePlates(data) : [];
    if (fixed && plates.length !== data.quantity) return json({ error: `Informe exatamente ${data.quantity} placa(s), uma para cada veículo de frota fixa.` }, 422);
    if (fixed && plates.some(plate => !validPlate(plate))) return json({ error: "Confira todas as placas de frota fixa. Use ABC1234 ou ABC1D23." }, 422);
    if (fixed && new Set(plates).size !== plates.length) return json({ error: "Cada veículo deve ter uma placa diferente. Remova as placas repetidas." }, 422);
    if (fixed && data.licensePlates && data.licensePlate && data.licensePlate !== plates[0]) return json({ error: "A placa principal difere da lista. Atualize o pedido e confira as placas." }, 422);
    const type = fixed ? "FF" : calendarType(modal.calendarizationType);
    const plate = plates[0] ?? "";
    const sourceModalName = modal.sourceModalName || modal.name;
    const now = new Date().toISOString();
    const result = await db.insert(schedulingRequests).select(sql`SELECT NULL, ${data.id}, ${data.carrier}, ${data.date}, ${data.cycle}, ${data.modalId}, ${modal.name}, ${data.quantity}, ${data.contact}, ${data.notes}, 'pending', ${now}, '', 1, NULL, NULL, ${data.ambulance ? 1 : 0}, ${data.ambulanceReleasedBy}, ${fixed ? 1 : 0}, ${plate}, ${JSON.stringify(plates)}, ${"[]"}, ${type}, ${sourceModalName}, ${type === "none" ? "not_applicable" : "checking"}, '', NULL, NULL, NULL, NULL, 0 WHERE unixepoch('now') < ${Date.parse(access.closesAt) / 1000} AND EXISTS (SELECT 1 FROM carrier_modals cm LEFT JOIN modal_catalog mc ON mc.code = cm.code WHERE cm.id = ${data.modalId} AND cm.carrier = ${data.carrier} AND cm.active = 1 AND coalesce(mc.revision,0) = ${modal.revision})`).onConflictDoNothing().returning();
    if (!result.length) {
      if (!operationWindow(data.date).editable) return closed();
      const replay = (await db.select().from(schedulingRequests).where(eq(schedulingRequests.id, data.id)).limit(1))[0];
      if (replay && sameSchedulingPayload(presentSchedulingRequest(replay), data)) return json({ request: presentSchedulingRequest(replay), replay: true, window: operationWindow(data.date) });
      const stillActive = (await db.select({ id: carrierModals.id }).from(carrierModals).where(and(eq(carrierModals.id, data.modalId), eq(carrierModals.carrier, data.carrier), eq(carrierModals.active, 1))).limit(1))[0];
      if (!stillActive) return json({ error: "Este modal foi retirado da sua transportadora. Atualize a lista para selecionar um modal disponível." }, 422);
      return json({ error: "A configuração do modal mudou. Atualize a lista e confira os campos antes de reenviar." }, 409);
    }
    return json({ request: await checkOrderCalendar(presentSchedulingRequest(result[0])), replay: false, window: operationWindow(data.date) }, 201);
  } catch { return json({ error: "O pedido ainda não foi confirmado. Verifique sua conexão e tente novamente." }, 503); }
}
