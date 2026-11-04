import { CALENDARIZATION_CARRIER_ALIASES, CALENDARIZATION_SOURCE } from "../config/calendarization";
import { dateSchema, type Cycle } from "./model";
export type CalendarizationType = "none" | "FF" | "SDD";
export type CalendarStatus = "not_applicable" | "checking" | "matched" | "off" | "not_found" | "carrier_mismatch" | "modal_mismatch" | "cycle_mismatch" | "period_missing" | "quantity_exceeded" | "ambiguous" | "unavailable";
export const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  not_applicable: "Sem consulta", checking: "Consultando planilha", matched: "Calendarização conferida",
  off: "Sem disponibilidade", not_found: "Não encontrado", carrier_mismatch: "Transportadora divergente",
  modal_mismatch: "Modal divergente", cycle_mismatch: "Ciclo divergente", period_missing: "Período não publicado",
  quantity_exceeded: "Acima da calendarização", ambiguous: "Conferência necessária", unavailable: "Consulta indisponível",
};
export type FFCalendarRow = { facility: string; carrier: string; modal: string; plate: string; week: number; days: string[] };
export type SDDCalendarRow = { facility: string; carrier: string; modal: string; cycle: string; quantities: (number | null)[] };
export type CalendarSnapshot = { ff: FFCalendarRow[]; sdd: SDDCalendarRow[]; dates: string[]; fetchedAt: string };
export type CalendarCheck = { calendarStatus: CalendarStatus; calendarNotes: string; calendarCheckedAt: string | null; calendarSourceAt: string | null; calendarPlanned: number | null; calendarRequested: number | null };
export type CalendarSourceInfo = { facility: string; url: string; fetchedAt: string; dates: string[]; weeks: number[]; ffRows: number; sddRows: number; ffModals: string[]; sddModals: string[] };
export function normalizeLookup(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
export function normalizePlate(value: string) { return value.trim().toUpperCase().replace(/[\s-]/g, ""); }
export function validPlate(value: string) { return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(value)); }
export function modalLookupKey(value: string) {
  const key = normalizeLookup(value);
  return key === "UTILITARIOSSDD" ? "UTILITARIOSDD" : key;
}
export function calendarType(value: string): CalendarizationType { return value === "FF" || value === "SDD" ? value : "none"; }
export function calendarStatus(value: string): CalendarStatus { return Object.hasOwn(CALENDAR_STATUS_LABELS, value) ? value as CalendarStatus : "unavailable"; }
export function isoWeek(date: string) {
  const value = new Date(date + "T12:00:00Z"); const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const year = value.getUTCFullYear();
  return { year, week: Math.ceil((((value.getTime() - Date.UTC(year, 0, 1, 12)) / 86400000) + 1) / 7) };
}
export function sourceDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const date = match ? `${match[3]}-${match[2]}-${match[1]}` : value.trim();
  return dateSchema.safeParse(date).success ? date : null;
}

