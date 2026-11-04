import { z } from "zod/v3";
import type { CarrierLogoAsset } from "../config/carrier-logos";
export const CYCLES = ["CPM(CHP)", "AM", "PM", "SD", "SDE"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE = CYCLES[0];
export const SUNDAY_CYCLE_MESSAGE = "Aos domingos, os ciclos CPM(CHP) e PM não estão disponíveis. Selecione AM, SD ou SDE.";
export const OPERATION_TIME_ZONE = "America/Sao_Paulo";
export const DATE_CLOSED_MESSAGE = "O prazo desta data terminou à meia-noite, no horário de Brasília. Os dados estão disponíveis somente para consulta.";
export type OperationWindow = { editable: boolean; closesAt: string; serverNow: string };
export const CARRIERS = [
  { slug: "ado", name: "ADO", initials: "AD" }, { slug: "alc", name: "ALC", initials: "AL" },
  { slug: "basepex", name: "BASEPEX", initials: "BA" }, { slug: "bld", name: "BLD", initials: "BL" },
  { slug: "caxiense", name: "CAXIENSE", initials: "CA" }, { slug: "coopmetro", name: "COOPMETRO", initials: "CO" },
  { slug: "decargo", name: "DECARGO", initials: "DE" }, { slug: "dhl", name: "DHL", initials: "DH" },
  { slug: "help-me", name: "HELP ME", initials: "HE" }, { slug: "hawk", name: "HAWK", initials: "HA" },
  { slug: "imediato", name: "IMEDIATO", initials: "IM" }, { slug: "kangu", name: "KANGU", initials: "KA" },
  { slug: "rodacoop", name: "RODACOOP", initials: "RO" }, { slug: "spot", name: "SPOT", initials: "SP" },
] as const;
export type Carrier = { slug: string; name: string; initials: string; logo?: CarrierLogoAsset; createdAt?: string };
export const carrierSlugSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Transportadora inválida.");
export const MODALS = [
  { key: "utilitarios", name: "Utilitários", hint: "Veículos de pequeno porte" },
  { key: "vans", name: "Vans", hint: "Vans disponíveis para o ciclo" },
  { key: "vucs", name: "VUCs", hint: "Veículos urbanos de carga" },
  { key: "outros", name: "Outros", hint: "Demais tipos de veículos" },
] as const;
export type Counts = Record<(typeof MODALS)[number]["key"], number>;
export type Availability = Counts & { id: string; carrier: string; date: string; cycle: Cycle; contact: string; notes: string; revision: number; createdAt: string; updatedAt: string };
export const EMPTY_COUNTS: Counts = { utilitarios: 0, vans: 0, vucs: 0, outros: 0 };
export function total(counts: Counts) { return counts.utilitarios + counts.vans + counts.vucs + counts.outros; }
export function getCarrier(slug: string) { return CARRIERS.find(c => c.slug === slug); }
export const dateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data inválida");
const operationDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OPERATION_TIME_ZONE, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit",
});
export function operationDate(now: Date = new Date()) {
  const parts = operationDateFormatter.formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function operationClosesAt(date: string): string {
  dateSchema.parse(date);
  const anchor = Date.parse(date + "T00:00:00Z");
  let before = anchor - 36 * 3600000;
  let after = anchor + 60 * 3600000;
  // Find the first instant of the next Brazilian calendar day, using IANA
  // timezone rules rather than assuming a fixed UTC offset or a 24-hour day.
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (operationDate(new Date(middle)) > date) after = middle;
    else before = middle;
  }
  return new Date(after).toISOString();
}
export function operationWindow(date: string, now: Date = new Date()): OperationWindow {
  const closesAt = operationClosesAt(date);
  return { editable: now.getTime() < Date.parse(closesAt), closesAt, serverNow: now.toISOString() };
}
export const cycleSchema = z.enum(CYCLES, { errorMap: () => ({ message: "Selecione um ciclo válido." }) });
// Dates represent civil calendar days, not timestamps in the visitor's timezone.
export function isSunday(date: string) {
  return dateSchema.safeParse(date).success && new Date(date + "T12:00:00Z").getUTCDay() === 0;
}
export function availableCycles(date: string): readonly Cycle[] {
  return isSunday(date) ? CYCLES.filter(cycle => cycle !== "CPM(CHP)" && cycle !== "PM") : CYCLES;
}
export function selectCycleForDate(date: string, preferred: unknown = CYCLE): Cycle {
  const parsed = cycleSchema.safeParse(preferred);
  return parsed.success && availableCycles(date).includes(parsed.data) ? parsed.data : availableCycles(date)[0];
}
export const operationSchema = z.object({ date: dateSchema, cycle: cycleSchema })
  .refine(value => availableCycles(value.date).includes(value.cycle), { message: SUNDAY_CYCLE_MESSAGE, path: ["cycle"] });
const count = z.number().int().min(0).max(9999);
export const submissionSchema = z.object({
  carrier: carrierSlugSchema, date: dateSchema, cycle: cycleSchema,
  utilitarios: count, vans: count, vucs: count, outros: count,
  contact: z.string().trim().min(2).max(80), notes: z.string().trim().max(500), revision: z.number().int().positive().nullable(), noVehicles: z.boolean(),
}).refine(value => total(value) > 0 || value.noVehicles, { message: "Confirme que não há veículos disponíveis.", path: ["noVehicles"] })
  .refine(value => !value.noVehicles || total(value) === 0, { message: "Revise as quantidades.", path: ["noVehicles"] })
  .refine(value => availableCycles(value.date).includes(value.cycle), { message: SUNDAY_CYCLE_MESSAGE, path: ["cycle"] });
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value + "T12:00:00Z"));
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function makeCsv(rows: Availability[], date: string, cycle: Cycle = CYCLE, carriers: readonly Carrier[] = CARRIERS) {
  const header = ["Data", "Ciclo", "Transportadora", "Status", "Utilitários", "Vans", "VUCs", "Outros", "Total", "Responsável", "Observações", "Atualização"];
  return "\uFEFF" + [header, ...carriers.map(carrier => {
    const row = rows.find(item => item.carrier === carrier.slug && item.date === date && item.cycle === cycle);
    return [formatDate(date), cycle, carrier.name, row ? (total(row) ? "Confirmada" : "Sem veículos") : "Pendente", row?.utilitarios ?? "", row?.vans ?? "", row?.vucs ?? "", row?.outros ?? "", row ? total(row) : "", row?.contact ?? "", row?.notes ?? "", row ? formatTime(row.updatedAt) : ""];
  })].map(row => row.map(csvCell).join(";")).join("\r\n");
}
