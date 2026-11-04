"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Save, X } from "lucide-react";
import type { CatalogModal } from "@/lib/modal-catalog-model";
import type { CalendarSourceInfo } from "@/lib/calendarization-model";
import { newRequestId } from "@/lib/request-id";
import CalendarizationFields, { type ModalCalendarConfig } from "./calendarization-fields";
export default function ModalEditor({ modal, source, endpoint, onClose, onSaved }: { modal: CatalogModal; source: CalendarSourceInfo | null; endpoint: string; onClose: () => void; onSaved: (modal: CatalogModal) => void }) {
  const dialog = useRef<HTMLDialogElement>(null); const attempt = useRef<string | null>(null);
  const [value, setValue] = useState<ModalCalendarConfig>({ isFixedFleet: modal.isFixedFleet, calendarizationType: modal.calendarizationType, sourceModalName: modal.sourceModalName });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; attempt.current ??= newRequestId(); setSaving(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: modal.id, revision: modal.revision, changeId: attempt.current, ...value }) });
      const body = await response.json() as { modal: CatalogModal; error?: string };
      if (!response.ok) throw new Error(body.error || "A alteração ainda não foi confirmada.");
      onSaved(body.modal); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="response-dialog modal-calendar-dialog" aria-labelledby="modal-calendar-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className="panel-heading"><div><span className="eyebrow">BASE GERAL DE MODAIS</span><h2 id="modal-calendar-title">Configurar {modal.name}</h2></div><button autoFocus className="icon-button" aria-label="Fechar edição do modal" disabled={saving} onClick={onClose}><X size={19}/></button></div>
    <form onSubmit={save}><CalendarizationFields value={value} modalName={modal.name} listId="edit-calendar-modal-names" sourceNames={value.isFixedFleet ? source?.ffModals : source?.sddModals} disabled={saving} onChange={next => { setValue(next); attempt.current = null; setError(""); }}/><p className="calendar-config-help">Esta configuração vale para novos pedidos de todas as transportadoras que usam este modal. Os pedidos anteriores preservam seus dados.</p>{error && <div className="dashboard-alert" role="alert">{error}</div>}<div className="modal-editor-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <Save size={17}/>}Salvar configuração</button></div></form>
  </dialog>;
}
