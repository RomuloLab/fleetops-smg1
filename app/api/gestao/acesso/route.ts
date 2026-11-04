import { getManagerAccess } from "@/lib/manager-access";
import { json } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const access = await getManagerAccess();
    return access ? json({ access }) : json({ error: "Seu acesso ao painel não está liberado. Consulte o gestor master." }, 403);
  } catch { return json({ error: "Não foi possível conferir as permissões. Tente novamente." }, 503); }
}
