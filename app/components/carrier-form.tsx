"use client";
import { BRAND_NAME } from "@/config/brand";
import Brand from "./brand";
import ThemeToggle from "./theme-toggle";
import CalendarizationWeekTimer from "./calendarization-countdown";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, Check, CheckCircle2, ChevronRight, Info, LoaderCircle, LockKeyhole, Minus, Plus, RefreshCw, Truck } from "lucide-react";
import { type Availability, type Carrier, type Counts, type Cycle, type OperationWindow, CYCLE, DATE_CLOSED_MESSAGE, MODALS, availableCycles, dateSchema, formatDate, formatTime, isSunday, selectCycleForDate, total } from "@/lib/model";
import { useOperationWindow } from "./use-operation-window";
import CarrierLogo from "./carrier-logo";
import SchedulingForm from "./scheduling-form";
import { CarrierSchedulingAlerts } from "./scheduling-alerts";
import StelaChat from "./stela-chat";
type FormCounts = Record<keyof Counts, string>;
export default function CarrierForm({ carrier, initialDate }: { carrier: Carrier; initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [tab, setTab] = useState<"availability" | "scheduling">("availability");
  const [cycle, setCycle] = useState<Cycle>(() => selectCycleForDate(initialDate, CYCLE));
  const [key, setKey] = useState<string | null>(null);
  const [counts, setCounts] = useState<FormCounts>({ utilitarios: "0", vans: "0", vucs: "0", outros: "0" });
  const [contact, setContact] = useState(""); const [notes, setNotes] = useState("");
  const [noVehicles, setNoVehicles] = useState(false);
  const [saved, setSaved] = useState<Availability | null>(null);
  const [loadedScope, setLoadedScope] = useState("");
  const [access, setAccess] = useState<OperationWindow | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(""); const [sendError, setSendError] = useState("");
  const [invalid, setInvalid] = useState(false); const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);
  const [statusRefresh, setStatusRefresh] = useState(0); const [historyFocus, setHistoryFocus] = useState(0);
  const numeric: Counts = { utilitarios: Number(counts.utilitarios || 0), vans: Number(counts.vans || 0), vucs: Number(counts.vucs || 0), outros: Number(counts.outros || 0) };
  const vehicleTotal = total(numeric);
  const scope = `${date}|${cycle}`;
  const ready = !loading && loadedScope === scope && !loadError;
  const closed = useOperationWindow(access);
  const editable = ready && !!access && !closed;
  const showCounts = ready && (!closed || saved !== null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("aba") === "scheduling") setTab("scheduling");
    const selectedDate = dateSchema.safeParse(query.get("data"));
    const selectedOperationDate = selectedDate.success ? selectedDate.data : initialDate;
    setDate(selectedOperationDate);
    setCycle(selectCycleForDate(selectedOperationDate, query.get("ciclo")));
    const value = new URLSearchParams(window.location.hash.slice(1)).get("chave");
    if (!value || !/^[a-f0-9]{64}$/.test(value)) { setInvalid(true); setLoading(false); return; }
    setKey(value);
  }, [initialDate]);
  useEffect(() => {
    if (!key || !date) return;
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setSendError(""); setSuccess(false);
    fetch(`/api/disponibilidade?transportadora=${carrier.slug}&data=${encodeURIComponent(date)}&ciclo=${encodeURIComponent(cycle)}`, { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json() as { error?: string; response: Availability | null; window: OperationWindow };
      if (controller.signal.aborted) return;
      if (response.status === 403) { setInvalid(true); throw new Error(body.error); }
      if (!response.ok) throw new Error(body.error);
      const row = body.response as Availability | null;
      setSaved(row); setLoadedScope(scope); setAccess(body.window);
      setCounts(Object.fromEntries(MODALS.map(modal => [modal.key, String(row?.[modal.key] ?? 0)])) as FormCounts);
      setContact(row?.contact ?? ""); setNotes(row?.notes ?? ""); setNoVehicles(!!row && total(row) === 0);
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Não foi possível carregar. Tente novamente."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [key, date, cycle, scope, carrier.slug, reload]);
  function changeCount(modal: keyof Counts, value: string) {
    if (value === "" || /^\d{1,4}$/.test(value)) { setCounts(previous => ({ ...previous, [modal]: value })); setSuccess(false); setSendError(""); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!key || !editable || saving) return;
    setSaving(true); setSendError(""); setSuccess(false);
    try {
      const response = await fetch("/api/disponibilidade", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ carrier: carrier.slug, date, cycle, ...numeric, contact, notes, noVehicles, revision: saved?.revision ?? null }) });
      const body = await response.json() as { error?: string; code?: string; response: Availability; window?: OperationWindow };
      if (body.window) setAccess(body.window);
      if (body.code === "DATE_CLOSED") { setSuccess(false); setSendError(""); return; }
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar. Tente novamente.");
      setSaved(body.response); setSuccess(true);
    } catch (cause) { setSendError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <div className="carrier-page">
    <header className="public-header"><Brand/><div className="carrier-header-actions">{key && !invalid && <CarrierSchedulingAlerts carrier={carrier.slug} accessKey={key} onIncoming={() => setStatusRefresh(value => value + 1)} onOpen={event => { setDate(event.date); setCycle(event.cycle); setTab("scheduling"); setStatusRefresh(value => value + 1); setHistoryFocus(value => value + 1); }}/>}<span className="secure-label"><LockKeyhole size={13}/>Link da transportadora</span><CalendarizationWeekTimer/><ThemeToggle/></div></header>
    {invalid ? <main className="invalid-card"><LockKeyhole size={36}/><h1>Precisamos de um link válido.</h1><p>Solicite à operação o link exclusivo da {carrier.name} e abra a mensagem completa.</p></main> : <main className="carrier-main">
      <div className="breadcrumb">{BRAND_NAME} <ChevronRight size={13}/><strong>{carrier.name}</strong></div>
      <div className="carrier-heading"><div><span className="eyebrow">GESTÃO DE TRANSPORTADORAS</span><h1>{tab === "scheduling" ? "Scheduling" : ready && closed ? "Disponibilidade encerrada" : "Informe sua disponibilidade"}<span>.</span></h1><p>{tab === "scheduling" ? "Seus pedidos de veículos, organizados em um só lugar." : ready && closed ? "Consulte os dados desta operação." : "Quantos veículos podem atender a próxima expedição?"}</p></div><span className="carrier-identity"><CarrierLogo slug={carrier.slug} size="portal"/><span><small>TRANSPORTADORA</small><strong>{carrier.name}</strong></span></span></div>
      <nav className="carrier-tabs" role="tablist" aria-label="Área da transportadora" onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "availability" : event.key === "End" ? "scheduling" : tab === "availability" ? "scheduling" : "availability"; setTab(next); document.getElementById(next === "availability" ? "availability-tab" : "scheduling-tab")?.focus(); } }}><button type="button" role="tab" id="availability-tab" tabIndex={tab === "availability" ? 0 : -1} aria-selected={tab === "availability"} aria-controls="availability-panel" className={tab === "availability" ? "active" : ""} onClick={() => setTab("availability")}><Truck size={17}/>Disponibilidade</button><button type="button" role="tab" id="scheduling-tab" tabIndex={tab === "scheduling" ? 0 : -1} aria-selected={tab === "scheduling"} aria-controls="scheduling-panel" className={tab === "scheduling" ? "active" : ""} onClick={() => setTab("scheduling")}><CalendarClock size={17}/>Scheduling<span className="new-tab-badge">NOVO</span></button></nav>
      <section id="availability-panel" className="portal-panel" role="tabpanel" aria-labelledby="availability-tab" hidden={tab !== "availability"}>
      {ready && closed && <section className="closed-banner" role="status"><LockKeyhole size={20}/><div><strong>Data encerrada · Somente consulta</strong><p>{DATE_CLOSED_MESSAGE}</p>{!saved && <p>Não há resposta registrada para esta data e ciclo.</p>}</div></section>}
      <form onSubmit={submit} className="form-layout"><div className="form-left">
        <section className="form-card"><div className="section-title"><span className="step-number">01</span><div><h2>Dados da operação</h2><p>Confira a data antes de preencher.</p></div></div><div className="operation-fields"><label>Data da operação<span className="input-icon"><CalendarDays size={17}/><input aria-label="Data da operação" type="date" required value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setCycle(previous => selectCycleForDate(event.target.value, previous)); } }} disabled={saving}/></span></label><label>Ciclo<select className="cycle-select" aria-label="Ciclo da operação" value={cycle} disabled={saving} onChange={event => setCycle(event.target.value as Cycle)}>{availableCycles(date).map(option => <option key={option} value={option}>{option}</option>)}</select></label></div>{isSunday(date) && <p className="calendar-note" role="status"><Info size={14}/>Domingo: disponíveis AM, SD e SDE.</p>}</section>
        <section className="form-card"><div className="section-title"><span className="step-number">02</span><div><h2>Veículos disponíveis</h2><p>Informe a quantidade de cada modal.</p></div>{loading && <LoaderCircle className="spin" size={18}/>}</div><fieldset disabled={!editable || saving} className="vehicle-fieldset">
          <label className="zero-option"><input type="checkbox" checked={noVehicles} onChange={event => { setNoVehicles(event.target.checked); if (event.target.checked) setCounts(Object.fromEntries(MODALS.map(m => [m.key, "0"])) as FormCounts); setSuccess(false); setSendError(""); }}/><span>Não tenho veículos disponíveis nesta data.</span></label>
          <div className="modal-inputs">{MODALS.map(modal => <div className={"modal-input " + (noVehicles ? "muted" : "")} key={modal.key}><div className="modal-title"><Truck size={20}/><label htmlFor={modal.key}>{modal.name}</label></div><small>{modal.hint}</small><div className="quantity-control"><button type="button" aria-label={`Diminuir ${modal.name}`} disabled={noVehicles || Number(counts[modal.key]) === 0} onClick={() => changeCount(modal.key, String(Math.max(0, Number(counts[modal.key]) - 1)))}><Minus size={16}/></button><input id={modal.key} aria-label={`Quantidade de ${modal.name}`} type="number" inputMode="numeric" min="0" max="9999" step="1" required disabled={noVehicles} value={counts[modal.key]} onChange={event => changeCount(modal.key, event.target.value)}/><button type="button" aria-label={`Aumentar ${modal.name}`} disabled={noVehicles || Number(counts[modal.key]) >= 9999} onClick={() => changeCount(modal.key, String(Number(counts[modal.key]) + 1))}><Plus size={16}/></button></div></div>)}</div>
        </fieldset></section>
        <section className="form-card"><div className="section-title"><span className="step-number">03</span><div><h2>Quem está confirmando?</h2><p>Um contato para a equipe da operação.</p></div></div><label className="field-label" htmlFor="contact">Nome do responsável<input id="contact" type="text" required minLength={2} maxLength={80} placeholder="Seu nome" autoComplete="name" value={contact} disabled={!editable || saving} onChange={event => { setContact(event.target.value); setSuccess(false); setSendError(""); }}/></label><label className="field-label" htmlFor="notes">Observações<span className="optional">opcional</span><textarea id="notes" rows={3} maxLength={500} placeholder="Algum detalhe sobre os veículos ou a disponibilidade?" value={notes} disabled={!editable || saving} onChange={event => { setNotes(event.target.value); setSuccess(false); setSendError(""); }}/></label><small className="char-count">{notes.length}/500</small></section>
      </div><aside className="form-summary"><div className="summary-top"><span className="eyebrow">RESUMO DO ENVIO</span><span className="cycle-pill">{cycle}</span></div><div className="summary-carrier-heading"><CarrierLogo slug={carrier.slug} size="card"/><h2>{carrier.name}</h2></div><p className="summary-date"><CalendarDays size={15}/>{formatDate(date)}</p><div className="summary-total"><strong>{showCounts ? vehicleTotal : "—"}</strong><span>veículos disponíveis</span></div><div className="summary-modals">{MODALS.map(modal => <div key={modal.key}><span>{modal.name}</span><strong>{showCounts ? numeric[modal.key] : "—"}</strong></div>)}</div>
        {(loadError || sendError) && <div role="alert" className="notice error"><p>{loadError || sendError}</p><button type="button" onClick={() => setReload(value => value + 1)}><RefreshCw size={14}/>Recarregar dados</button></div>}
        {success && !closed && ready && <div className="notice success" role="status"><CheckCircle2 size={18}/><span><strong>Disponibilidade confirmada!</strong>A resposta já aparece no painel da operação.</span></div>}
        <button type="submit" className="button primary full" disabled={!editable || saving || (!noVehicles && vehicleTotal === 0)}>{ready && closed ? <><LockKeyhole size={17}/>Prazo encerrado</> : saving ? <><LoaderCircle className="spin" size={17}/>Salvando...</> : success ? <><Check size={18}/>Confirmado</> : <>{saved ? "Atualizar disponibilidade" : "Confirmar disponibilidade"}<ArrowRight size={17}/></>}</button>
        {saved && ready && <p className="last-response">Último envio: {formatTime(saved.updatedAt)}</p>}<p className="summary-help"><Info size={15}/><span>{closed && ready ? "Esta data foi encerrada. Os dados permanecem disponíveis para consulta." : "Você pode atualizar sua resposta até o fim da data da operação, no horário de Brasília, por este mesmo link."}</span></p>
      </aside></form>
      </section>
      <section id="scheduling-panel" className="portal-panel" role="tabpanel" aria-labelledby="scheduling-tab" hidden={tab !== "scheduling"}><SchedulingForm refreshSignal={statusRefresh} historyFocus={historyFocus} carrier={carrier} date={date} cycle={cycle} accessKey={key} onDateChange={nextDate => { setDate(nextDate); setCycle(previous => selectCycleForDate(nextDate, previous)); }} onCycleChange={setCycle}/></section>
    </main>}
    <footer className="public-footer">{BRAND_NAME}<span>{cycle} · Operação conectada</span></footer>
    {key && !invalid && <StelaChat key={carrier.slug} audience={{kind:"carrier",name:carrier.name,carrier:carrier.slug,isMaster:false,permissions:[]}} accessKey={key} date={date} cycle={cycle} view={tab} onNavigate={target=>{if(target==="availability"||target==="scheduling")setTab(target);}}/>}
  </div>;
}
