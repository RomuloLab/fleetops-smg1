"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck2, Info, LoaderCircle, RefreshCw } from "lucide-react";
import { isoWeek, type CalendarSourceInfo } from "@/lib/calendarization-model";
import { formatDate, formatTime, operationDate } from "@/lib/model";
export default function CalendarizationSourcePanel({ endpoint = "/api/gestao/calendarizacao", onLoaded }: { endpoint?: string; onLoaded?: (source: CalendarSourceInfo) => void }) {
  const [source, setSource] = useState<CalendarSourceInfo | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(endpoint, { ...(reload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh_source" }) } : { cache: "no-store" as const }), signal: controller.signal }).then(async response => {
      const body = await response.json() as { source: CalendarSourceInfo; error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar a calendarização.");
      if (!controller.signal.aborted) { setSource(body.source); onLoaded?.(body.source); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão com a planilha."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, reload, onLoaded]);
  const sddWeeks = source ? [...new Set(source.dates.map(date => { const { week, year } = isoWeek(date); return `W${week}/${year}`; }))].join(", ") : "";
  return <section className="form-card calendar-source-panel"><div className="section-title"><span className="step-number"><CalendarCheck2 size={18}/></span><div><h2>Calendarização SMG1</h2><p>A consulta usa somente SMG1, na semana da data de cada pedido.</p></div><button className="button secondary small" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>}Atualizar consulta</button></div>
    {loading && !source ? <p className="calendar-source-loading"><LoaderCircle className="spin" size={17}/>Consultando as abas FF e SDD...</p> : null}
    {error && <div className="dashboard-alert" role="alert">{error}{source && " Os dados exibidos abaixo são da última leitura e não confirmam uma nova consulta."}</div>}
    {source && <><div className="calendar-source-grid"><div><strong>FF · Frota fixa</strong><p>Placa, transportadora, modal, semana e escala do dia.</p><small>Semanas disponíveis: {source.weeks.map(week => `W${week}`).join(", ") || "nenhuma"}</small></div><div><strong>SDD · Quantidades</strong><p>Transportadora, modal, ciclo e quantidade por data.</p><small>{source.dates.length ? `${sddWeeks} · ${formatDate(source.dates[0])} a ${formatDate(source.dates[source.dates.length - 1])}` : "Datas não publicadas"}</small></div></div><div className="calendar-source-footer"><span>Leitura: {formatDate(operationDate(new Date(source.fetchedAt)))} · {formatTime(source.fetchedAt)}</span><a href={source.url} target="_blank" rel="noreferrer">Abrir planilha<ArrowUpRight size={14}/></a></div></>}
    <p className="calendar-config-help"><Info size={14}/>Datas ou semanas ausentes ficam sinalizadas para conferência. A consulta não altera o status Pendente, Feito ou Não feito dos pedidos.</p>
  </section>;
}
