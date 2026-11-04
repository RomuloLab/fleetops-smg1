import { canManage } from "@/lib/manager-access";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { carrierModals, schedulingRequests, schedulingStatusEvents } from "@/db/schema";
import { operationWindow } from "@/lib/model";
import { presentSchedulingRequest, schedulingOperation, schedulingResolutionSchema } from "@/lib/scheduling";
import { json, sameOrigin } from "@/lib/server";
import { ensureConfiguredCatalog } from "@/lib/carrier-modal-config";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!await canManage("scheduling")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const query = new URL(request.url).searchParams; const operation = schedulingOperation(query);
    if (!operation.success) return json({ error: "Selecione uma data e um ciclo disponíveis." }, 400);
    const page = Number(query.get("pagina") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return json({ error: "Página inválida." }, 400);
    await ensureConfiguredCatalog();
    const db = getDb();
    const where = and(eq(schedulingRequests.date, operation.data.date), eq(schedulingRequests.cycle, operation.data.cycle));
    const [requests, summary, configured] = await Promise.all([
      db.select().from(schedulingRequests).where(where).orderBy(desc(schedulingRequests.seq)).limit(20).offset((page - 1) * 20),
      db.select({ total: sql<number>`count(*)`, quantity: sql<number>`coalesce(sum(quantity),0)`, carriers: sql<number>`count(distinct carrier)` }).from(schedulingRequests).where(where),
      db.select({ carriers: sql<number>`count(distinct carrier)` }).from(carrierModals).where(eq(carrierModals.active, 1)),
    ]);
    return json({ requests: requests.map(presentSchedulingRequest), summary: summary[0], configuredCarriers: configured[0]?.carriers ?? 0, page, pageSize: 20, window: operationWindow(operation.data.date) });
  } catch { return json({ error: "Não foi possível carregar os pedidos. Tente novamente." }, 503); }
}

export async function PATCH(request: Request) {
  try {
    if (!await canManage("scheduling")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    if (!sameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) return json({ error: "Solicitação inválida." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > 8000) return json({ error: "Informações muito extensas." }, 413);
    const raw = await request.text();
    if (raw.length > 8000) return json({ error: "Informações muito extensas." }, 413);
    let value: unknown; try { value = JSON.parse(raw); } catch { return json({ error: "Dados inválidos." }, 400); }
    const parsed = schedulingResolutionSchema.safeParse(value);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confira o status e a observação do pedido." }, 400);
    const data = parsed.data; const db = getDb();
    const existing = (await db.select().from(schedulingRequests).where(eq(schedulingRequests.id, data.id)).limit(1))[0];
    if (!existing) return json({ error: "Pedido não encontrado." }, 404);
    const resolutionNotes = data.status === "not_done" ? data.resolutionNotes : "";
    const sameDecision = existing.status === data.status && existing.resolutionNotes === resolutionNotes;
    if (existing.resolutionId === data.changeId) return sameDecision
      ? json({ request: presentSchedulingRequest(existing), replay: true })
      : json({ error: "Esta atualização já foi utilizada. Reabra o pedido para tentar novamente.", request: presentSchedulingRequest(existing) }, 409);
    if (existing.statusRevision !== data.revision) return json({ error: "Este pedido foi atualizado em outra tela. Confira o status atual e tente novamente.", request: presentSchedulingRequest(existing) }, 409);
    if (sameDecision) return json({ request: presentSchedulingRequest(existing), replay: true });
    const now = new Date().toISOString();
    // D1 executes the batch atomically. The change id makes the event conditional
    // on this exact update winning, including concurrent requests and retries.
    const [updated] = await db.batch([
      db.update(schedulingRequests).set({ status: data.status, resolutionNotes, statusRevision: data.revision + 1, statusUpdatedAt: now, resolutionId: data.changeId })
        .where(and(eq(schedulingRequests.id, data.id), eq(schedulingRequests.statusRevision, data.revision), sql`NOT EXISTS (SELECT 1 FROM scheduling_status_events WHERE change_id = ${data.changeId})`)).returning(),
      db.insert(schedulingStatusEvents).select(sql`SELECT NULL, ${data.changeId}, id, carrier, date, cycle, modal_name, quantity, status, resolution_notes, status_revision, status_updated_at FROM scheduling_requests WHERE id = ${data.id} AND resolution_id = ${data.changeId}`).onConflictDoNothing(),
    ]);
    if (!updated.length) {
      const current = (await db.select().from(schedulingRequests).where(eq(schedulingRequests.id, data.id)).limit(1))[0];
      if (current?.resolutionId === data.changeId && current.status === data.status && current.resolutionNotes === resolutionNotes) return json({ request: presentSchedulingRequest(current), replay: true });
      return json({ error: "Este pedido foi atualizado em outra tela. Confira o status atual e tente novamente.", request: current ? presentSchedulingRequest(current) : null }, 409);
    }
    return json({ request: presentSchedulingRequest(updated[0]), replay: false });
  } catch { return json({ error: "A atualização ainda não foi confirmada. Verifique a conexão e tente novamente." }, 503); }
}