// CSV parser is bounded and handles quoted commas, embedded newlines and CRLF.
// The Worker fetches only the SMG1 projection, never the full national workbook.
export function parseCalendarCsv(text: string): string[][] {
  if (text.length > 2_000_000 || /^\s*</.test(text)) throw new Error("Resposta da planilha inválida.");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  function cell() { row.push(field); field = ""; if (row.length > 100) throw new Error("Colunas inesperadas na planilha."); }
  function line() { cell(); if (row.some(value => value !== "")) rows.push(row); row = []; if (rows.length > 10000) throw new Error("Consulta da planilha excedeu o limite."); }
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (!quoted && field !== "") throw new Error("CSV com aspas inválidas.");
      else quoted = !quoted;
    } else if (char === "," && !quoted) cell();
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; line(); }
    else field += char;
    if (field.length > 4000) throw new Error("Célula inesperadamente extensa.");
  }
  if (quoted) throw new Error("CSV incompleto.");
  if (field !== "" || row.length) line();
  return rows;
}
function requireHeader(headers: string[], index: number, allowed: string[]) {
  if (!allowed.some(name => normalizeLookup(headers[index] ?? "") === normalizeLookup(name))) throw new Error("A estrutura da planilha mudou. Revise as colunas de calendarização.");
}
export function parseFFCalendar(text: string): FFCalendarRow[] {
  const [headers, ...rows] = parseCalendarCsv(text); if (!headers) throw new Error("A aba FF está vazia.");
  requireHeader(headers, 4, ["Facility final"]); requireHeader(headers, 7, ["Placa"]);
  requireHeader(headers, 8, ["Cadastro Final"]); requireHeader(headers, 9, ["MLP"]); requireHeader(headers, 18, ["Semana"]);
  for (const [index, name] of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"].entries()) requireHeader(headers, 11 + index, [name]);
  return rows.filter(row => row[4]?.trim().toUpperCase() === CALENDARIZATION_SOURCE.facility).map(row => ({
    facility: row[4].trim(), carrier: row[9]?.trim() ?? "", modal: (row[8] || row[5] || "").trim(),
    plate: normalizePlate(row[7] ?? ""), week: /^\d{1,2}$/.test(row[18] ?? "") ? Number(row[18]) : 0,
    days: Array.from({ length: 7 }, (_, index) => row[11 + index]?.trim() ?? ""),
  }));
}
export function parseSDDCalendar(text: string) {
  const [headers, ...rows] = parseCalendarCsv(text); if (!headers) throw new Error("A aba SDD está vazia.");
  requireHeader(headers, 1, ["Saída LM"]); requireHeader(headers, 2, ["MLP"]); requireHeader(headers, 3, ["Cadatro", "Cadastro"]); requireHeader(headers, 4, ["Ciclo"]);
  const dates = headers.slice(5, 12).map(sourceDate);
  if (dates.length !== 7 || dates.some(date => !date) || new Set(dates).size !== 7) throw new Error("As datas da aba SDD não estão disponíveis.");
  const parsed: SDDCalendarRow[] = rows.filter(row => row[1]?.trim().toUpperCase() === CALENDARIZATION_SOURCE.facility).map(row => ({
    facility: row[1].trim(), carrier: row[2]?.trim() ?? "", modal: row[3]?.trim() ?? "", cycle: row[4]?.trim() ?? "",
    quantities: Array.from({ length: 7 }, (_, index) => /^\d+$/.test(row[5 + index]?.trim() ?? "") ? Number(row[5 + index]) : null),
  }));
  return { rows: parsed, dates: dates as string[] };
}
export function sourceCycles(value: string): Cycle[] {
  const tokens = value.toUpperCase().trim().split(/\s*[/,;+|]\s*/);
  return [...new Set(tokens.flatMap((token): Cycle[] => {
    const code = normalizeLookup(token);
    if (code === "CPMCHP" || code === "CPM" || code === "CHP") return ["CPM(CHP)"];
    if (/^SDE\d*$/.test(code)) return ["SDE"];
    if (/^SD\d*$/.test(code)) return ["SD"];
    if (/^AM(?:\d+|V|DE|BK|B|P)?$/.test(code)) return ["AM"];
    if (/^PM\d*$/.test(code)) return ["PM"];
    return [];
  }))];
}
function carrierMatches(source: string, carrier: string, name: string) {
  return [carrier, name, ...(CALENDARIZATION_CARRIER_ALIASES[carrier] ?? [])].some(value => normalizeLookup(value) === normalizeLookup(source));
}
export type CalendarLookup = { type: CalendarizationType; carrier: string; carrierName: string; modalName: string; plate: string; date: string; cycle: Cycle; quantity: number; requestedTotal?: number };
export function checkCalendar(snapshot: CalendarSnapshot, request: CalendarLookup): CalendarCheck {
  const base: CalendarCheck = { calendarStatus: "not_applicable", calendarNotes: "", calendarCheckedAt: new Date().toISOString(), calendarSourceAt: snapshot.fetchedAt, calendarPlanned: null, calendarRequested: request.requestedTotal ?? request.quantity };
  const result = (status: CalendarStatus, notes: string, planned: number | null = null) => ({ ...base, calendarStatus: status, calendarNotes: notes, calendarPlanned: planned });
  if (request.type === "none") return { ...base, calendarCheckedAt: null, calendarSourceAt: null, calendarRequested: null };
  if (request.type === "FF") {
    const operation = isoWeek(request.date);
    const anchor = isoWeek(snapshot.dates[0]);
    const sourceYear = operation.week - anchor.week > 26 ? anchor.year - 1 : operation.week - anchor.week < -26 ? anchor.year + 1 : anchor.year;
    if (sourceYear !== operation.year || !snapshot.ff.some(row => row.week === operation.week)) return result("period_missing", `SMG1 · FF: a semana W${operation.week}/${operation.year} da data do pedido ainda não está publicada na planilha.`);
    const plate = snapshot.ff.filter(row => row.facility === CALENDARIZATION_SOURCE.facility && row.week === operation.week && row.plate === normalizePlate(request.plate));
    if (!plate.length) return result("not_found", "SMG1 · FF: placa não encontrada na semana do pedido.");
    const carrier = plate.filter(row => carrierMatches(row.carrier, request.carrier, request.carrierName));
    if (!carrier.length) return result("carrier_mismatch", "SMG1 · FF: a placa está vinculada a outra transportadora nesta semana.");
    const modal = carrier.filter(row => modalLookupKey(row.modal) === modalLookupKey(request.modalName));
    if (!modal.length) return result("modal_mismatch", "SMG1 · FF: o modal da placa difere do modal configurado para consulta.");
    const unique = [...new Map(modal.map(row => [JSON.stringify(row.days), row])).values()];
    if (unique.length !== 1) return result("ambiguous", "SMG1 · FF: há escalas diferentes para a mesma placa. Confira a planilha.");
    const weekday = (new Date(request.date + "T12:00:00Z").getUTCDay() + 6) % 7;
    const scheduled = unique[0].days[weekday];
    if (normalizeLookup(scheduled) === "FOLGA") return result("off", "SMG1 · FF: a placa está de folga no dia do pedido.", 0);
    const cycles = sourceCycles(scheduled);
    if (!cycles.length) return result("ambiguous", "SMG1 · FF: a escala deste dia está vazia ou exige conferência.");
    if (!cycles.includes(request.cycle)) return result("cycle_mismatch", `SMG1 · FF: escala ${scheduled}; pedido no ciclo ${request.cycle}.`, 1);
    return result("matched", `SMG1 · FF: placa, transportadora e modal conferidos. Escala ${scheduled} na semana ${operation.week}/${operation.year}.`, 1);
  }
  const dateIndex = snapshot.dates.indexOf(request.date);
  if (dateIndex < 0) {
    const operation = isoWeek(request.date);
    return result("period_missing", `SMG1 · SDD: a data do pedido, na semana W${operation.week}/${operation.year}, ainda não está publicada na planilha.`);
  }
  const carrier = snapshot.sdd.filter(row => row.facility === CALENDARIZATION_SOURCE.facility && carrierMatches(row.carrier, request.carrier, request.carrierName));
  if (!carrier.length) return result("not_found", "SMG1 · SDD: transportadora sem calendarização para consulta.");
  const modal = carrier.filter(row => modalLookupKey(row.modal) === modalLookupKey(request.modalName));
  if (!modal.length) return result("modal_mismatch", "SMG1 · SDD: modal não encontrado para esta transportadora.");
  const cycle = modal.filter(row => sourceCycles(row.cycle).includes(request.cycle));
  if (!cycle.length) return result("cycle_mismatch", "SMG1 · SDD: modal sem calendarização neste ciclo.");
  if (cycle.length !== 1 || cycle[0].quantities[dateIndex] === null) return result("ambiguous", "SMG1 · SDD: quantidade ausente ou mais de uma linha para o mesmo modal e ciclo.");
  const planned = cycle[0].quantities[dateIndex]!;
  const requested = request.requestedTotal ?? request.quantity;
  if (planned === 0) return result("off", "SMG1 · SDD: nenhum veículo calendarizado neste dia e ciclo.", 0);
  if (requested > planned) return result("quantity_exceeded", `SMG1 · SDD: ${planned} veículo(s) calendarizado(s); ${requested} solicitado(s) em pedidos pendentes ou feitos neste dia, ciclo e modal.`, planned);
  return result("matched", `SMG1 · SDD: ${planned} veículo(s) calendarizado(s); ${requested} solicitado(s) neste dia, ciclo e modal. A aba SDD não possui placas.`, planned);
}
export function calendarSourceInfo(snapshot: CalendarSnapshot): CalendarSourceInfo {
  return { facility: CALENDARIZATION_SOURCE.facility, url: CALENDARIZATION_SOURCE.url, fetchedAt: snapshot.fetchedAt, dates: snapshot.dates,
    weeks: [...new Set(snapshot.ff.map(row => row.week).filter(week => week > 0))].sort((a, b) => a - b), ffRows: snapshot.ff.length, sddRows: snapshot.sdd.length,
    ffModals: [...new Set(snapshot.ff.map(row => row.modal))].sort(), sddModals: [...new Set(snapshot.sdd.map(row => row.modal))].sort(),
  };
}
