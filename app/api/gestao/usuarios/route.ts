import { sendEmailCode } from "@/lib/email-auth";
import { createManagerSchema, updateManagerSchema } from "@/lib/manager-access-model";
import { createManagerUser, getManagerAccess, listManagerUsers, ManagerAccessError, updateManagerUser } from "@/lib/manager-access";
import { json, sameOrigin } from "@/lib/server";
export const dynamic = "force-dynamic";
function failure(cause: unknown) {
  return cause instanceof ManagerAccessError ? json({ error: cause.message, ...(cause.current ? { current: cause.current } : {}) }, cause.status)
    : json({ error: "Não foi possível confirmar os usuários. Confira sua conexão e tente novamente." }, 503);
}
export async function GET() {
  try {
    const access = await getManagerAccess();
    if (!access?.isMaster) return json({ error: "Apenas o gestor master pode gerenciar usuários." }, 403);
    return json({ users: await listManagerUsers(access) });
  } catch (cause) { return failure(cause); }
}
async function readInput(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ManagerAccessError("Envie os dados em JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > 5000) throw new ManagerAccessError("Informações muito extensas.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new ManagerAccessError("Dados inválidos.");
  const decoder = new TextDecoder(); let text = ""; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 5000) { await reader.cancel(); throw new ManagerAccessError("Informações muito extensas.", 413); }
      text += decoder.decode(value, { stream: true }); }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text) as unknown; } catch { throw new ManagerAccessError("Dados inválidos."); }
}
export async function POST(request: Request) {
  try {
    if (!(await getManagerAccess())?.isMaster || !sameOrigin(request)) return json({ error: "Apenas o gestor master pode gerenciar usuários." }, 403);
    const parsed = createManagerSchema.safeParse(await readInput(request));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confira o nome, o e-mail e as permissões." }, 400);
    const result = await createManagerUser(parsed.data);
    if (!result.replay && result.user.active) await sendEmailCode(result.user.email, "invite-" + result.user.id, "invite");
    const access = (await getManagerAccess())!;
    const user = (await listManagerUsers(access)).find(user => user.id === result.user.id) ?? result.user;
    return json({ ...result, user }, result.replay ? 200 : 201);
  } catch (cause) { return failure(cause); }
}
export async function PATCH(request: Request) {
  try {
    if (!(await getManagerAccess())?.isMaster || !sameOrigin(request)) return json({ error: "Apenas o gestor master pode gerenciar usuários." }, 403);
    const parsed = updateManagerSchema.safeParse(await readInput(request));
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Confira as permissões e reabra o usuário se necessário." }, 400);
    return json(await updateManagerUser(parsed.data));
  } catch (cause) { return failure(cause); }
}
