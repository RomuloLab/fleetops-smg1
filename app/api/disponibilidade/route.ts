import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { availability } from "@/db/schema";
import { DATE_CLOSED_MESSAGE, dateSchema, operationSchema, operationWindow, selectCycleForDate, submissionSchema } from "@/lib/model";
import { json, sameOrigin, validCarrierKey } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const carrier = query.get("transportadora") ?? "";
    if (!await validCarrierKey(request, carrier)) return json({ error: "Link inválido. Solicite um novo link à operação." }, 403);
    const date = dateSchema.safeParse(query.get("data"));
    if (!date.success) return json({ error: "Selecione uma data válida." }, 400);
    const operation = operationSchema.safeParse({ date: date.data, cycle: query.get("ciclo") ?? selectCycleForDate(date.data) });
    if (!operation.success) return json({ error: operation.error.issues[0].message }, 400);
    const rows = await getDb().select().from(availability).where(and(eq(availability.carrier, carrier), eq(availability.date, date.data), eq(availability.cycle, operation.data.cycle))).limit(1);
    return json({ response: rows[0] ?? null, window: operationWindow(date.data) });
  } catch { return json({ error: "Não foi possível carregar a disponibilidade. Tente novamente." }, 503); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) return json({ error: "Solicitação inválida." }, 403);
    if (Number(request.headers.get("content-length") ?? 0) > 8000) return json({ error: "Informações muito extensas." }, 413);
    const raw = await request.text();
    if (raw.length > 8000) return json({ error: "Informações muito extensas." }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "Dados inválidos." }, 400); }
    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues.find(issue => issue.path[0] === "cycle")?.message ?? "Revise a data, o responsável e as quantidades. Use apenas números inteiros de 0 a 9.999." }, 400);
    const { revision, noVehicles: _noVehicles, ...data } = parsed.data;
    if (!await validCarrierKey(request, data.carrier)) return json({ error: "Link inválido. Solicite um novo link à operação." }, 403);
    const writeWindow = operationWindow(data.date);
    const closedResponse = () => json({ error: DATE_CLOSED_MESSAGE, code: "DATE_CLOSED", window: operationWindow(data.date) }, 403);
    if (!writeWindow.editable) return closedResponse();
    const now = new Date().toISOString(); const db = getDb();
    // Recheck the deadline in D1 as well: a request queued before midnight
    // must not mutate an operation after the calendar day has closed.
    const withinDeadline = sql`unixepoch('now') < ${Date.parse(writeWindow.closesAt) / 1000}`;
    const result = revision === null
      ? await db.insert(availability).select(sql`SELECT ${crypto.randomUUID()}, ${data.carrier}, ${data.date}, ${data.cycle}, ${data.utilitarios}, ${data.vans}, ${data.vucs}, ${data.outros}, ${data.contact}, ${data.notes}, 1, ${now}, ${now} WHERE ${withinDeadline}`).onConflictDoNothing().returning()
      : await db.update(availability).set({ ...data, updatedAt: now, revision: sql`${availability.revision} + 1` }).where(and(eq(availability.carrier, data.carrier), eq(availability.date, data.date), eq(availability.cycle, data.cycle), eq(availability.revision, revision), withinDeadline)).returning();
    if (!result.length) {
      if (!operationWindow(data.date).editable) return closedResponse();
      return json({ error: "Outra pessoa atualizou esta resposta. Recarregue os dados e revise antes de enviar novamente." }, 409);
    }
    return json({ response: result[0], window: operationWindow(data.date) });
  } catch { return json({ error: "Não foi possível salvar. Sua resposta ainda não foi confirmada. Tente novamente." }, 503); }
}
