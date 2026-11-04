import { canManage } from "@/lib/manager-access";
import { listCarriers } from "@/lib/carrier-registry";
import { carrierKey, json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await canManage("links")) return json({ error: "Acesso restrito ao gestor da operação." }, 403);
  try { return json({ links: await Promise.all((await listCarriers()).map(async carrier => ({ ...carrier, path: "/t/" + carrier.slug + "#chave=" + await carrierKey(carrier.slug) }))) }); }
  catch { return json({ error: "Os links não estão disponíveis. Tente novamente." }, 503); }
}
