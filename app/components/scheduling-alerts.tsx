"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, BellOff, BellRing, Check, LoaderCircle, Volume2, X } from "lucide-react";
import { BrowserAlerts, browserAlertPlatform, readAlertCursor, saveAlertCursor, type AlertSettings } from "@/lib/browser-alerts";
import { BRAND_NAME } from "@/config/brand";
import CarrierLogo from "./carrier-logo";
import { useCarrierCatalog } from "./carrier-catalog";
import { formatDate, type Carrier } from "@/lib/model";
import { requestProtocol, type SchedulingRequest, type SchedulingStatusEvent } from "@/lib/scheduling";
import { carrierNoticeContent, schedulingNotice, type SchedulingAlertEvent as AlertEvent, type SchedulingNotice as Notice } from "@/lib/scheduling-alert-content";
type Feed<T> = { events: T[]; cursor: number; hasMore: boolean; carriers?: Carrier[]; error?: string };
type ChannelProps<T extends AlertEvent> = { carrier?: string; accessKey?: string; onIncoming: (events: T[]) => void; onOpen: (event: T) => void };
function SchedulingAlertChannel<T extends AlertEvent>({ carrier, accessKey, onIncoming, onOpen }: ChannelProps<T>) {
  const { findCarrier: getCarrier, replaceCarriers } = useCarrierCatalog();
  const [settings, setSettings] = useState<AlertSettings>({ enabled: false, sound: "off", notification: "unavailable" });
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState(""); const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState<Notice<T> | null>(null);
  const alerts = useRef<BrowserAlerts | null>(null);
  const incoming = useRef(onIncoming); const open = useRef(onOpen); incoming.current = onIncoming; open.current = onOpen;
  const scope = carrier ? `carrier:${carrier}` : "manager";
  const enabled = settings.enabled;
  useEffect(() => {
    const controller = new BrowserAlerts(browserAlertPlatform(scope), setSettings);
    alerts.current = controller; controller.start();
    function recover() { void controller.recover(); }
    function visible() { if (!document.hidden) recover(); }
    // Reacquire audio in a trusted gesture after refresh or OS suspension.
    document.addEventListener("pointerdown", recover, { passive: true });
    document.addEventListener("keydown", recover);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", recover);
    return () => {
      document.removeEventListener("pointerdown", recover); document.removeEventListener("keydown", recover);
      document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", recover);
      controller.dispose(); if (alerts.current === controller) alerts.current = null;
    };
  }, [scope]);
  function systemNotice(value: Notice<T>, eventCarriers?: Carrier[]) {
    const controller = alerts.current; if (!controller) return;
    const request = value.request;
    const statusContent = carrier && request ? carrierNoticeContent(value) : null;
    const title = value.test ? "Teste de notificação" : carrier
      ? statusContent!.systemTitle
      : value.count > 1 ? `${value.count} novos pedidos de Scheduling` : "Novo pedido de Scheduling";
    const eventCarrierName = request ? eventCarriers?.find(item => item.slug === request.carrier)?.name ?? getCarrier(request.carrier)?.name ?? request.carrier : "";
    const body = request ? [statusContent?.outcome, statusContent?.reason ? `Motivo: ${statusContent.reason}` : "", `${carrier ? requestProtocol(request.id) : eventCarrierName} · ${request.quantity} veículo${request.quantity === 1 ? "" : "s"} · ${request.modalName}`, `${formatDate(request.date)} · ${request.cycle}`, statusContent?.summary].filter(Boolean).join("\n") : "Som e avisos preparados para os próximos pedidos. Este teste não registra um pedido.";
    const shown = controller.show(`${BRAND_NAME} · ${title}`, { body, icon: "/favicon.svg", tag: request ? `scheduling-${carrier ? "status-" : ""}${request.seq}` : "dispo-alert-test" }, () => { window.focus(); if (request) open.current(request); });
    if (!shown && controller.settings.enabled && controller.settings.notification === "granted") setMessage("O navegador não exibiu o aviso externo. Confira as notificações do site e do sistema. Os avisos na tela continuam ativos.");
  }
  function settingsMessage(value: AlertSettings) {
    if (!value.enabled) return "Ativar som e notificações de Scheduling.";
    const sound = value.sound === "ready" ? "Som ativado." : value.sound === "unavailable" ? "O navegador não liberou o áudio." : "Clique em Reativar som para liberar o áudio nesta guia.";
    const external = value.notification === "granted" ? "Notificações do navegador permitidas." : value.notification === "denied" ? "As notificações estão bloqueadas nas permissões do site; permita-as para receber o aviso externo." : value.notification === "default" ? "Permita as notificações na solicitação do navegador." : "Para receber notificações externas, abra o site em uma guia do navegador.";
    return `${sound} ${external} Mantenha o site aberto.`;
  }
  async function activate(test = false) {
    const controller = alerts.current; if (!controller || activating) return;
    setActivating(true); setMessage("");
    if (test) setNotice({ request: null, count: 0, notDoneCount: 0, test: true });
    try {
      const value = await controller.enable(); controller.play(); setMessage(settingsMessage(value));
      if (test) systemNotice({ request: null, count: 0, notDoneCount: 0, test: true });
    } catch { setMessage("Não foi possível concluir a ativação. Clique em Testar som e notificação para tentar novamente."); }
    finally { setActivating(false); }
  }
  function pause() { alerts.current?.pause(); setMessage("Som e notificações pausados. Os avisos na tela continuam ativos."); }
  useEffect(() => {
    let alive = true; let cursor: number | null = null; let timer: ReturnType<typeof setTimeout>; let busy = false;
    let pending: AbortController | null = null;
    try { cursor = readAlertCursor(sessionStorage, scope); } catch { /* Storage may be disabled. */ }
    setNotice(null); setConnected(false);
    async function poll() {
      if (!alive || busy) return; busy = true; clearTimeout(timer);
      let delay = 5000; const controller = new AbortController(); pending = controller;
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const path = carrier ? `/api/scheduling/events?transportadora=${encodeURIComponent(carrier)}` : "/api/gestao/scheduling/events";
        const suffix = cursor === null ? "" : `${carrier ? "&" : "?"}after=${cursor}`;
        const response = await fetch(path + suffix, { headers: accessKey ? { Authorization: `Bearer ${accessKey}` } : undefined, cache: "no-store", signal: controller.signal });
        const body = await response.json() as Feed<T>;
        if (!response.ok) throw new Error(body.error);
        if (!Number.isSafeInteger(body.cursor) || body.cursor < 0 || !Array.isArray(body.events)) throw new Error("Resposta de alertas inválida.");
        if (!alive) return;
        setConnected(true);
        if (body.carriers) replaceCarriers(body.carriers);
        if (body.events.length) {
          incoming.current(body.events);
          const value = schedulingNotice(body.events, !!carrier);
          if (value) {
            setNotice(value); alerts.current?.play(); systemNotice(value, body.carriers);
          }
        }
        cursor = body.cursor;
        try { saveAlertCursor(sessionStorage, scope, cursor); } catch { /* Storage may be disabled. */ }
        if (body.hasMore) delay = 0;
      } catch { if (alive) setConnected(false); }
      finally { clearTimeout(timeout); pending = null; busy = false; if (alive) timer = setTimeout(poll, delay); }
    }
    void poll();
    function wake() { if (!document.hidden) void poll(); }
    window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
    return () => { alive = false; pending?.abort(); clearTimeout(timer); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); };
  }, [carrier, accessKey, scope]);
  const blockedSound = enabled && (settings.sound === "blocked" || settings.sound === "unavailable");
  const label = activating ? "Ativando..." : blockedSound ? "Reativar som" : enabled ? "Alertas ativos" : "Ativar alertas";
  const health = !enabled ? "Som e aviso do navegador" : settings.sound !== "ready" ? "Som precisa de ativação" : settings.notification === "granted" ? "Som e navegador liberados" : settings.notification === "denied" ? "Som ativo · avisos bloqueados" : settings.notification === "default" ? "Som ativo · permita os avisos" : "Som ativo · aviso nesta tela";
  const statusContent = carrier && notice?.request ? carrierNoticeContent(notice) : null;
  return <div className="scheduling-alerts"><span className={"alert-connection " + (connected ? "connected" : "")} title={connected ? carrier ? "Acompanhando o status dos seus pedidos" : "Acompanhando novos pedidos" : "Reconectando aos pedidos"}/><button className={"alert-toggle " + (enabled ? "enabled" : "") + (blockedSound ? " needs-gesture" : "")} onClick={() => void activate()} disabled={activating} title={message || settingsMessage(settings)}>{activating ? <LoaderCircle size={15} className="spin"/> : enabled ? <BellRing size={15}/> : <Bell size={15}/>}<span className="alert-toggle-copy"><span>{label}</span><small>{health}</small></span>{enabled && !blockedSound && <Check size={12}/>}</button><button className="icon-button test-alert-button" title="Testar som e notificação" aria-label="Testar alerta de pedido" disabled={activating} onClick={() => void activate(true)}><Volume2 size={16}/></button>{enabled && <button className="icon-button pause-alert-button" title="Pausar som e notificações" aria-label="Pausar alertas" disabled={activating} onClick={pause}><BellOff size={15}/></button>}
    {message && <div className="alert-settings-message" role="status"><span>{message}</span><button aria-label="Fechar informação de alertas" onClick={() => setMessage("")}><X size={13}/></button></div>}
    {notice && <aside className={"scheduling-notification" + (statusContent?.notDone ? " not-done" : "")} role="status" aria-live="polite"><div className="notification-heading">{notice.request ? <CarrierLogo slug={notice.request.carrier} size="notice"/> : <span className="notification-icon"><BellRing size={20}/></span>}<div><small>{notice.test ? "TESTE DE ALERTA" : carrier ? statusContent!.label : "NOVO PEDIDO"}</small><strong>{notice.test ? `${BRAND_NAME} · Teste de alerta` : carrier ? statusContent!.title : getCarrier(notice.request!.carrier)?.name}</strong></div><button aria-label="Fechar notificação de pedido" onClick={() => setNotice(null)}><X size={16}/></button></div>{statusContent?.notDone && <p className="notification-outcome"><strong>{statusContent.outcome}</strong></p>}{statusContent?.reason && <p className="notification-resolution-note"><strong>Motivo: </strong>{statusContent.reason}</p>}<p>{notice.test ? "Este é um teste de som e aviso. Nenhum pedido foi criado." : `${notice.request!.quantity} veículo${notice.request!.quantity === 1 ? "" : "s"} · ${notice.request!.modalName}`}</p>{notice.request && <small>{carrier && <>{requestProtocol(notice.request.id)} · </>}{formatDate(notice.request.date)} · {notice.request.cycle}</small>}{notice.count > 1 && <small>{carrier ? statusContent!.summary : `Mais ${notice.count - 1} pedido${notice.count > 2 ? "s" : ""} recebido${notice.count > 2 ? "s" : ""} neste intervalo.`}</small>}{notice.request && <button className="button primary full small" onClick={() => { open.current(notice.request!); setNotice(null); }}>Ver pedido<ArrowUpRight size={15}/></button>}</aside>}
  </div>;
}
export default function SchedulingAlerts(props: { onIncoming: (requests: SchedulingRequest[]) => void; onOpen: (request: SchedulingRequest) => void }) {
  return <SchedulingAlertChannel<SchedulingRequest> {...props}/>;
}
export function CarrierSchedulingAlerts(props: { carrier: string; accessKey: string; onIncoming: (events: SchedulingStatusEvent[]) => void; onOpen: (event: SchedulingStatusEvent) => void }) {
  return <SchedulingAlertChannel<SchedulingStatusEvent> {...props}/>;
}
