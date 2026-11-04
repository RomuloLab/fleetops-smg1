"use client";
import ManagerSignOut from "./manager-signout";
import { BRAND_NAME } from "@/config/brand";
import Brand from "./brand";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Copy, Building2, LayoutDashboard, Link2, LoaderCircle, LogOut, RefreshCw, Search, ShieldCheck, Truck, Users, UsersRound, Crown } from "lucide-react";
import { type Availability, type Carrier, type Cycle, type OperationWindow, CYCLE, EMPTY_COUNTS, MODALS, availableCycles, formatDate, formatTime, isSunday, makeCsv, selectCycleForDate, total } from "@/lib/model";
import RegistrationPanel from "./registration-panel";
import ThemeToggle from "./theme-toggle";
import CalendarizationWeekTimer from "./calendarization-countdown";
import { useCarrierCatalog } from "./carrier-catalog";
import CarrierLogo from "./carrier-logo";
import ResponseDialog from "./response-dialog";
import { useOperationWindow } from "./use-operation-window";
import SchedulingAdmin from "./scheduling-admin";
import SchedulingAlerts from "./scheduling-alerts";
import type { SchedulingRequest } from "@/lib/scheduling";
import StelaChat from "./stela-chat";
import ManagerUsers from "./manager-users";
import ManagerAccessEmpty from "./manager-access-empty";
import { useManagerAccess } from "./use-manager-access";
import { hasManagerTab, type ManagerAccess } from "@/lib/manager-access-model";
type View = "dashboard" | "scheduling" | "links" | "registration" | "users";
type CarrierLink = Carrier & { path: string };
type Filter = "all" | "received" | "pending";
export default function Dashboard({ manager, initialDate, initialView = "dashboard", registrationEndpoint, modalsEndpoint, usersEndpoint, accessEndpoint }: { manager: ManagerAccess; initialDate: string; initialView?: View; registrationEndpoint?: string; modalsEndpoint?: string; usersEndpoint?: string; accessEndpoint?: string }) {
  const { carriers: CARRIERS, replaceCarriers } = useCarrierCatalog();
  const { access, refreshAccess } = useManagerAccess(manager, accessEndpoint);
  const allowedViews: View[] = access ? [...access.permissions, ...(access.isMaster ? ["users" as const] : [])] : [];
  const [requestedView, setView] = useState<View>(initialView);
  const view = allowedViews.includes(requestedView) ? requestedView : allowedViews[0] ?? "dashboard";
  const permissionKey = allowedViews.join("|");
  const canViewAvailability = hasManagerTab(access, "dashboard");
  const canViewScheduling = hasManagerTab(access, "scheduling");
  const canViewLinks = hasManagerTab(access, "links");
  const showOperation = view === "dashboard" || view === "scheduling" || view === "links";
  useEffect(() => {
    const candidate = ({ cadastro: "registration", usuarios: "users", scheduling: "scheduling", links: "links" } as Record<string, View>)[new URLSearchParams(window.location.search).get("aba") ?? ""];
    if (candidate && permissionKey.split("|").includes(candidate)) setView(candidate);
  }, [permissionKey]);
  const [date, setDate] = useState(initialDate);
  const [cycle, setCycle] = useState<Cycle>(() => selectCycleForDate(initialDate, CYCLE));
  const [responses, setResponses] = useState<Availability[]>([]);
  const [loadedScope, setLoadedScope] = useState("");
  const [operationAccess, setOperationAccess] = useState<OperationWindow | null>(null);
  const closed = useOperationWindow(operationAccess);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(""); const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [links, setLinks] = useState<CarrierLink[]>([]); const [linkError, setLinkError] = useState("");
  const [loadingLinks, setLoadingLinks] = useState(false); const [toast, setToast] = useState("");
  const [detail, setDetail] = useState<Availability | null>(null);
  const [newSchedulingCount, setNewSchedulingCount] = useState(0);
  const [schedulingRefresh, setSchedulingRefresh] = useState(0);
  const [focusedScheduling, setFocusedScheduling] = useState<SchedulingRequest | null>(null);
  function openScheduling(order?: SchedulingRequest) {
    if (!canViewScheduling) return;
    setView("scheduling"); setNewSchedulingCount(0); setFocusedScheduling(order ?? null);
    if (order) { setDate(order.date); setCycle(order.cycle); }
  }
  const scope = `${date}|${cycle}`;
  const requestId = useRef(0); const latestScope = useRef(scope); latestScope.current = scope;
  const refresh = useCallback(async () => {
    if (!canViewAvailability) return;
    const currentId = ++requestId.current; setLoading(true);
    try {
      const response = await fetch(`/api/gestao?data=${encodeURIComponent(date)}&ciclo=${encodeURIComponent(cycle)}`, { cache: "no-store" });
      const body = await response.json() as { error?: string; responses: Availability[]; carriers?: import("@/lib/model").Carrier[]; fetchedAt: string; window: OperationWindow };
      if (!response.ok) throw new Error(body.error || "Não foi possível atualizar.");
      if (currentId !== requestId.current || latestScope.current !== scope) return;
      if (body.carriers) replaceCarriers(body.carriers);
      setResponses(body.responses); setLoadedScope(scope); setOperationAccess(body.window); setUpdatedAt(body.fetchedAt); setError("");
    } catch (cause) { if (currentId === requestId.current && latestScope.current === scope) setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { if (currentId === requestId.current) setLoading(false); }
  }, [date, cycle, scope, replaceCarriers, canViewAvailability]);
  useEffect(() => {
    if (!canViewAvailability) { setResponses([]); setLoadedScope(""); setDetail(null); return; }
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    function onVisible() { if (!document.hidden) void refresh(); }
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); requestId.current++; };
  }, [refresh, canViewAvailability]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);
  const loadLinks = useCallback(async () => {
    if (!canViewLinks) return;
    setLoadingLinks(true); setLinkError("");
    try {
      const response = await fetch("/api/gestao/links", { cache: "no-store" }); const body = await response.json() as { error?: string; links: CarrierLink[] };
      if (!response.ok) throw new Error(body.error); setLinks(body.links); replaceCarriers(body.links.map(({ path: _path, ...carrier }) => carrier));
    } catch (cause) { setLinkError(cause instanceof Error ? cause.message : "Não foi possível carregar os links."); }
    finally { setLoadingLinks(false); }
  }, [canViewLinks, replaceCarriers]);
  useEffect(() => { if (view === "links" && canViewLinks) void loadLinks(); }, [view, canViewLinks, loadLinks]);
  useEffect(() => { if (!canViewLinks) { setLinks([]); setLinkError(""); } if (!canViewScheduling) { setFocusedScheduling(null); setNewSchedulingCount(0); } }, [canViewLinks, canViewScheduling]);
  function linkPath(link: CarrierLink) { const [path, hash] = link.path.split("#"); return path + "?data=" + date + "&ciclo=" + encodeURIComponent(cycle) + "#" + hash; }
  async function copyLink(link: CarrierLink, message = false) {
    const url = window.location.origin + linkPath(link);
    const text = message ? `🚚 *DISPONIBILIDADE — CICLO ${cycle}*\n📅 *Data: ${formatDate(date)}*\n*Transportadora: ${link.name}*\n\n${closed && loadedScope === scope ? "A coleta desta data foi encerrada. Consulte a disponibilidade pelo link abaixo:" : "Pessoal, preencham a disponibilidade de veículos pelo link abaixo:"}\n${url}\n\nConfiram a data da operação antes de enviar.` : url;
    try { await navigator.clipboard.writeText(text); setToast(message ? `Mensagem da ${link.name} copiada.` : `Link da ${link.name} copiado.`); }
    catch { setToast("Não foi possível copiar. Abra o formulário e copie o endereço."); }
  }
  const activeResponses = useMemo(() => loadedScope === scope ? responses : [], [loadedScope, scope, responses]);
  const received = activeResponses.length; const pending = CARRIERS.length - received;
  const totals = useMemo(() => activeResponses.reduce((sum, row) => ({ utilitarios: sum.utilitarios + row.utilitarios, vans: sum.vans + row.vans, vucs: sum.vucs + row.vucs, outros: sum.outros + row.outros }), { ...EMPTY_COUNTS }), [activeResponses]);
  const grandTotal = total(totals); const zeroResponses = activeResponses.filter(row => total(row) === 0).length;
  const visibleCarriers = CARRIERS.filter(carrier => {
    const hasResponse = activeResponses.some(row => row.carrier === carrier.slug);
    return carrier.name.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "received" ? hasResponse : !hasResponse));
  });
  const ready = loadedScope === scope;
  function downloadCsv() {
    if (!ready) return;
    const url = URL.createObjectURL(new Blob([makeCsv(activeResponses, date, cycle, CARRIERS)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `disponibilidade-${cycle.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${date}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!access || !allowedViews.length) return <ManagerAccessEmpty name={manager.name} email={manager.email} blocked={!access} onRefresh={() => void refreshAccess()}/>;
  return <div className="dashboard-shell">
    <aside className="sidebar"><Brand/><div className="sidebar-section">OPERAÇÃO</div><nav aria-label="Navegação principal">
      {canViewAvailability && <button className={view === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setView("dashboard")}><LayoutDashboard size={18}/>Visão geral</button>}
      {canViewScheduling && <button className={view === "scheduling" ? "nav-item active" : "nav-item"} onClick={() => openScheduling()}><CalendarClock size={18}/>Scheduling<span className={newSchedulingCount ? "nav-count unread-count" : "nav-count"}>{newSchedulingCount || "NOVO"}</span></button>}
      {canViewLinks && <button className={view === "links" ? "nav-item active" : "nav-item"} onClick={() => setView("links")}><Link2 size={18}/>Links de coleta<span className="nav-count">{CARRIERS.length}</span></button>}
      {hasManagerTab(access, "registration") && <button className={view === "registration" ? "nav-item active" : "nav-item"} onClick={() => setView("registration")}><Building2 size={18}/>Cadastro</button>}
      {access.isMaster && <button className={view === "users" ? "nav-item active" : "nav-item"} onClick={() => setView("users")}><UsersRound size={18}/>Usuários<span className="nav-master"><Crown size={11}/></span></button>}
    </nav><div className="sidebar-cycle"><span className="small-icon"><Truck size={19}/></span><span><small>CICLO ATUAL</small><strong>{cycle}</strong></span><span className="green-dot"/></div><div className="sidebar-bottom"><span className="admin-avatar">{access.isMaster ? <Crown size={17}/> : access.name.slice(0,2).toUpperCase()}</span><div><strong title={access.name}>{access.name}</strong><small>{access.isMaster ? "Gestor master" : "Gestor da operação"}</small></div><ManagerSignOut/></div></aside>
    <div className="dashboard-body"><header className="dashboard-header"><span className="header-breadcrumb">Operações<ChevronRight size={13}/><strong>{view === "scheduling" ? "Scheduling" : view === "registration" ? "Cadastro" : view === "users" ? "Usuários" : view === "links" ? "Links de coleta" : "Disponibilidade"}</strong></span><div className="header-actions">{canViewScheduling && <SchedulingAlerts onIncoming={orders => { setSchedulingRefresh(value => value + 1); if (view !== "scheduling") setNewSchedulingCount(value => value + orders.length); }} onOpen={openScheduling}/>}{canViewAvailability && <span className="live-label"><span className={closed && ready ? "closed-dot" : "green-dot"}/>{!ready ? "Carregando coleta..." : closed ? "Coleta encerrada" : "Coleta aberta"}</span>}<CalendarizationWeekTimer/><ThemeToggle/></div></header>
    <main className="dashboard-main"><div className="page-heading"><div><span className="eyebrow">GESTÃO DE TRANSPORTADORAS</span><h1>{view === "dashboard" ? "Disponibilidade de veículos" : view === "scheduling" ? "Scheduling" : view === "registration" ? "Cadastro e modais" : view === "users" ? "Usuários e permissões" : "Cada transportadora, seu link"}</h1><p>{view === "dashboard" ? "Visibilidade para planejar a próxima expedição." : view === "scheduling" ? "Pedidos das transportadoras, com os modais de cada operação." : view === "registration" ? "Cadastre transportadoras e gerencie os modais disponíveis no Scheduling." : view === "users" ? "Defina quem entra no FleetOps e quais abas cada gestor pode acessar." : "Copie e envie o link no grupo de cada transportadora."}</p></div>{showOperation && <span className="cycle-pill"><span className="yellow-dot"/>Ciclo {cycle}</span>}</div>
      {showOperation && <div className="toolbar"><div className="date-controls"><label className="date-picker"><CalendarDays size={17}/><span>Data da operação</span><input aria-label="Data da operação" type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setCycle(previous => selectCycleForDate(event.target.value, previous)); setDetail(null); setFocusedScheduling(null); } }}/></label><label className="cycle-picker"><span>Ciclo</span><select aria-label="Ciclo da operação" value={cycle} onChange={event => { setCycle(event.target.value as Cycle); setDetail(null); setFocusedScheduling(null); }}>{availableCycles(date).map(option => <option key={option} value={option}>{option}</option>)}</select></label><span className="toolbar-note">Horário de Brasília</span></div><div className="toolbar-actions">{view === "dashboard" ? <><button className="icon-button" aria-label="Atualizar respostas" title="Atualizar respostas" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/></button><button className="button secondary small" disabled={!ready} onClick={downloadCsv}><ArrowDownToLine size={16}/>Exportar CSV</button></> : canViewAvailability ? <button className="button secondary small" onClick={() => setView("dashboard")}><LayoutDashboard size={16}/>Ver painel</button> : null}</div></div>}
      {showOperation && ready && closed && <p className="calendar-note dashboard-calendar-note closed-calendar-note" role="status">Coleta encerrada para esta data. Disponível somente para consulta, no horário de Brasília.</p>}
      {showOperation && isSunday(date) && <p className="calendar-note dashboard-calendar-note" role="status">Domingo: disponíveis AM, SD e SDE.</p>}
      {showOperation && error && <div className="dashboard-alert" role="alert">{error}<button onClick={() => void refresh()}>Tentar novamente</button></div>}
      {view === "dashboard" ? <>
        <section className="metrics-grid" aria-label="Resumo da disponibilidade"><article className="metric featured"><span className="metric-label">Veículos disponíveis<Truck size={19}/></span><div className="metric-value">{ready ? grandTotal : "—"}<span>veículos</span></div><p>Todos os modais confirmados<ArrowUpRight size={16}/></p></article><article className="metric"><span className="metric-label">Respostas recebidas<ClipboardCheck size={18}/></span><div className="metric-value">{ready ? received : "—"}<span>/ {CARRIERS.length}</span></div><p><span className="tiny-dot green"/>{ready ? Math.round(received / CARRIERS.length * 100) : 0}% das transportadoras</p></article><article className="metric"><span className="metric-label">Aguardando retorno<Clock3 size={18}/></span><div className="metric-value">{ready ? pending : "—"}<span>transportadoras</span></div><p><span className="tiny-dot amber"/>Ainda não enviaram a disponibilidade</p></article><article className="metric"><span className="metric-label">Sem disponibilidade<Truck size={18}/></span><div className="metric-value">{ready ? zeroResponses : "—"}<span>transportadoras</span></div><p>Confirmaram que não têm veículos</p></article></section>
        <div className="dashboard-grid"><section className="table-panel"><div className="panel-heading"><div><h2>Transportadoras<span className="count-badge">{CARRIERS.length}</span></h2><p>Disponibilidade para {formatDate(date)} · {cycle}.</p></div>{canViewLinks && <button className="text-button" onClick={() => setView("links")}>Links de coleta<ArrowUpRight size={15}/></button>}</div><div className="table-controls"><div className="filter-tabs" aria-label="Filtrar transportadoras">{([{ key: "all", label: "Todas", count: CARRIERS.length }, { key: "received", label: "Recebidas", count: received }, { key: "pending", label: "Pendentes", count: pending }] as const).map(tab => <button key={tab.key} aria-pressed={filter === tab.key} className={filter === tab.key ? "selected" : ""} onClick={() => setFilter(tab.key)}>{tab.label}<span>{ready ? tab.count : "—"}</span></button>)}</div><label className="search-input"><Search size={15}/><input aria-label="Buscar transportadora" placeholder="Buscar transportadora" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
        <div className="table-scroll"><table><thead><tr><th>TRANSPORTADORA</th><th>STATUS</th>{MODALS.map(m => <th key={m.key} className="number-cell">{m.name.toUpperCase()}</th>)}<th className="number-cell">TOTAL</th><th aria-label="Detalhes"/></tr></thead><tbody>{visibleCarriers.map(carrier => { const row = activeResponses.find(item => item.carrier === carrier.slug); return <tr key={carrier.slug}><td><div className="carrier-cell"><CarrierLogo slug={carrier.slug}/><span><strong>{carrier.name}</strong><small>{row ? formatTime(row.updatedAt) : "Aguardando preenchimento"}</small></span></div></td><td>{ready ? <span className={"status-badge " + (row ? total(row) ? "received" : "zero" : "pending")}><span/>{row ? total(row) ? "Confirmada" : "Sem veículos" : "Pendente"}</span> : <span className="skeleton-cell"/>}</td>{MODALS.map(modal => <td key={modal.key} className="number-cell">{row ? row[modal.key] : "—"}</td>)}<td className="number-cell"><strong className={row ? "total-cell" : "empty-cell"}>{row ? total(row) : "—"}</strong></td><td>{row && <button className="row-details" aria-label={`Ver resposta de ${carrier.name}`} onClick={() => setDetail(row)}><ChevronRight size={17}/></button>}</td></tr>; })}</tbody>{ready && visibleCarriers.length > 0 && <tfoot><tr><td colSpan={2}>Total da operação</td>{MODALS.map(m => <td key={m.key} className="number-cell">{totals[m.key]}</td>)}<td className="number-cell">{grandTotal}</td><td/></tr></tfoot>}</table>{!visibleCarriers.length && <div className="table-empty"><Search size={25}/><strong>Nenhuma transportadora encontrada</strong><p>Tente outro nome ou altere o filtro.</p></div>}</div><div className="table-footer"><span>{visibleCarriers.length} de {CARRIERS.length} transportadoras</span><span><span className="tiny-dot green"/>Atualização automática a cada 30s</span></div></section>
        <aside className="insights-column"><section className="insight-card"><div className="panel-heading compact"><h2>Coleta do ciclo</h2><span className="small-icon"><Users size={17}/></span></div><div className="collection-progress"><svg viewBox="0 0 140 140" role="img" aria-label={`${received} de ${CARRIERS.length} respostas`}><circle cx="70" cy="70" r="57" fill="none" stroke="#eef0f3" strokeWidth="9"/><circle cx="70" cy="70" r="57" fill="none" stroke="#ffe600" strokeWidth="9" strokeDasharray={`${received / CARRIERS.length * 358.14} 358.14`} strokeLinecap="round" transform="rotate(-90 70 70)"/><text x="70" y="69" textAnchor="middle" className="progress-number">{ready ? received : "—"}<tspan className="progress-denominator">/{CARRIERS.length}</tspan></text><text x="70" y="89" textAnchor="middle" className="progress-label">respostas</text></svg></div><p className="progress-caption">{!ready ? "Carregando respostas..." : pending === 0 ? "Todas as transportadoras responderam!" : `Faltam ${pending} transportadoras para concluir a coleta.`}</p><button className="button secondary full small" onClick={() => { setFilter("pending"); setSearch(""); }}>Ver pendentes<ArrowRight size={15}/></button></section>
        <section className="insight-card"><div className="panel-heading compact"><h2>Veículos por modal</h2><Truck size={17}/></div><div className="modal-bars">{MODALS.map((modal, index) => <div key={modal.key}><div><span>{modal.name}</span><strong>{ready ? totals[modal.key] : "—"}</strong></div><div className="bar-track"><span className={"bar-fill bar-" + index} style={{ width: `${grandTotal ? totals[modal.key] / grandTotal * 100 : 0}%` }}/></div></div>)}</div><div className="modal-total"><span>Total disponível</span><strong>{ready ? grandTotal : "—"}</strong></div></section>
        {canViewLinks && <section className="share-card"><span className="share-icon"><Link2 size={21}/></span><h3>Facilite a coleta.</h3><p>Envie um link exclusivo no grupo de cada transportadora.</p><button className="text-button" onClick={() => setView("links")}>Acessar links<ArrowUpRight size={16}/></button></section>}</aside></div>
      </> : view === "scheduling" ? <SchedulingAdmin date={date} cycle={cycle} refreshSignal={schedulingRefresh} focusedRequest={focusedScheduling} onDismissRequest={() => setFocusedScheduling(null)}/> : view === "registration" ? <RegistrationPanel registrationEndpoint={registrationEndpoint} modalsEndpoint={modalsEndpoint} onRegistered={carrier => { setLinks([]); setToast(`${carrier.name} cadastrada. O link já está disponível.`); }}/> : view === "users" && access.isMaster ? <ManagerUsers endpoint={usersEndpoint}/> : <><div className="links-intro"><span className="small-icon"><ShieldCheck size={22}/></span><div><strong>Um link exclusivo para cada transportadora.</strong><p>Quem tiver o link poderá enviar e atualizar a resposta dessa transportadora. Compartilhe apenas no respectivo grupo. A data e o ciclo já vão selecionados no formulário.</p></div></div>{linkError && <div className="dashboard-alert" role="alert">{linkError}<button onClick={() => void loadLinks()}>Tentar novamente</button></div>}{loadingLinks ? <div className="loading-links"><LoaderCircle className="spin"/>Carregando links de coleta...</div> : <div className="links-grid">{links.map(link => <article className="link-card" key={link.slug}><div className="link-card-title"><CarrierLogo slug={link.slug} size="card"/><div><h2>{link.name}</h2><small>Ciclo {cycle}</small></div><Link2 size={17}/></div><div className="link-address">{BRAND_NAME} / {link.slug}<span>link exclusivo</span></div><div className="link-card-actions"><button className="button primary small" onClick={() => void copyLink(link)}><Copy size={15}/>Copiar link</button><a className="icon-button" title="Abrir formulário" aria-label={`Abrir formulário ${link.name}`} href={linkPath(link)} target="_blank" rel="noreferrer"><ArrowUpRight size={17}/></a></div><a className="open-scheduling-link" href={linkPath(link).replace("#", "&aba=scheduling#")} target="_blank" rel="noreferrer"><CalendarClock size={13}/>Abrir Scheduling</a><button className="copy-message" onClick={() => void copyLink(link, true)}><Copy size={13}/>Copiar mensagem para o grupo</button></article>)}</div>}</>}
      <footer className="dashboard-footer"><span>{BRAND_NAME} · {view === "scheduling" ? "Scheduling" : view === "registration" ? "Cadastro" : view === "users" ? "Usuários" : view === "links" ? "Links de coleta" : "Disponibilidade"} · Ciclo {cycle}</span><span>{showOperation && updatedAt && ready ? `Última atualização: ${formatTime(updatedAt)}` : access.isMaster ? "Acesso master" : "Acesso definido pelo master"}</span></footer>
    </main></div>{toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}{canViewAvailability && detail && <ResponseDialog response={detail} onClose={() => setDetail(null)}/>}
    <StelaChat key={access.id+"|"+permissionKey} audience={{kind:"manager",name:access.name,isMaster:access.isMaster,permissions:access.permissions}} date={date} cycle={cycle} view={view} onNavigate={target=>{if(allowedViews.includes(target as View))setView(target as View);}}/>
  </div>;
}
