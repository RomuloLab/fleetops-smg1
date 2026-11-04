"use client";
import { useEffect, useState } from "react";
import { BellRing, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, LoaderCircle, RefreshCw, Settings2, Truck, Users } from "lucide-react";
import { formatDate, formatTime, type Cycle, type OperationWindow } from "@/lib/model";
import { requestProtocol, type SchedulingRequest } from "@/lib/scheduling";
import { useCarrierCatalog } from "./carrier-catalog";
import CarrierLogo from "./carrier-logo";
import SchedulingOrderDialog from "./scheduling-order-dialog";
import SchedulingStatusBadge from "./scheduling-status";
import CalendarizationResult from "./calendarization-result";
type ResponseData = { requests: SchedulingRequest[]; summary: { total: number; quantity: number; carriers: number }; configuredCarriers: number; page: number; pageSize: number; window: OperationWindow; error?: string };
type Props = { date: string; cycle: Cycle; refreshSignal: number; focusedRequest: SchedulingRequest | null; onDismissRequest: () => void };
export default function SchedulingAdmin({ date, cycle, refreshSignal, focusedRequest, onDismissRequest }: Props) {
  const { carriers: CARRIERS } = useCarrierCatalog();
  const [data, setData] = useState<ResponseData | null>(null); const [loadedScope, setLoadedScope] = useState("");
  const [page, setPage] = useState(1); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [reload, setReload] = useState(0); const [detail, setDetail] = useState<SchedulingRequest | null>(null);
  const scope = `${date}|${cycle}|${page}`;
  useEffect(() => { setPage(1); setDetail(null); }, [date, cycle]);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    async function refresh() {
      if (busy) return; busy = true; setLoading(true);
      try {
        const response = await fetch(`/api/gestao/scheduling?data=${date}&ciclo=${encodeURIComponent(cycle)}&pagina=${page}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as ResponseData;
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os pedidos.");
        if (!controller.signal.aborted) { setData(body); setLoadedScope(scope); setError(""); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); }
      finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    function visible() { if (!document.hidden) void refresh(); }
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [date, cycle, page, scope, refreshSignal, reload]);
  const ready = loadedScope === scope && !!data; const summary = ready ? data.summary : null;
  const selectedDetail = focusedRequest ?? detail;
  const activeDetail = selectedDetail ? data?.requests.find(order => order.id === selectedDetail.id) ?? selectedDetail : null;
  function savedOrder(order: SchedulingRequest) {
    setData(previous => previous ? { ...previous, requests: previous.requests.map(row => row.id === order.id ? order : row) } : previous);
    setDetail(order); onDismissRequest(); setReload(value => value + 1);
  }
  return <div className="scheduling-admin">
    <div className="scheduling-alert-guide"><span className="small-icon"><BellRing size={21}/></span><div><strong>Saiba quando um pedido chegar.</strong><p>Ative os alertas no topo do painel para ouvir o som e permitir as notificações do navegador. Mantenha o site aberto para receber os avisos.</p></div><span className="setup-badge">Atualiza a cada 5s</span></div>
    <section className="metrics-grid scheduling-metrics"><article className="metric featured"><span className="metric-label">Pedidos recebidos<ClipboardList size={19}/></span><div className="metric-value">{summary?.total ?? "—"}<span>pedidos</span></div><p>Nesta data e ciclo</p></article><article className="metric"><span className="metric-label">Veículos solicitados<Truck size={19}/></span><div className="metric-value">{summary?.quantity ?? "—"}<span>veículos</span></div><p>Quantidade informada nos pedidos</p></article><article className="metric"><span className="metric-label">Transportadoras<Users size={19}/></span><div className="metric-value">{summary?.carriers ?? "—"}<span>/ {CARRIERS.length}</span></div><p>Com pedidos nesta operação</p></article><article className="metric"><span className="metric-label">Modais configurados<Settings2 size={19}/></span><div className="metric-value">{ready ? data.configuredCarriers : "—"}<span>/ {CARRIERS.length}</span></div><p>Transportadoras com modais liberados</p></article></section>
    {ready && data.configuredCarriers === 0 && <section className="scheduling-setup"><span className="setup-icon"><Settings2 size={23}/></span><div><strong>Painel pronto para receber os primeiros pedidos</strong><p>Os modais de cada transportadora serão cadastrados na próxima etapa. Os formulários já estão preparados para essa configuração.</p></div><span className="setup-badge">Aguardando modais</span></section>}
    {error && <div className="dashboard-alert" role="alert">{error}<button onClick={() => setReload(value => value + 1)}>Tentar novamente</button></div>}
    <section className="table-panel scheduling-orders-panel"><div className="panel-heading"><div><h2>Pedidos de Scheduling<span className="count-badge">{summary?.total ?? "—"}</span></h2><p>{formatDate(date)} · {cycle} · Horário de Brasília</p></div><button className="icon-button" title="Atualizar pedidos" aria-label="Atualizar pedidos" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw className={loading ? "spin" : ""} size={16}/></button></div>
      {!ready ? <div className="scheduling-empty"><LoaderCircle className="spin" size={27}/><p>{error || "Carregando pedidos..."}</p></div> : data.requests.length === 0 ? <div className="scheduling-empty admin-empty"><span className="empty-order-icon"><CalendarClock size={32}/></span><h3>Acompanhe os pedidos por aqui</h3><p>Quando uma transportadora enviar um pedido, ele aparecerá neste painel com modal, quantidade e responsável.</p><span className="empty-tag">Nenhum pedido nesta data e ciclo</span></div> : <div className="table-scroll"><table><thead><tr><th>PEDIDO / TRANSPORTADORA</th><th>MODAL</th><th>PLACA / CALENDARIZAÇÃO</th><th className="number-cell">VEÍCULOS</th><th>RESPONSÁVEL</th><th>STATUS</th><th>OBSERVAÇÃO DA OPERAÇÃO</th><th aria-label="Gerenciar pedido"/></tr></thead><tbody>{data.requests.map(order => <tr key={order.id}><td><div className="carrier-cell"><CarrierLogo slug={order.carrier}/><span><strong>{CARRIERS.find(carrier => carrier.slug === order.carrier)?.name}</strong><small>{requestProtocol(order.id)} · {formatTime(order.createdAt)}</small></span></div></td><td><span>{order.modalName}</span>{order.ambulance && <div className="admin-ambulance-info"><span className="ambulance-badge">Ambulância</span><small>Liberado por: {order.ambulanceReleasedBy}</small></div>}</td><td className="calendar-result-cell"><CalendarizationResult order={order} compact/></td><td className="number-cell"><strong>{order.quantity}</strong></td><td>{order.contact}</td><td><SchedulingStatusBadge status={order.status}/></td><td className="resolution-note-cell">{order.resolutionNotes || (order.status === "done" ? "Pedido realizado." : "—")}</td><td><button className="row-details manage-order" aria-label={`Gerenciar pedido ${requestProtocol(order.id)}`} onClick={() => setDetail(order)}>Gerenciar<ChevronRight size={17}/></button></td></tr>)}</tbody></table></div>}
      {ready && <div className="table-footer scheduling-pagination"><span>{data.summary.total} pedido{data.summary.total === 1 ? "" : "s"} · Página {page} de {Math.max(1, Math.ceil(data.summary.total / data.pageSize))}</span><div><button className="icon-button" aria-label="Página anterior de pedidos" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15}/></button><button className="icon-button" aria-label="Próxima página de pedidos" disabled={page * data.pageSize >= data.summary.total || loading} onClick={() => setPage(value => value + 1)}><ChevronRight size={15}/></button></div></div>}
    </section>{activeDetail && <SchedulingOrderDialog key={activeDetail.id} order={activeDetail} onSaved={savedOrder} onClose={() => { setDetail(null); onDismissRequest(); }}/>}</div>;
}
