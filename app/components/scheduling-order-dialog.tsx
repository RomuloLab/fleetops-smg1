"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck2, CheckCircle2, LoaderCircle, Truck, X, XCircle } from "lucide-react";
import { formatDate, formatTime, operationDate } from "@/lib/model";
import { requestProtocol, type SchedulingRequest } from "@/lib/scheduling";
import { useCarrierCatalog } from "./carrier-catalog";
import CarrierLogo from "./carrier-logo";
import SchedulingStatusBadge from "./scheduling-status";
import { newRequestId } from "@/lib/request-id";
import CalendarizationResult from "./calendarization-result";
export default function SchedulingOrderDialog({ order, onClose, onSaved }: { order: SchedulingRequest; onClose: () => void; onSaved: (order: SchedulingRequest) => void }) {
  const { findCarrier: getCarrier } = useCarrierCatalog();
  const dialog = useRef<HTMLDialogElement>(null); const reasonField = useRef<HTMLTextAreaElement>(null);
  const [current, setCurrent] = useState(order); const [editingReason, setEditingReason] = useState(false);
  const [reason, setReason] = useState(order.resolutionNotes); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [saved, setSaved] = useState("");
  const [checking, setChecking] = useState(false); const [calendarError, setCalendarError] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setCurrent(previous => order.calendarRevision > previous.calendarRevision ? { ...previous,
      calendarStatus: order.calendarStatus, calendarNotes: order.calendarNotes, calendarCheckedAt: order.calendarCheckedAt,
      calendarSourceAt: order.calendarSourceAt, calendarPlanned: order.calendarPlanned, calendarRequested: order.calendarRequested,
      calendarRevision: order.calendarRevision, calendarVehicles: order.calendarVehicles,
    } : previous);
  }, [order]);
  useEffect(() => { if (editingReason) reasonField.current?.focus(); }, [editingReason]);
  async function recheck() {
    if (checking || saving) return; setChecking(true); setCalendarError("");
    try {
      const response = await fetch("/api/gestao/calendarizacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_order", id: current.id }) });
      const body = await response.json() as { request?: SchedulingRequest; error?: string };
      if (!response.ok || !body.request) throw new Error(body.error || "A consulta não foi confirmada.");
      setCurrent(body.request); onSaved(body.request);
    } catch (cause) { setCalendarError(cause instanceof Error ? cause.message : "Falha ao consultar a planilha."); }
    finally { setChecking(false); }
  }
  async function resolve(status: "done" | "not_done") {
    if (saving) return;
    const resolutionNotes = status === "not_done" ? reason.trim() : "";
    if (status === "not_done" && !resolutionNotes) { setError("Informe o motivo de o pedido não ter sido feito."); reasonField.current?.focus(); return; }
    const signature = `${current.id}|${current.statusRevision}|${status}|${resolutionNotes}`;
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: newRequestId() };
    setSaving(true); setError(""); setSaved("");
    try {
      const response = await fetch("/api/gestao/scheduling", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id, changeId: attempt.current.id, revision: current.statusRevision, status, resolutionNotes }) });
      const body = await response.json() as { request?: SchedulingRequest; error?: string };
      if (!response.ok) {
        if (response.status === 409 && body.request) { setCurrent(body.request); onSaved(body.request); attempt.current = null; }
        throw new Error(body.error || "Não foi possível atualizar o pedido.");
      }
      if (!body.request) throw new Error("Não foi possível confirmar a atualização.");
      setCurrent(body.request); onSaved(body.request); setEditingReason(false); attempt.current = null;
      setSaved(status === "done" ? "Pedido marcado como feito. O aviso foi disponibilizado para a transportadora." : "Pedido marcado como não feito. O aviso e o motivo foram disponibilizados para a transportadora.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verifique a conexão e tente novamente."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="response-dialog scheduling-resolution-dialog" aria-labelledby="scheduling-detail-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="panel-heading"><div className="dialog-carrier-heading"><CarrierLogo slug={current.carrier} size="card"/><div><span className="eyebrow">PEDIDO DE SCHEDULING</span><h2 id="scheduling-detail-title">{requestProtocol(current.id)}</h2></div></div><button autoFocus className="icon-button" aria-label="Fechar pedido" disabled={saving} onClick={onClose}><X size={19}/></button></div>
    <p>{getCarrier(current.carrier)?.name} · {formatDate(current.date)} · {current.cycle}</p>
    <div className="request-detail-total"><Truck size={24}/><div><strong>{current.quantity} veículo{current.quantity === 1 ? "" : "s"}</strong><span>{current.modalName}</span></div><SchedulingStatusBadge status={current.status}/></div>
    {current.calendarizationType !== "none" && <section className="calendar-order-detail"><h3>Calendarização · SMG1</h3><CalendarizationResult order={current}/><button type="button" className="button secondary small" disabled={checking || saving} onClick={() => void recheck()}>{checking ? <LoaderCircle className="spin" size={15}/> : <CalendarCheck2 size={15}/>}Reconsultar planilha</button>{calendarError && <p className="registration-field-error" role="alert">{calendarError}</p>}</section>}
    <dl>{current.ambulance && <><dt>Tipo de pedido</dt><dd><span className="ambulance-badge">Ambulância</span></dd><dt>Ambulância liberada por</dt><dd>{current.ambulanceReleasedBy}</dd></>}<dt>Responsável</dt><dd>{current.contact}</dd><dt>Observações da transportadora</dt><dd>{current.notes || "Nenhuma observação informada."}</dd><dt>Enviado em</dt><dd>{formatTime(current.createdAt)} · Horário de Brasília</dd><dt>Observação da operação</dt><dd>{current.resolutionNotes || (current.status === "done" ? "Pedido realizado pela operação." : "Aguardando conclusão pela operação.")}</dd>{current.statusUpdatedAt && <><dt>Status atualizado em</dt><dd>{formatDate(operationDate(new Date(current.statusUpdatedAt)))} · {formatTime(current.statusUpdatedAt)} · Horário de Brasília</dd></>}</dl>
    <section className="resolution-actions"><h3>Atualizar pedido</h3><p>O status e o motivo informado ficam visíveis para a transportadora.</p><div className="resolution-buttons"><button className="button resolution-done" disabled={saving || current.status === "done"} onClick={() => void resolve("done")}><CheckCircle2 size={17}/>Marcar como feito</button><button className="button resolution-not-done" disabled={saving || editingReason} onClick={() => { setReason(current.resolutionNotes); setEditingReason(true); setError(""); setSaved(""); }}><XCircle size={17}/>Marcar como não feito</button></div>
      {editingReason && <form className="resolution-reason" onSubmit={event => { event.preventDefault(); void resolve("not_done"); }}><label className="field-label" htmlFor="resolution-reason">Motivo de não realização<span className="required-hint">obrigatório</span><textarea ref={reasonField} id="resolution-reason" rows={4} required maxLength={1000} value={reason} disabled={saving} placeholder="Explique por que o pedido não foi feito" onChange={event => { setReason(event.target.value); setError(""); }}/></label><small className="char-count">{reason.length}/1000</small><div className="resolution-buttons"><button className="button resolution-not-done" type="submit" disabled={saving || !reason.trim()}>{saving ? <LoaderCircle size={16} className="spin"/> : <XCircle size={16}/>}Salvar como não feito</button><button className="button secondary" type="button" disabled={saving} onClick={() => { setEditingReason(false); setError(""); }}>Cancelar</button></div></form>}
      {saving && !editingReason && <p role="status"><LoaderCircle size={14} className="spin"/>Salvando atualização...</p>}
      {error && <div className="notice error" role="alert">{error}</div>}{saved && <div className="notice success" role="status"><CheckCircle2 size={17}/>{saved}</div>}
    </section><button className="button secondary full" disabled={saving} onClick={onClose}>Fechar</button>
  </dialog>;
}
