import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { schedulingStatusEvents } from "@/db/schema";
import { json, validCarrierKey } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const carrier = query.get("transportadora") ?? "";
    if (!await validCarrierKey(request, carrier)) return json({ error: "Link inválido. Solicite um novo link à operação." }, 403);
    const after = query.get("after"); const db = getDb();
    if (after === null) {
      const baseline = await db.select({ cursor: sql<number>`coalesce(max(seq),0)` }).from(schedulingStatusEvents).where(eq(schedulingStatusEvents.carrier, carrier));
      return json({ cursor: baseline[0]?.cursor ?? 0, events: [], hasMore: false });
    }
    const cursor = Number(after);
    if (!/^\d+$/.test(after) || !Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "Cursor inválido." }, 400);
    const rows = await db.select().from(schedulingStatusEvents).where(and(eq(schedulingStatusEvents.carrier, carrier), gt(schedulingStatusEvents.seq, cursor))).orderBy(asc(schedulingStatusEvents.seq)).limit(51);
    const events = rows.slice(0, 50);
    return json({ cursor: events.at(-1)?.seq ?? cursor, events, hasMore: rows.length > 50 });
  } catch { return json({ error: "Não foi possível atualizar os informativos dos pedidos." }, 503); }
}
