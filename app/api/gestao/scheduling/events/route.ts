import { canManage } from "@/lib/manager-access";
import { asc, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { schedulingRequests } from "@/db/schema";
import { json } from "@/lib/server";
import { listCarriers } from "@/lib/carrier-registry";
import { presentSchedulingRequest } from "@/lib/scheduling";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!await canManage("scheduling")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const after = new URL(request.url).searchParams.get("after"); const db = getDb();
    // The first request establishes a baseline, so old orders never create
    // a storm of notifications when a manager opens or reloads the site.
    if (after === null) {
      const current = await db.select({ cursor: sql<number>`coalesce(max(seq),0)` }).from(schedulingRequests);
      return json({ cursor: current[0]?.cursor ?? 0, events: [], hasMore: false });
    }
    const cursor = Number(after);
    if (!/^\d+$/.test(after) || !Number.isSafeInteger(cursor) || cursor < 0) return json({ error: "Cursor inválido." }, 400);
    const rows = await db.select().from(schedulingRequests).where(gt(schedulingRequests.seq, cursor)).orderBy(asc(schedulingRequests.seq)).limit(51);
    const events = rows.slice(0, 50).map(presentSchedulingRequest);
    return json({ cursor: events.at(-1)?.seq ?? cursor, events, hasMore: rows.length > 50, ...(events.length ? { carriers: await listCarriers() } : {}) });
  } catch { return json({ error: "Não foi possível atualizar os alertas de pedidos." }, 503); }
}
