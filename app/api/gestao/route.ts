import { canManage } from "@/lib/manager-access";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { availability } from "@/db/schema";
import { dateSchema, operationSchema, operationWindow, selectCycleForDate } from "@/lib/model";
import { listCarriers } from "@/lib/carrier-registry";
import { json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!await canManage("dashboard")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
    const query = new URL(request.url).searchParams;
    const date = dateSchema.safeParse(query.get("data"));
    if (!date.success) return json({ error: "Selecione uma data válida." }, 400);
    const operation = operationSchema.safeParse({ date: date.data, cycle: query.get("ciclo") ?? selectCycleForDate(date.data) });
    if (!operation.success) return json({ error: operation.error.issues[0].message }, 400);
    const [responses, carriers] = await Promise.all([getDb().select().from(availability).where(and(eq(availability.date, date.data), eq(availability.cycle, operation.data.cycle))), listCarriers()]);
    return json({ responses, carriers, fetchedAt: new Date().toISOString(), window: operationWindow(date.data) });
  } catch { return json({ error: "Não foi possível atualizar o painel. Tente novamente." }, 503); }
}
