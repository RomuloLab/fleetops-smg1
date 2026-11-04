import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { carrierModals, carrierModalSettings, modalCatalog } from "@/db/schema";
import { ensureConfiguredCatalog, ensureConfiguredCarrierModals } from "./carrier-modal-config";
import { findCarrier } from "./carrier-registry";
import { modalNameKey, type CarrierModalSelection } from "./modal-catalog-model";
import type { z } from "zod/v3";
import { createModalSchema, updateModalSchema } from "./modal-catalog-model";
import { calendarType } from "./calendarization-model";

export class ModalCatalogError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Data initialization lives outside schema migrations. Existing carrier modal IDs
// and order snapshots remain intact when introducing the shared catalog.
export async function ensureGeneralModalCatalog() {
  await ensureConfiguredCatalog();
  const db = getDb();
  const existing = await db.select({ code: carrierModals.code, name: carrierModals.name }).from(carrierModals).orderBy(asc(carrierModals.code));
  const unique = [...new Map(existing.map(modal => [modal.code, modal])).values()];
  const now = new Date().toISOString();
  // Leave room for the catalog's configuration columns in D1's bound values.
  for (let offset = 0; offset < unique.length; offset += 8) {
    await db.insert(modalCatalog).values(unique.slice(offset, offset + 8).map(modal => ({
      id: `existing-${modal.code}`, ...modal, nameKey: modalNameKey(modal.name), createdAt: now,
    }))).onConflictDoNothing();
  }
}

export async function listGeneralModals() {
  return (await getDb().select().from(modalCatalog).orderBy(asc(modalCatalog.name))).map(presentModal);
}
function presentModal(row: typeof modalCatalog.$inferSelect) { return { id: row.id, code: row.code, name: row.name, isFixedFleet: row.isFixedFleet, calendarizationType: calendarType(row.calendarizationType), sourceModalName: row.sourceModalName, revision: row.revision }; }

async function ensureCarrierSettings(carrier: string) {
  if (!await findCarrier(carrier)) throw new ModalCatalogError("Transportadora não encontrada.", 404);
  await ensureConfiguredCarrierModals(carrier);
  await getDb().insert(carrierModalSettings).values({ carrier, revision: 1, updatedAt: new Date().toISOString() }).onConflictDoNothing();
}

export async function readCarrierModals(carrier: string): Promise<CarrierModalSelection> {
  await ensureCarrierSettings(carrier);
  const db = getDb();
  const [settings, rows] = await db.batch([
    db.select().from(carrierModalSettings).where(eq(carrierModalSettings.carrier, carrier)),
    db.select({ code: carrierModals.code }).from(carrierModals).where(and(eq(carrierModals.carrier, carrier), eq(carrierModals.active, 1))),
  ]);
  return { carrier, revision: settings[0].revision, codes: rows.map(row => row.code).sort() };
}

export async function createGeneralModal(data: z.infer<typeof createModalSchema>) {
  const db = getDb(); const nameKey = modalNameKey(data.name);
  const previous = (await db.select().from(modalCatalog).where(eq(modalCatalog.id, data.id)).limit(1))[0];
  if (previous) {
    if (previous.nameKey !== nameKey || previous.isFixedFleet !== data.isFixedFleet || previous.calendarizationType !== data.calendarizationType || previous.sourceModalName !== data.sourceModalName) throw new ModalCatalogError("Este cadastro já foi utilizado. Inicie um novo modal.", 409);
    return { modal: presentModal(previous), replay: true };
  }
  const prefix = nameKey.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "modal";
  const modal = { id: data.id, code: `${prefix}-${data.id.slice(0, 8)}`, name: data.name, isFixedFleet: data.isFixedFleet, calendarizationType: data.calendarizationType, sourceModalName: data.sourceModalName };
  const inserted = await db.insert(modalCatalog).values({ ...modal, nameKey, createdAt: new Date().toISOString() }).onConflictDoNothing().returning();
  if (!inserted.length) {
    const retry = (await db.select().from(modalCatalog).where(eq(modalCatalog.id, data.id)).limit(1))[0];
    if (retry?.nameKey === nameKey && retry.isFixedFleet === data.isFixedFleet && retry.calendarizationType === data.calendarizationType && retry.sourceModalName === data.sourceModalName) return { modal: presentModal(retry), replay: true };
    throw new ModalCatalogError("Este modal já está na base geral. Selecione-o na lista da transportadora.", 409);
  }
  return { modal: presentModal(inserted[0]), replay: false };
}

