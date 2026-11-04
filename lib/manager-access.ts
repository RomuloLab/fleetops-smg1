import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { managerUsers } from "@/db/schema";
import { MANAGER_TABS, hasManagerTab, orderedPermissions, readPermissions, type ManagerAccess, type ManagerTab, type ManagerUser, type createManagerSchema, type updateManagerSchema } from "./manager-access-model";
import type { z } from "zod/v3";
import { getEmailSession } from "./email-auth";

const ownerEmail = () => (env.OWNER_EMAIL ?? "").trim().toLowerCase();
type StoredManager = typeof managerUsers.$inferSelect;
const fullPermissions = () => MANAGER_TABS.map(tab => tab.key);
export function presentManager(row: StoredManager): ManagerUser {
  return { id: row.id, name: row.name, email: row.email, isMaster: row.isMaster, isOwner: false, permissions: row.isMaster ? fullPermissions() : readPermissions(row.permissions), active: row.active,
    revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, emailVerifiedAt: row.emailVerifiedAt, inviteStatus: row.inviteStatus, inviteSentAt: row.inviteSentAt, inviteError: row.inviteError };
}

export async function getManagerAccess(): Promise<ManagerAccess | null> {
  const session = await getEmailSession();
  const nativeIdentity = session ? null : await getChatGPTUser();
  const email = (session?.user.email ?? nativeIdentity?.email ?? "").trim().toLowerCase();
  // Native sign-in remains an owner recovery path. Other managers verify
  // their own address with the e-mail provider, independently of ChatGPT.
  if (ownerEmail() && email === ownerEmail() && (session || nativeIdentity)) return { id: session?.user.id ?? nativeIdentity!.userId, name: session?.user.name || nativeIdentity?.fullName || "Gestor master", email, isMaster: true, isOwner: true,
    permissions: fullPermissions(), revision: 0 };
  if (!session) return null;
  const row = (await getDb().select().from(managerUsers).where(eq(managerUsers.email, email)).limit(1))[0];
  if (!row?.active) return null;
  return { id: row.id, name: row.name, email: row.email, isMaster: row.isMaster, isOwner: false, permissions: row.isMaster ? fullPermissions() : readPermissions(row.permissions), revision: row.revision };
}
export async function canManage(tabs: ManagerTab | readonly ManagerTab[]) {
  const access = await getManagerAccess();
  const requested: readonly ManagerTab[] = typeof tabs === "string" ? [tabs] : tabs;
  return requested.some(tab => hasManagerTab(access, tab));
}

export class ManagerAccessError extends Error {
  constructor(message: string, public status = 400, public current?: ManagerUser) { super(message); }
}
export async function listManagerUsers(master: ManagerAccess) {
  const rows = await getDb().select().from(managerUsers).orderBy(managerUsers.name);
  const primary: ManagerUser = { id: "primary-owner", name: master.isOwner ? master.name : "Master principal", email: ownerEmail(), isMaster: true, isOwner: true,
    permissions: fullPermissions(), active: true, revision: 0, createdAt: null, updatedAt: null, emailVerifiedAt: null, inviteStatus: "not_sent", inviteSentAt: null, inviteError: "" };
  return [primary, ...rows.filter(row => row.email !== ownerEmail()).map(presentManager)];
}
export async function createManagerUser(input: z.infer<typeof createManagerSchema>) {
  if (input.email === ownerEmail()) throw new ManagerAccessError("A conta master já possui acesso completo e está protegida.", 409);
  const db = getDb(); const now = new Date().toISOString();
  const permissions = JSON.stringify(input.isMaster ? fullPermissions() : orderedPermissions(input.permissions));
  const saved = await db.insert(managerUsers).values({ id: input.id, name: input.name, email: input.email, permissions, active: input.active, isMaster: input.isMaster, createdAt: now, updatedAt: now })
    .onConflictDoNothing().returning();
  if (saved[0]) return { user: presentManager(saved[0]), replay: false };
  const byId = (await db.select().from(managerUsers).where(eq(managerUsers.id, input.id)).limit(1))[0];
  if (byId && byId.email === input.email && byId.name === input.name && byId.permissions === permissions && byId.active === input.active && byId.isMaster === input.isMaster && byId.revision === 1) return { user: presentManager(byId), replay: true };
  throw new ManagerAccessError("Este e-mail ou cadastro já está em uso. Confira a lista de usuários.", 409);
}
export async function updateManagerUser(input: z.infer<typeof updateManagerSchema>) {
  const db = getDb();
  const row = (await db.select().from(managerUsers).where(eq(managerUsers.id, input.id)).limit(1))[0];
  if (!row) throw new ManagerAccessError("Usuário não encontrado.", 404);
  if (row.email === ownerEmail()) throw new ManagerAccessError("A conta master não pode ser alterada por este formulário.", 403);
  const isMaster = input.isMaster ?? row.isMaster;
  const permissions = JSON.stringify(isMaster ? fullPermissions() : orderedPermissions(input.permissions));
  if (row.changeId === input.changeId) {
    if (row.name === input.name && row.permissions === permissions && row.active === input.active && row.isMaster === isMaster) return { user: presentManager(row), replay: true };
    throw new ManagerAccessError("Esta atualização já foi utilizada. Reabra o usuário para editar.", 409, presentManager(row));
  }
  if (row.revision !== input.revision) throw new ManagerAccessError("Este usuário foi alterado em outra tela. Reabra para conferir as permissões atuais.", 409, presentManager(row));
  const saved = await db.update(managerUsers).set({ name: input.name, permissions, active: input.active, isMaster, revision: input.revision + 1, changeId: input.changeId, updatedAt: new Date().toISOString() })
    .where(and(eq(managerUsers.id, input.id), eq(managerUsers.revision, input.revision))).returning();
  if (!saved[0]) throw new ManagerAccessError("As permissões mudaram durante a edição. Reabra o usuário e tente novamente.", 409);
  return { user: presentManager(saved[0]), replay: false };
}
