"use client";
import { useEffect, useRef } from "react";
import { useCarrierCatalog } from "./carrier-catalog";
import CarrierLogo from "./carrier-logo";
import { X } from "lucide-react";
import { type Availability, MODALS, formatDate, formatTime } from "@/lib/model";
export default function ResponseDialog({ response, onClose }: { response: Availability; onClose: () => void }) {
  const { carriers: CARRIERS } = useCarrierCatalog();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="response-title" className="response-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="panel-heading"><div className="dialog-carrier-heading"><CarrierLogo slug={response.carrier} size="card"/><div><span className="eyebrow">RESPOSTA DA TRANSPORTADORA</span><h2 id="response-title">{CARRIERS.find(c => c.slug === response.carrier)?.name}</h2></div></div><button autoFocus className="icon-button" aria-label="Fechar detalhes" onClick={onClose}><X size={19}/></button></div><p>{formatDate(response.date)} · {response.cycle}</p><div className="response-counts">{MODALS.map(modal => <div key={modal.key}><small>{modal.name}</small><strong>{response[modal.key]}</strong></div>)}</div><dl><dt>Responsável</dt><dd>{response.contact}</dd><dt>Observações</dt><dd>{response.notes || "Nenhuma observação informada."}</dd><dt>Último envio</dt><dd>{formatTime(response.updatedAt)} · Versão {response.revision}</dd></dl><button className="button secondary full" onClick={onClose}>Fechar</button></dialog>;
}
