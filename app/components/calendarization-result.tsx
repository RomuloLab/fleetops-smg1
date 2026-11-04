"use client";
import { useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { CALENDAR_STATUS_LABELS } from "@/lib/calendarization-model";
import { formatTime } from "@/lib/model";
import type { SchedulingRequest } from "@/lib/scheduling";
const PAGE_SIZE = 6;
export default function CalendarizationResult({ order, compact = false }: { order: SchedulingRequest; compact?: boolean }) {
  const [page, setPage] = useState(0);
  if (order.calendarizationType === "none") return <span className="calendar-not-applicable">—</span>;
  const plates = order.licensePlates ?? (order.licensePlate ? [order.licensePlate] : []);
  const pages = Math.max(1, Math.ceil(plates.length / PAGE_SIZE)); const activePage = Math.min(page, pages - 1); const start = activePage * PAGE_SIZE;
  const checks = new Map((order.calendarVehicles ?? []).map(check => [check.licensePlate, check]));
  return <div className={"calendar-result " + (compact ? "compact" : "")}>
    <div className="calendar-result-heading"><span className={order.isFixedFleet ? "fixed-fleet-badge" : "sdd-calendar-badge"}>{order.isFixedFleet ? "Frota fixa · FF" : "SDD"}</span>{order.isFixedFleet && plates.length === 1 && <strong className="license-plate">{plates[0]}</strong>}{order.isFixedFleet && plates.length > 1 && <strong className="calendar-plate-count">{plates.length} placas</strong>}</div>
    {compact && plates.length > 1 && <div className="compact-plate-list">{plates.slice(0, 3).map(plate => <span key={plate} className="license-plate">{plate}</span>)}{plates.length > 3 && <small>+{plates.length - 3} no pedido</small>}</div>}
    <span className={`calendar-check-badge calendar-${order.calendarStatus}`}>{order.calendarStatus === "checking" ? <LoaderCircle className="spin" size={13}/> : <CalendarCheck2 size={13}/>}<span>{CALENDAR_STATUS_LABELS[order.calendarStatus]}</span></span>
    {order.calendarNotes && <p title={compact ? order.calendarNotes : undefined}>{order.calendarNotes}</p>}
    {!compact && plates.length > 1 && <div className="calendar-vehicles"><div className="calendar-vehicles-label">Veículos {start + 1}–{Math.min(start + PAGE_SIZE, plates.length)} de {plates.length}</div>{plates.slice(start, start + PAGE_SIZE).map((plate, offset) => {
      const check = checks.get(plate); const status = check?.calendarStatus ?? order.calendarStatus;
      return <article key={plate} className="calendar-vehicle"><div><small>Veículo {String(start + offset + 1).padStart(2, "0")}</small><strong className="license-plate">{plate}</strong><span className={`calendar-check-badge calendar-${status}`}>{CALENDAR_STATUS_LABELS[status]}</span></div><p>{check?.calendarNotes || "Aguardando consulta individual da placa."}</p></article>;
    })}{pages > 1 && <nav className="plate-pagination" aria-label="Páginas da calendarização por placa"><button type="button" className="button secondary small" disabled={activePage === 0} aria-label="Placas anteriores da calendarização" onClick={() => setPage(activePage - 1)}><ChevronLeft size={13}/>Anterior</button><span>{activePage + 1} de {pages}</span><button type="button" className="button secondary small" disabled={activePage >= pages - 1} aria-label="Próximas placas da calendarização" onClick={() => setPage(activePage + 1)}>Próxima<ChevronRight size={13}/></button></nav>}</div>}
    {order.calendarSourceAt && <small>Leitura da planilha: {formatTime(order.calendarSourceAt)}</small>}
  </div>;
}
