import { z } from "zod/v3";

export const MANAGER_TABS = [
  { key: "dashboard", label: "Visão geral", description: "Consultar e exportar a disponibilidade das transportadoras." },
  { key: "scheduling", label: "Scheduling", description: "Gerenciar pedidos, consultar a calendarização e receber alertas." },
  { key: "links", label: "Links de coleta", description: "Abrir e copiar os links exclusivos das transportadoras." },
  { key: "registration", label: "Cadastro", description: "Cadastrar transportadoras e gerenciar logos, modais e seus links." },
] as const;
export type ManagerTab = (typeof MANAGER_TABS)[number]["key"];
export type ManagerAccess = { id: string; name: string; email: string; isMaster: boolean; isOwner: boolean; permissions: ManagerTab[]; revision: number };
export type ManagerUser = { id: string; name: string; email: string; isMaster: boolean; isOwner: boolean; permissions: ManagerTab[]; active: boolean; revision: number; createdAt: string | null; updatedAt: string | null; emailVerifiedAt: string | null; inviteStatus: string; inviteSentAt: string | null; inviteError: string };
export const managerTabSchema = z.enum(["dashboard", "scheduling", "links", "registration"]);
const permissionsSchema = z.array(managerTabSchema).max(4).refine(value => new Set(value).size === value.length, "Selecione cada aba apenas uma vez.");
const nameSchema = z.string().trim().min(2, "Informe o nome do gestor.").max(80);
export const createManagerSchema = z.object({
  id: z.string().uuid(), name: nameSchema, email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  permissions: permissionsSchema, active: z.boolean(), isMaster: z.boolean().default(false),
}).strict();
export const updateManagerSchema = z.object({
  id: z.string().uuid(), name: nameSchema, permissions: permissionsSchema, active: z.boolean(),
  isMaster: z.boolean().optional(),
  revision: z.number().int().positive(), changeId: z.string().uuid(),
}).strict();
export function orderedPermissions(value: readonly ManagerTab[]) { return MANAGER_TABS.map(tab => tab.key).filter(key => value.includes(key)); }
export function readPermissions(value: string): ManagerTab[] {
  try { const parsed = permissionsSchema.safeParse(JSON.parse(value)); return parsed.success ? orderedPermissions(parsed.data) : []; }
  catch { return []; }
}
export function hasManagerTab(access: ManagerAccess | null, tab: ManagerTab) { return !!access && (access.isMaster || access.permissions.includes(tab)); }
