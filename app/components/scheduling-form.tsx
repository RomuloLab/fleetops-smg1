"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, CheckCircle2, Info, LoaderCircle, LockKeyhole, Minus, Plus, RefreshCw, Settings2, Truck } from "lucide-react";
import { availableCycles, DATE_CLOSED_MESSAGE, formatDate, formatTime, isSunday, type Carrier, type Cycle, type OperationWindow } from "@/lib/model";
import { requestProtocol, type SchedulingData, type SchedulingModal, type SchedulingRequest } from "@/lib/scheduling";
import { AMBULANCE_RELEASERS } from "@/config/ambulance-releasers";
import CarrierLogo from "./carrier-logo";
import SchedulingStatusBadge from "./scheduling-status";
import { newRequestId } from "@/lib/request-id";
import { useOperationWindow } from "./use-operation-window";
import SchedulingPlates from "./scheduling-plates";
import CalendarizationResult from "./calendarization-result";
import { inspectSchedulingPlates } from "@/lib/scheduling-plates";
type Props = { refreshSignal: number; historyFocus: number; carrier: Carrier; date: string; cycle: Cycle; accessKey: string | null; onDateChange: (date: string) => void; onCycleChange: (cycle: Cycle) => void };
export default function SchedulingForm({ refreshSignal, historyFocus, carrier, date, cycle, accessKey, onDateChange, onCycleChange }: Props) {
  const [modals, setModals] = useState<SchedulingModal[]>([]); const [requests, setRequests] = useState<SchedulingRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0); const [access, setAccess] = useState<OperationWindow | null>(null);
  const [modalId, setModalId] = useState(""); const [quantity, setQuantity] = useState("1");
  const [licensePlates, setLicensePlates] = useState<string[]>([]);
  const [contact, setContact] = useState(""); const [notes, setNotes] = useState("");
  const [ambulance, setAmbulance] = useState(false); const [ambulanceReleasedBy, setAmbulanceReleasedBy] = useState("");
  const [loadedScope, setLoadedScope] = useState(""); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(""); const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState<SchedulingRequest | null>(null); const [reload, setReload] = useState(0);
  const attempt = useRef<string | null>(null); const scope = `${date}|${cycle}`;
  const closed = useOperationWindow(access); const ready = !loading && loadedScope === scope && !loadError;
  const editable = ready && !!access && !closed && modals.length > 0;
  const selectedModal = modals.find(modal => modal.id === modalId);
  const fixed = !!selectedModal?.isFixedFleet;
  const vehicleCount = Math.min(9999, Math.max(0, Number(quantity) || 0));
  const activePlates = Array.from({ length: vehicleCount }, (_, index) => licensePlates[index] ?? "");
  const validPlates = inspectSchedulingPlates(activePlates).valid;
  const platesComplete = vehicleCount > 0 && validPlates === vehicleCount;
  useEffect(() => { setLicensePlates([]); attempt.current = null; setSent(null); setSendError(""); }, [selectedModal?.id, fixed]);
  useEffect(() => { setSent(null); setSendError(""); attempt.current = null; setModalId(""); setAmbulance(false); setAmbulanceReleasedBy(""); }, [date, cycle]);
  useEffect(() => {
    if (!accessKey) return;
    const controller = new AbortController(); let busy = false; setLoading(true); setLoadError("");
    async function refresh() {
      if (busy) return; busy = true;
      try {
        const response = await fetch(`/api/scheduling?transportadora=${carrier.slug}&data=${date}&ciclo=${encodeURIComponent(cycle)}`, { headers: { Authorization: `Bearer ${accessKey}` }, signal: controller.signal, cache: "no-store" });
        const body = await response.json() as SchedulingData & { modals: SchedulingModal[]; error?: string };
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os pedidos.");
        if (controller.signal.aborted) return;
        setModals(body.modals); setRequests(body.requests); setTotalRequests(body.total); setAccess(body.window); setLoadedScope(scope); setLoadError("");
        setModalId(current => body.modals.some(modal => modal.id === current) ? current : "");
      } catch (cause) { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
      finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    function visible() { if (!document.hidden) void refresh(); }
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [accessKey, carrier.slug, date, cycle, scope, reload, refreshSignal]);
  useEffect(() => { if (historyFocus > 0 && ready) document.getElementById("carrier-scheduling-history")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [historyFocus, ready]);
  function dirty() { attempt.current = null; setSent(null); setSendError(""); }
  function updateQuantity(value: string) { setQuantity(value); const count = Number(value); if (count >= 1) setLicensePlates(current => current.slice(0, count)); dirty(); }
  function newRequest() { dirty(); setQuantity("1"); setLicensePlates([]); setNotes(""); setAmbulance(false); setAmbulanceReleasedBy(""); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editable || saving || sent || !accessKey || !selectedModal || (ambulance && !ambulanceReleasedBy) || (fixed && !platesComplete)) return;
    attempt.current ??= newRequestId(); setSaving(true); setSendError("");
    try {
      const response = await fetch("/api/scheduling", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessKey}` }, body: JSON.stringify({ id: attempt.current, carrier: carrier.slug, date, cycle, modalId, quantity: Number(quantity), contact, notes, ambulance, ambulanceReleasedBy: ambulance ? ambulanceReleasedBy : "", licensePlates: fixed ? activePlates : [] }) });
      const body = await response.json() as { error?: string; code?: string; request: SchedulingRequest; window?: OperationWindow };
      if (body.window) setAccess(body.window);
      if (body.code === "DATE_CLOSED") return;
      if (!response.ok) throw new Error(body.error || "O pedido ainda não foi confirmado.");
      setSent(body.request); setReload(value => value + 1);
    } catch (cause) { setSendError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente para confirmar o pedido."); }
    finally { setSaving(false); }
  }
  return <div className="scheduling-carrier">
    <div className="carrier-status-guide"><Info size={16}/><p>Os pedidos entram como <strong>Pendentes</strong>. Acompanhe o status e os informativos abaixo. Ative os alertas no topo e mantenha o site aberto para receber som e aviso quando um pedido for feito.</p></div>
    {ready && !modals.length && <section className="scheduling-setup"><span className="setup-icon"><Settings2 size={23}/></span><div><strong>Modais em configuração</strong><p>A operação vai cadastrar os modais da {carrier.name}. Assim que forem liberados, você poderá enviar seus pedidos por aqui.</p></div><span className="setup-badge">Cadastro pendente</span></section>}
    {ready && closed && <section className="closed-banner" role="status"><LockKeyhole size={20}/><div><strong>Data encerrada · Somente consulta</strong><p>{DATE_CLOSED_MESSAGE}</p></div></section>}
    <form onSubmit={submit} className="form-layout"><div className="form-left">
      <section className="form-card"><div className="section-title"><span className="step-number">01</span><div><h2>Dados do pedido</h2><p>Escolha a data e o ciclo da operação.</p></div></div><div className="operation-fields"><label>Data da operação<span className="input-icon"><CalendarDays size={17}/><input aria-label="Data do pedido" type="date" required value={date} disabled={saving} onChange={event => { if (event.target.value) onDateChange(event.target.value); }}/></span></label><label>Ciclo<select className="cycle-select" aria-label="Ciclo do pedido" value={cycle} disabled={saving} onChange={event => onCycleChange(event.target.value as Cycle)}>{availableCycles(date).map(option => <option key={option} value={option}>{option}</option>)}</select></label></div>{isSunday(date) && <p className="calendar-note"><Info size={14}/>Domingo: disponíveis AM, SD e SDE.</p>}</section>
      <section className="form-card"><div className="section-title"><span className="step-number">02</span><div><h2>Modal e quantidade</h2><p>Os modais liberados serão específicos da sua transportadora.</p></div>{loading && <LoaderCircle className="spin" size={17}/>}</div><fieldset disabled={!editable || saving || !!sent}><label className="field-label" htmlFor="scheduling-modal">Modal do pedido<select id="scheduling-modal" className="cycle-select" required value={modalId} onChange={event => { setModalId(event.target.value); dirty(); }}><option value="">{loading ? "Carregando modais..." : !modals.length ? "Aguardando cadastro dos modais" : "Selecione um modal"}</option>{modals.map(modal => <option key={modal.id} value={modal.id}>{modal.name}{modal.isFixedFleet ? " · Frota fixa" : ""}</option>)}</select></label><label className="field-label quantity-label" htmlFor="scheduling-quantity">Quantidade de veículos</label><div className="quantity-control scheduling-quantity"><button type="button" aria-label="Diminuir quantidade do pedido" disabled={Number(quantity) <= 1} onClick={() => { updateQuantity(String(Math.max(1, Number(quantity) - 1))); }}><Minus size={16}/></button><input id="scheduling-quantity" type="number" inputMode="numeric" min={1} max={9999} step={1} required value={quantity} onChange={event => { if (event.target.value === "" || /^\d{1,4}$/.test(event.target.value)) { updateQuantity(event.target.value); } }}/><button type="button" aria-label="Aumentar quantidade do pedido" disabled={Number(quantity) >= 9999} onClick={() => { updateQuantity(String(Number(quantity || 0) + 1)); }}><Plus size={16}/></button></div>{fixed && <SchedulingPlates plates={activePlates} onChange={plates => { setLicensePlates(plates); dirty(); }}/>}<div className="ambulance-options"><label className="ambulance-checkbox" htmlFor="scheduling-ambulance"><input id="scheduling-ambulance" type="checkbox" checked={ambulance} aria-controls="scheduling-ambulance-release" onChange={event => { setAmbulance(event.target.checked); if (!event.target.checked) setAmbulanceReleasedBy(""); dirty(); }}/><span><strong>Ambulância</strong><small>Ao marcar, informe quem liberou a ambulância.</small></span></label>{ambulance && <div id="scheduling-ambulance-release" className="ambulance-releaser-field"><label className="field-label" htmlFor="scheduling-ambulance-releaser">Quem liberou a ambulância?<span className="required-hint">obrigatório</span><select id="scheduling-ambulance-releaser" className="cycle-select" required value={ambulanceReleasedBy} onChange={event => { setAmbulanceReleasedBy(event.target.value); dirty(); }}><option value="">Selecione quem liberou</option>{AMBULANCE_RELEASERS.map(name => <option key={name} value={name}>{name}</option>)}</select></label></div>}</div></fieldset></section>
      <section className="form-card"><div className="section-title"><span className="step-number">03</span><div><h2>Responsável pelo pedido</h2><p>Informe quem a operação pode procurar.</p></div></div><fieldset disabled={!editable || saving || !!sent}><label className="field-label" htmlFor="scheduling-contact">Nome do responsável<input id="scheduling-contact" required minLength={2} maxLength={80} autoComplete="name" placeholder="Seu nome" value={contact} onChange={event => { setContact(event.target.value); dirty(); }}/></label><label className="field-label" htmlFor="scheduling-notes">Observações<span className="optional">opcional</span><textarea id="scheduling-notes" rows={3} maxLength={500} placeholder="Informações para a equipe da operação" value={notes} onChange={event => { setNotes(event.target.value); dirty(); }}/></label><small className="char-count">{notes.length}/500</small></fieldset></section>
    </div><aside className="form-summary"><div className="summary-top"><span className="eyebrow">RESUMO DO PEDIDO</span><span className="cycle-pill">{cycle}</span></div><div className="summary-carrier-heading"><CarrierLogo slug={carrier.slug} size="card"/><h2>{carrier.name}</h2></div><p className="summary-date"><CalendarDays size={15}/>{formatDate(date)}</p><div className="summary-total"><strong>{selectedModal ? Number(quantity || 0) : "—"}</strong><span>veículos no pedido</span></div><div className="summary-modals"><div><span>Modal</span><strong>{selectedModal?.name ?? "Aguardando seleção"}</strong></div>{fixed && <div><span>Placas · Frota fixa</span><strong>{validPlates} de {vehicleCount} válidas</strong></div>}<div><span>Transportadora</span><strong>{carrier.name}</strong></div>{ambulance && <><div><span>Tipo de pedido</span><strong>Ambulância</strong></div><div><span>Liberado por</span><strong>{ambulanceReleasedBy || "Selecione quem liberou"}</strong></div></>}</div>
      {(loadError || sendError) && <div className="notice error" role="alert"><p>{loadError || sendError}</p>{loadError && <button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={14}/>Tentar novamente</button>}</div>}
      {sent && <div className="notice success" role="status"><CheckCircle2 size={18}/><span><strong>Pedido enviado! {requestProtocol(sent.id)}</strong>Status inicial: Pendente. Acompanhe a conclusão em Meus pedidos.</span></div>}
      <button className="button primary full" type="submit" disabled={!editable || saving || !selectedModal || Number(quantity) < 1 || (ambulance && !ambulanceReleasedBy) || (fixed && !platesComplete) || !!sent}>{saving ? <><LoaderCircle className="spin" size={17}/>Enviando...</> : ready && closed ? <><LockKeyhole size={17}/>Prazo encerrado</> : sent ? <><CheckCircle2 size={17}/>Pedido enviado</> : ready && !modals.length ? <><LockKeyhole size={17}/>Aguardando modais</> : <>Enviar pedido<ArrowRight size={17}/></>}</button>
      {sent && !closed && <button className="button summary-new-request full" type="button" onClick={newRequest}>Fazer outro pedido</button>}
      <p className="summary-help"><Info size={15}/><span>{ready && closed ? "Os pedidos desta data estão disponíveis somente para consulta." : "Confira os dados antes de enviar. O pedido será encaminhado à equipe da operação."}</span></p>
    </aside></form>
    <section id="carrier-scheduling-history" className="scheduling-history"><div className="panel-heading"><div><h2>Meus pedidos<span className="count-badge">{ready ? totalRequests : "—"}</span></h2><p>{formatDate(date)} · Ciclo {cycle}</p></div><CalendarClock size={20}/></div>{!ready ? <div className="scheduling-empty"><LoaderCircle className="spin" size={26}/><p>{loadError || "Carregando pedidos..."}</p></div> : !requests.length ? <div className="scheduling-empty"><span className="empty-order-icon"><CalendarClock size={30}/></span><h3>Nenhum pedido por aqui ainda</h3><p>{modals.length ? "Seus pedidos enviados aparecerão aqui para acompanhamento." : "Seu histórico ficará disponível assim que os modais forem cadastrados e o primeiro pedido for enviado."}</p></div> : <div className="carrier-orders-list">{requests.map(order => <article className="carrier-order" key={order.id}><span className="small-icon"><Truck size={19}/></span><div><div className="order-line"><strong>{order.modalName}</strong><SchedulingStatusBadge status={order.status}/></div><p>{order.quantity} veículo{order.quantity === 1 ? "" : "s"} · {requestProtocol(order.id)}</p><small>{formatTime(order.createdAt)} · {order.contact}</small>{order.isFixedFleet && (order.licensePlates.length > 1 ? <details className="order-plates-details"><summary><span className="fixed-fleet-badge">Frota fixa</span>{order.licensePlates.length} placas · Ver lista e calendarização</summary><CalendarizationResult order={order}/></details> : <p className="order-fixed-fleet"><span className="fixed-fleet-badge">Frota fixa</span><strong className="license-plate">{order.licensePlate}</strong></p>)}{order.ambulance && <p className="order-ambulance-info"><span className="ambulance-badge">Ambulância</span><span>Liberado por: <strong>{order.ambulanceReleasedBy}</strong></span></p>}{order.notes && <p className="order-notes"><strong>Sua observação: </strong>{order.notes}</p>}<div className={"order-informative " + order.status}><strong>Informativos do pedido</strong><p>{order.resolutionNotes || (order.status === "done" ? "Pedido realizado pela operação." : "Seu pedido está pendente de conclusão pela operação.")}</p>{order.statusUpdatedAt && <small>Atualizado em {formatTime(order.statusUpdatedAt)} · Horário de Brasília</small>}</div></div></article>)}{totalRequests > requests.length && <p className="recent-orders-note">Exibindo os {requests.length} pedidos mais recentes de {totalRequests} nesta data e ciclo.</p>}</div>}</section>
  </div>;
}
