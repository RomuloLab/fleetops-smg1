import type { SchedulingRequest } from "./scheduling";

export type SchedulingAlertEvent = Pick<SchedulingRequest, "seq" | "id" | "carrier" | "date" | "cycle" | "quantity" | "modalName" | "status" | "resolutionNotes">;
export type SchedulingNotice<T> = { request: T | null; count: number; notDoneCount: number; test: boolean };

export function schedulingNotice<T extends SchedulingAlertEvent>(events: T[], carrier: boolean): SchedulingNotice<T> | null {
  // Keep the latest decision per order, in event order, including corrections.
  const latest = carrier ? [...new Map(events.map(event => [event.id, event])).values()]
    .filter(event => event.status === "done" || event.status === "not_done").sort((a, b) => a.seq - b.seq) : events;
  if (!latest.length) return null;
  return { request: latest[latest.length - 1], count: latest.length, notDoneCount: latest.filter(event => event.status === "not_done").length, test: false };
}

export function carrierNoticeContent<T extends SchedulingAlertEvent>(notice: SchedulingNotice<T>) {
  const notDone = notice.request?.status === "not_done";
  const doneCount = notice.count - notice.notDoneCount;
  const title = notDone ? "Pedido não foi feito" : "Pedido marcado como feito";
  const summary = notice.count > 1 ? [
    notice.notDoneCount ? `${notice.notDoneCount} pedido${notice.notDoneCount === 1 ? " não foi feito" : "s não foram feitos"}` : "",
    doneCount ? `${doneCount} pedido${doneCount === 1 ? " realizado" : "s realizados"}` : "",
  ].filter(Boolean).join(" · ") + " neste intervalo." : "";
  return {
    notDone,
    label: notDone ? "PEDIDO NÃO REALIZADO" : "PEDIDO REALIZADO",
    title,
    systemTitle: notice.count < 2 ? title : notice.notDoneCount === notice.count ? `${notice.count} pedidos não foram feitos` : doneCount === notice.count ? `${notice.count} pedidos realizados` : `${notice.count} pedidos atualizados`,
    outcome: notDone ? "PEDIDO NÃO FOI FEITO." : "Pedido realizado pela operação.",
    reason: notDone ? notice.request?.resolutionNotes.trim() ?? "" : "",
    summary,
  };
}
