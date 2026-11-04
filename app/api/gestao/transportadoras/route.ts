import { canManage } from "@/lib/manager-access";
import { carrierKey, json, sameOrigin } from "@/lib/server";
import { listCarriers } from "@/lib/carrier-registry";
import { CarrierRegistrationError, registerCarrierRequest } from "@/lib/register-carrier";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!await canManage("registration")) return json({ error: "Acesso restrito ao gestor da operação." },403);
    const carriers = await listCarriers();
    return json({ carriers, links: await Promise.all(carriers.map(async carrier => ({ slug: carrier.slug, path: `/t/${carrier.slug}#chave=${await carrierKey(carrier.slug)}` }))) });
  } catch { return json({ error: "Não foi possível carregar o cadastro de transportadoras." },503); }
}
export async function POST(request: Request) {
  try {
    if (!await canManage("registration") || !sameOrigin(request)) return json({ error: "Acesso restrito ao gestor da operação." },403);
    const result = await registerCarrierRequest(request);
    return json({ ...result, path: `/t/${result.carrier.slug}#chave=${await carrierKey(result.carrier.slug)}` },result.replay ? 200 : 201);
  } catch (cause) {
    return cause instanceof CarrierRegistrationError ? json({ error: cause.message },cause.status) : json({ error: "O cadastro ainda não foi confirmado. Verifique a conexão e tente novamente." },503);
  }
}