export async function updateGeneralModal(data: z.infer<typeof updateModalSchema>) {
  const db = getDb();
  const existing = (await db.select().from(modalCatalog).where(eq(modalCatalog.id, data.id)).limit(1))[0];
  if (!existing) throw new ModalCatalogError("Modal não encontrado.", 404);
  const same = existing.isFixedFleet === data.isFixedFleet && existing.calendarizationType === data.calendarizationType && existing.sourceModalName === data.sourceModalName;
  if (existing.changeId === data.changeId && same) return { modal: presentModal(existing), replay: true };
  if (existing.revision !== data.revision) throw new ModalCatalogError("Este modal foi alterado em outro acesso. Reabra a edição para conferir a configuração atual.", 409);
  if (same) return { modal: presentModal(existing), replay: true };
  const changed = await db.update(modalCatalog).set({ isFixedFleet: data.isFixedFleet, calendarizationType: data.calendarizationType, sourceModalName: data.sourceModalName, revision: data.revision + 1, changeId: data.changeId })
    .where(and(eq(modalCatalog.id, data.id), eq(modalCatalog.revision, data.revision))).returning();
  if (!changed[0]) throw new ModalCatalogError("Este modal foi alterado em outro acesso. Reabra a edição para conferir a configuração atual.", 409);
  return { modal: presentModal(changed[0]), replay: false };
}

export async function saveCarrierModals(data: CarrierModalSelection & { changeId: string }) {
  await ensureCarrierSettings(data.carrier);
  const db = getDb();
  const settings = (await db.select().from(carrierModalSettings).where(eq(carrierModalSettings.carrier, data.carrier)).limit(1))[0];
  if (settings.changeId === data.changeId) {
    const selection = await readCarrierModals(data.carrier);
    if (JSON.stringify(selection.codes) === JSON.stringify([...data.codes].sort())) return { selection, replay: true };
    throw new ModalCatalogError("Esta alteração já foi enviada com outra seleção. Recarregue os modais.", 409);
  }
  const requested = new Set(data.codes);
  const selected = data.codes.length ? (await db.select().from(modalCatalog)).filter(modal => requested.has(modal.code)) : [];
  if (selected.length !== data.codes.length) throw new ModalCatalogError("Um dos modais não está na base geral. Recarregue a lista.");
  const gate = sql`EXISTS (SELECT 1 FROM carrier_modal_settings WHERE carrier = ${data.carrier} AND revision = ${data.revision})`;
  const upserts = selected.map(modal => db.insert(carrierModals).select(sql`SELECT ${crypto.randomUUID()}, ${data.carrier}, ${modal.code}, ${modal.name}, 1 WHERE ${gate}`)
    .onConflictDoUpdate({ target: [carrierModals.carrier, carrierModals.code], set: { active: 1, name: sql`excluded.name` } }));
  // D1 batches are transactional. Every write is gated by the same revision;
  // a stale editor cannot partially remove or re-enable carrier bindings.
  const result = await db.batch([
    db.update(carrierModals).set({ active: 0 }).where(and(eq(carrierModals.carrier, data.carrier), gate)),
    ...upserts,
    db.update(carrierModalSettings).set({ revision: data.revision + 1, changeId: data.changeId, updatedAt: new Date().toISOString() })
      .where(and(eq(carrierModalSettings.carrier, data.carrier), eq(carrierModalSettings.revision, data.revision))).returning(),
  ]);
  const updated = result[result.length - 1];
  if (!Array.isArray(updated) || !updated.length) throw new ModalCatalogError("Os modais foram alterados em outro acesso. Recarregue a lista e confira sua seleção.", 409);
  return { selection: { carrier: data.carrier, revision: data.revision + 1, codes: [...data.codes].sort() }, replay: false };
}
