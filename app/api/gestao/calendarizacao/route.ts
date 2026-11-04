import { canManage } from "@/lib/manager-access";
import { eq } from "drizzle-orm";
import { z } from "zod/v3";
import { getDb } from "@/db";
import { schedulingRequests } from "@/db/schema";
import { checkOrderCalendar, getCalendarSourceInfo } from "@/lib/calendarization";
import { presentSchedulingRequest } from "@/lib/scheduling";
import { json, sameOrigin } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try { if (!await canManage(["registration", "scheduling"])) return json({ error: "Acesso restrito ao gestor da operação." }, 403); return json({ source: await getCalendarSourceInfo() }); }
  catch { return json({ error: "Não foi possível consultar a planilha SMG1 agora. Tente atualizar a consulta." }, 503); }
}
const actionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("refresh_source") }), z.object({ action: z.literal("check_order"), id: z.string().uuid() })]);
export async function POST(request: Request) {
  try {
    if (!await canManage(["registration", "scheduling"]) || !sameOrigin(request)) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    if (!request.headers.get("content-type")?.includes("application/json") || Number(request.headers.get("content-length") ?? 0) > 2000) return json({ error: "Solicitação inválida." }, 400);
    const raw = await request.text(); if (raw.length > 2000) return json({ error: "Solicitação muito extensa." }, 413);
    let value: unknown; try { value = JSON.parse(raw); } catch { return json({ error: "Dados inválidos." }, 400); }
    const parsed = actionSchema.safeParse(value); if (!parsed.success) return json({ error: "Solicitação inválida." }, 400);
    if (parsed.data.action === "refresh_source") return json({ source: await getCalendarSourceInfo(true) });
    if (!await canManage("scheduling")) return json({ error: "A consulta de pedidos exige permissão de Scheduling." }, 403);
    const row = (await getDb().select().from(schedulingRequests).where(eq(schedulingRequests.id, parsed.data.id)).limit(1))[0];
    if (!row) return json({ error: "Pedido não encontrado." }, 404);
    return json({ request: await checkOrderCalendar(presentSchedulingRequest(row), true) });
  } catch { return json({ error: "Não foi possível consultar a calendarização SMG1. O pedido foi preservado." }, 503); }
}
