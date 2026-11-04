import { z } from "zod/v3";
import { AMBULANCE_RELEASERS } from "../config/ambulance-releasers";
import { availableCycles, carrierSlugSchema, cycleSchema, dateSchema, operationSchema, selectCycleForDate, SUNDAY_CYCLE_MESSAGE, type Cycle, type OperationWindow } from "./model";
import { calendarStatus, calendarType, normalizePlate, type CalendarStatus, type CalendarizationType, type CalendarCheck } from "./calendarization-model";
export type SchedulingModal = { id: string; code: string; name: string; isFixedFleet?: boolean; calendarizationType?: CalendarizationType };
export type SchedulingStatus = "pending" | "done" | "not_done";
export const SCHEDULING_STATUS_LABELS: Record<SchedulingStatus, string> = { pending: "Pendente", done: "Feito", not_done: "Não feito" };
export type VehicleCalendarCheck = CalendarCheck & { licensePlate: string };
export type SchedulingRequest = { seq: number; id: string; carrier: string; date: string; cycle: Cycle; modalId: string; modalName: string; quantity: number; contact: string; notes: string; status: SchedulingStatus; createdAt: string; resolutionNotes: string; statusRevision: number; statusUpdatedAt: string | null; resolutionId: string | null; ambulance: boolean; ambulanceReleasedBy: string; isFixedFleet: boolean; licensePlate: string; licensePlates: string[]; calendarVehicles: VehicleCalendarCheck[]; calendarizationType: CalendarizationType; sourceModalName: string; calendarStatus: CalendarStatus; calendarNotes: string; calendarCheckedAt: string | null; calendarSourceAt: string | null; calendarPlanned: number | null; calendarRequested: number | null; calendarRevision: number };
export type SchedulingStatusEvent = { seq: number; changeId: string; id: string; carrier: string; date: string; cycle: Cycle; modalName: string; quantity: number; status: SchedulingStatus; resolutionNotes: string; revision: number; createdAt: string };
export type SchedulingData = { requests: SchedulingRequest[]; total: number; window: OperationWindow };
export function schedulingStatus(value: string): SchedulingStatus { return value === "done" || value === "not_done" ? value : "pending"; }
type StoredSchedulingRow = Omit<SchedulingRequest, "status" | "cycle" | "calendarizationType" | "calendarStatus" | "licensePlates" | "calendarVehicles"> & { status: string; cycle: string; calendarizationType: string; calendarStatus: string; licensePlates?: string; calendarVehicles?: string };
const storedVehiclesSchema = z.object({ version: z.literal(1), notes: z.array(z.string()), vehicles: z.array(z.object({ plate: z.string(), status: z.string(), note: z.number().int().nonnegative(), planned: z.number().nullable() })) });
export function encodeVehicleCalendar(checks: VehicleCalendarCheck[]) {
  // Share repeated notes and timestamps so large batches remain bounded in D1.
  const notes = [...new Set(checks.map(check => check.calendarNotes))]; const noteIndexes = new Map(notes.map((note, index) => [note, index]));
  return JSON.stringify({ version: 1, notes, vehicles: checks.map(check => ({ plate: check.licensePlate, status: check.calendarStatus, note: noteIndexes.get(check.calendarNotes), planned: check.calendarPlanned })) });
}
function readStoredPlates(row: StoredSchedulingRow) {
  if (!row.isFixedFleet) return [];
  try { const value: unknown = JSON.parse(row.licensePlates || "[]"); if (Array.isArray(value) && value.length && value.every(plate => typeof plate === "string")) return value.map(normalizePlate); } catch { /* Legacy single-plate records remain readable. */ }
  return row.licensePlate ? [normalizePlate(row.licensePlate)] : [];
}
export function presentSchedulingRequest(row: StoredSchedulingRow): SchedulingRequest {
  const licensePlates = readStoredPlates(row); const knownPlates = new Set(licensePlates); let calendarVehicles: VehicleCalendarCheck[] = [];
  try {
    const stored = storedVehiclesSchema.safeParse(JSON.parse(row.calendarVehicles || "[]"));
    if (stored.success) calendarVehicles = stored.data.vehicles.filter(check => knownPlates.has(check.plate)).map(check => ({ licensePlate: check.plate, calendarStatus: calendarStatus(check.status), calendarNotes: stored.data.notes[check.note] ?? "", calendarPlanned: check.planned, calendarRequested: 1, calendarCheckedAt: row.calendarCheckedAt, calendarSourceAt: row.calendarSourceAt }));
  } catch { /* A missing legacy check is shown using the order-level result. */ }
  return { ...row, licensePlate: licensePlates[0] ?? "", licensePlates, calendarVehicles, cycle: row.cycle as Cycle, status: schedulingStatus(row.status), calendarizationType: calendarType(row.calendarizationType), calendarStatus: calendarStatus(row.calendarStatus) };
}
export const schedulingResolutionSchema = z.object({
  id: z.string().uuid(), changeId: z.string().uuid(), revision: z.number().int().min(1),
  status: z.enum(["done", "not_done"]), resolutionNotes: z.string().trim().max(1000),
}).refine(value => value.status !== "not_done" || value.resolutionNotes.length > 0, { message: "Informe o motivo de o pedido não ter sido feito.", path: ["resolutionNotes"] });
export const schedulingSubmissionSchema = z.object({
  id: z.string().uuid(), carrier: carrierSlugSchema,
  date: dateSchema, cycle: cycleSchema, modalId: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(9999), contact: z.string().trim().min(2).max(80), notes: z.string().trim().max(500),
  ambulance: z.boolean().default(false), ambulanceReleasedBy: z.string().trim().max(80).default(""),
  licensePlate: z.string().max(12).default("").transform(normalizePlate),
  licensePlates: z.array(z.string().max(12).transform(normalizePlate)).max(9999).optional(),
}).refine(value => availableCycles(value.date).includes(value.cycle), { message: SUNDAY_CYCLE_MESSAGE, path: ["cycle"] })
  .refine(value => !value.ambulance || AMBULANCE_RELEASERS.some(name => name === value.ambulanceReleasedBy), { message: "Selecione na lista quem liberou a ambulância.", path: ["ambulanceReleasedBy"] })
  .transform(value => ({ ...value, ambulanceReleasedBy: value.ambulance ? value.ambulanceReleasedBy : "" }));
export function schedulingOperation(query: URLSearchParams) {
  const date = query.get("data") ?? "";
  return operationSchema.safeParse({ date, cycle: query.get("ciclo") ?? selectCycleForDate(date) });
}
export function sameSchedulingPayload(existing: SchedulingRequest, payload: z.infer<typeof schedulingSubmissionSchema>) {
  return (["carrier", "date", "cycle", "modalId", "quantity", "contact", "notes", "ambulance", "ambulanceReleasedBy"] as const).every(key => existing[key] === payload[key]) && (!existing.isFixedFleet || JSON.stringify(existing.licensePlates) === JSON.stringify(submittedLicensePlates(payload)));
}
export function requestProtocol(id: string) { return "#" + id.slice(0, 8).toUpperCase(); }

export function submittedLicensePlates(payload: { licensePlate: string; licensePlates?: string[] }) { return payload.licensePlates ?? (payload.licensePlate ? [payload.licensePlate] : []); }
