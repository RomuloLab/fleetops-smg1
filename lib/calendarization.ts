import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarizationCache, schedulingRequests } from "@/db/schema";
import { CALENDARIZATION_SOURCE } from "@/config/calendarization";
import { calendarSourceInfo, checkCalendar, modalLookupKey, parseFFCalendar, parseSDDCalendar, type CalendarCheck, type CalendarSnapshot } from "./calendarization-model";
import { findCarrier } from "./carrier-registry";
import { presentSchedulingRequest, encodeVehicleCalendar, type SchedulingRequest, type VehicleCalendarCheck } from "./scheduling";

async function fetchCsv(gid: string, query: string) {
  const params = new URLSearchParams({ gid, headers: "1", tqx: "out:csv", tq: query });
  let url = `https://docs.google.com/spreadsheets/d/${CALENDARIZATION_SOURCE.spreadsheetId}/gviz/tq?${params}`;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetch(url, { signal: controller.signal, redirect: "manual", headers: { Accept: "text/csv" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location"); await response.body?.cancel();
        if (!location) throw new Error("Redirecionamento inválido.");
        const target = new URL(location, url);
        if (target.protocol !== "https:" || target.username || target.password || !(target.hostname === "docs.google.com" || target.hostname.endsWith(".googleusercontent.com"))) throw new Error("Destino da planilha não permitido.");
        url = target.href; continue;
      }
      if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Leitura da planilha indisponível."); }
      if (Number(response.headers.get("content-length") ?? 0) > 2_000_000) { await response.body.cancel(); throw new Error("Consulta da planilha muito extensa."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = ""; let size = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength; if (size > 2_000_000) { await reader.cancel(); throw new Error("Consulta da planilha muito extensa."); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        return text + decoder.decode();
      } finally { reader.releaseLock(); }
    }
    throw new Error("Redirecionamentos demais.");
  } finally { clearTimeout(timeout); }
}

export async function getCalendarSnapshot(force = false): Promise<CalendarSnapshot> {
  const db = getDb();
  const cached = (await db.select().from(calendarizationCache).where(eq(calendarizationCache.id, "smg1")).limit(1))[0];
  if (!force && cached && Date.parse(cached.expiresAt) > Date.now()) {
    const value = JSON.parse(cached.payload) as CalendarSnapshot;
    if (Array.isArray(value.ff) && Array.isArray(value.sdd) && value.dates.length === 7) return value;
  }
  const fetchedAt = new Date().toISOString();
  const [ffText, sddText] = await Promise.all([
    fetchCsv(CALENDARIZATION_SOURCE.ffGid, "select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S where E = 'SMG1'"),
    fetchCsv(CALENDARIZATION_SOURCE.sddGid, "select A,B,C,D,E,F,G,H,I,J,K,L,M,N where B = 'SMG1'"),
  ]);
  const sdd = parseSDDCalendar(sddText);
  const snapshot: CalendarSnapshot = { ff: parseFFCalendar(ffText), sdd: sdd.rows, dates: sdd.dates, fetchedAt };
  const payload = JSON.stringify(snapshot);
  if (new TextEncoder().encode(payload).byteLength > 800_000) throw new Error("Calendarização SMG1 muito extensa.");
  await db.insert(calendarizationCache).values({ id: "smg1", payload, fetchedAt, expiresAt: new Date(Date.now() + 60000).toISOString() })
    .onConflictDoUpdate({ target: calendarizationCache.id, set: { payload, fetchedAt, expiresAt: new Date(Date.now() + 60000).toISOString() }, setWhere: sql`excluded.fetched_at >= calendarization_cache.fetched_at` });
  return snapshot;
}
export async function getCalendarSourceInfo(force = false) { return calendarSourceInfo(await getCalendarSnapshot(force)); }

export async function checkOrderCalendar(order: SchedulingRequest, force = false): Promise<SchedulingRequest> {
  if (order.calendarizationType === "none") return order;
  let result: CalendarCheck; let vehicles: VehicleCalendarCheck[] = [];
  try {
    const snapshot = await getCalendarSnapshot(force);
    const carrier = await findCarrier(order.carrier);
    let requestedTotal = order.quantity;
    if (order.calendarizationType === "SDD") {
      const orders = await getDb().select({ quantity: schedulingRequests.quantity, modalName: schedulingRequests.modalName, sourceModalName: schedulingRequests.sourceModalName }).from(schedulingRequests)
        .where(and(eq(schedulingRequests.carrier, order.carrier), eq(schedulingRequests.date, order.date), eq(schedulingRequests.cycle, order.cycle), eq(schedulingRequests.calendarizationType, "SDD"), ne(schedulingRequests.status, "not_done")));
      const key = modalLookupKey(order.sourceModalName || order.modalName);
      requestedTotal = orders.filter(row => modalLookupKey(row.sourceModalName || row.modalName) === key).reduce((sum, row) => sum + row.quantity, 0);
    }
    const lookup = { type: order.calendarizationType, carrier: order.carrier, carrierName: carrier?.name ?? order.carrier, modalName: order.sourceModalName || order.modalName, date: order.date, cycle: order.cycle };
    if (order.isFixedFleet) {
      vehicles = order.licensePlates.map(licensePlate => ({ licensePlate, ...checkCalendar(snapshot, { ...lookup, plate: licensePlate, quantity: 1 }) }));
      if (vehicles.length === 1) result = vehicles[0];
      else {
        const matched = vehicles.filter(check => check.calendarStatus === "matched").length;
        const failures = [...new Set(vehicles.filter(check => check.calendarStatus !== "matched").map(check => check.calendarStatus))];
        result = { calendarStatus: !failures.length ? "matched" : failures.length === 1 ? failures[0] : "ambiguous", calendarNotes: `SMG1 · FF: ${matched} de ${vehicles.length} placas conferidas para esta data, ciclo, modal e transportadora. Consulte o resultado individual de cada veículo.`,
          calendarCheckedAt: new Date().toISOString(), calendarSourceAt: snapshot.fetchedAt, calendarRequested: order.quantity,
          calendarPlanned: vehicles.every(check => check.calendarPlanned !== null) ? vehicles.reduce((total, check) => total + check.calendarPlanned!, 0) : null };
      }
    } else result = checkCalendar(snapshot, { ...lookup, plate: "", quantity: order.quantity, requestedTotal });
  } catch {
    result = { calendarStatus: "unavailable", calendarNotes: "Não foi possível ler a calendarização SMG1 agora. O pedido foi mantido; use Reconsultar planilha para tentar novamente.", calendarCheckedAt: new Date().toISOString(), calendarSourceAt: null, calendarPlanned: null, calendarRequested: order.quantity };
    if (order.isFixedFleet) vehicles = order.licensePlates.map(licensePlate => ({ ...result, licensePlate, calendarRequested: 1 }));
  }
  const db = getDb();
  const saved = await db.update(schedulingRequests).set({ calendarStatus: result.calendarStatus, calendarNotes: result.calendarNotes, calendarCheckedAt: result.calendarCheckedAt, calendarSourceAt: result.calendarSourceAt, calendarPlanned: result.calendarPlanned, calendarRequested: result.calendarRequested, calendarVehicles: encodeVehicleCalendar(vehicles), calendarRevision: order.calendarRevision + 1 })
    .where(and(eq(schedulingRequests.id, order.id), eq(schedulingRequests.calendarRevision, order.calendarRevision))).returning();
  if (saved[0]) return presentSchedulingRequest(saved[0]);
  const current = (await db.select().from(schedulingRequests).where(eq(schedulingRequests.id, order.id)).limit(1))[0];
  return current ? presentSchedulingRequest(current) : order;
}
