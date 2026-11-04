"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, ListChecks, LoaderCircle, Pencil, Plus, RefreshCw, Save, Search, Truck } from "lucide-react";
import { type CarrierModalSelection, type CatalogModal, type ModalManagementData, modalNameKey } from "@/lib/modal-catalog-model";
import { newRequestId } from "@/lib/request-id";
import { useCarrierCatalog } from "./carrier-catalog";
import CarrierLogo from "./carrier-logo";
import CalendarizationFields, { EMPTY_MODAL_CALENDAR, type ModalCalendarConfig } from "./calendarization-fields";
import CalendarizationSourcePanel from "./calendarization-source";
import ModalEditor from "./modal-editor";
import type { CalendarSourceInfo } from "@/lib/calendarization-model";

type Props = { endpoint?: string; initialCarrier?: string; sourceEndpoint?: string };
function sameCodes(first: string[], second: string[]) { return first.length === second.length && first.every(code => second.includes(code)); }
export default function ModalManagement({ endpoint = "/api/gestao/modais", initialCarrier = "alc", sourceEndpoint }: Props) {
  const { carriers, findCarrier } = useCarrierCatalog();
  const [carrier, setCarrier] = useState(initialCarrier);
  const [modals, setModals] = useState<CatalogModal[]>([]);
  const [selection, setSelection] = useState<CarrierModalSelection | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(""); const [saveError, setSaveError] = useState("");
  const [reload, setReload] = useState(0); const [search, setSearch] = useState(""); const [saved, setSaved] = useState("");
  const [name, setName] = useState(""); const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(""); const [created, setCreated] = useState("");
  const [calendarConfig, setCalendarConfig] = useState<ModalCalendarConfig>(EMPTY_MODAL_CALENDAR);
  const [source, setSource] = useState<CalendarSourceInfo | null>(null); const [editingModal, setEditingModal] = useState<CatalogModal | null>(null);
  const createAttempt = useRef<string | null>(null); const saveAttempt = useRef<string | null>(null);
  const ready = !loading && !loadError && selection?.carrier === carrier;
  const dirty = !!selection && !sameCodes(codes, selection.codes);
  const currentCarrier = findCarrier(carrier);
  const visible = modals.filter(modal => modalNameKey(modal.name).includes(modalNameKey(search)));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadError(""); setSaveError(""); setSaved(""); saveAttempt.current = null;
    fetch(`${endpoint}?transportadora=${encodeURIComponent(carrier)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json() as ModalManagementData & { error?: string };
      if (!response.ok || !body.selection) throw new Error(body.error || "Não foi possível carregar os modais.");
      if (controller.signal.aborted) return;
      setModals(body.modals); setSelection(body.selection); setCodes(body.selection.codes);
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Falha de conexão."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, carrier, reload]);

  function changeCodes(next: string[]) { setCodes(next); setSaveError(""); setSaved(""); saveAttempt.current = null; }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (creating || !ready) return;
    createAttempt.current ??= newRequestId(); setCreating(true); setCreateError(""); setCreated("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: createAttempt.current, name, ...calendarConfig }) });
      const body = await response.json() as { modal: CatalogModal; error?: string };
      if (!response.ok) throw new Error(body.error || "O modal ainda não foi confirmado.");
      setModals(current => [...current.filter(modal => modal.code !== body.modal.code), body.modal].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setCreated(body.modal.name); setName(""); setCalendarConfig(EMPTY_MODAL_CALENDAR); createAttempt.current = null;
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Verifique a conexão e tente novamente."); }
    finally { setCreating(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || !selection || saving || !dirty) return;
    saveAttempt.current ??= newRequestId(); setSaving(true); setSaveError(""); setSaved("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ carrier, codes, revision: selection.revision, changeId: saveAttempt.current }) });
      const body = await response.json() as { selection: CarrierModalSelection; error?: string };
      if (!response.ok) throw new Error(body.error || "A seleção ainda não foi confirmada.");
      setSelection(body.selection); setCodes(body.selection.codes); saveAttempt.current = null;
      setSaved(`Modais da ${currentCarrier?.name ?? carrier} atualizados. A seleção já está disponível no Scheduling.`);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Verifique a conexão e tente novamente para confirmar."); }
    finally { setSaving(false); }
  }
  return <div className="modal-management">
    <aside className="modal-catalog-column">
      <section className="form-card modal-catalog-create"><div className="section-title"><span className="step-number"><Truck size={18}/></span><div><h2>Base geral de modais</h2><p>Cadastre uma vez, use em qualquer transportadora.</p></div></div>
        <form onSubmit={create}><label className="field-label" htmlFor="catalog-modal-name">Nome do modal<input id="catalog-modal-name" required minLength={2} maxLength={80} placeholder="Ex.: Van SDD" value={name} disabled={creating || !ready} onChange={event => { setName(event.target.value); createAttempt.current = null; setCreateError(""); setCreated(""); }}/></label>
          <CalendarizationFields value={calendarConfig} modalName={name} listId="new-calendar-modal-names" sourceNames={calendarConfig.isFixedFleet ? source?.ffModals : source?.sddModals} disabled={creating || !ready} onChange={next => { setCalendarConfig(next); createAttempt.current = null; setCreateError(""); setCreated(""); }}/>
          {createError && <p className="registration-field-error" role="alert">{createError}</p>}
          <button className="button primary full" type="submit" disabled={creating || !ready || name.trim().length < 2}>{creating ? <><LoaderCircle className="spin" size={17}/>Cadastrando...</> : <><Plus size={18}/>Cadastrar modal</>}</button>
        </form>
        {created && <div className="modal-success" role="status"><CheckCircle2 size={17}/><p><strong>{created} cadastrado.</strong>Marque-o na lista e salve para liberar à transportadora.</p></div>}
        <p className="registration-help"><Info size={15}/>Cadastrar na base geral não libera o modal automaticamente para as transportadoras.</p>
      </section>
      <section className="modal-catalog-guide"><span className="small-icon"><ListChecks size={22}/></span><strong>{ready ? modals.length : "—"} modais na base geral</strong><p>Selecione uma transportadora, marque os modais que ela pode solicitar e salve.</p><p>Ao desmarcar um modal, novos pedidos ficam bloqueados para ele. O histórico dos pedidos continua disponível.</p></section>
    </aside>
    <section className="table-panel modal-assignment-panel">
      <div className="panel-heading"><div><h2>Modais por transportadora</h2><p>Controle o que cada transportadora pode pedir no Scheduling.</p></div><button className="icon-button" aria-label="Recarregar modais" title={dirty ? "Salve ou descarte a seleção antes de recarregar" : "Recarregar modais"} disabled={loading || saving || creating || dirty} onClick={() => setReload(value => value + 1)}><RefreshCw className={loading ? "spin" : ""} size={17}/></button></div>
      <div className="modal-carrier-picker"><label className="field-label" htmlFor="modal-carrier">Transportadora<select id="modal-carrier" className="cycle-select" value={carrier} disabled={saving || creating || dirty} onChange={event => { setCarrier(event.target.value); setSearch(""); }}>{carriers.map(row => <option key={row.slug} value={row.slug}>{row.name}</option>)}</select></label>
        <div className="modal-selected-carrier"><CarrierLogo slug={carrier} size="card"/><span><strong>{currentCarrier?.name}</strong><small>{ready ? `${codes.length} ${codes.length === 1 ? "modal selecionado" : "modais selecionados"}` : "Carregando seleção..."}</small></span></div>
      </div>
      {dirty && <p className="modal-dirty-note" role="status">Alterações ainda não salvas. Salve ou descarte antes de trocar de transportadora.</p>}
      {loadError ? <div className="modal-load-error" role="alert"><p>{loadError}</p><button className="button secondary small" onClick={() => setReload(value => value + 1)}><RefreshCw size={15}/>Tentar novamente</button></div> : loading ? <div className="table-empty"><LoaderCircle size={25} className="spin"/><p>Carregando base de modais...</p></div> : <form onSubmit={save}>
        <div className="table-controls"><label className="search-input"><Search size={15}/><input aria-label="Buscar modal na base geral" placeholder="Buscar modal" value={search} onChange={event => setSearch(event.target.value)}/></label><span className="registration-list-count">{visible.length} de {modals.length} modais</span></div>
        <fieldset className="modal-options" disabled={!ready || saving || creating} aria-label={`Modais disponíveis para ${currentCarrier?.name ?? carrier}`}>
          {visible.map(modal => <div className="modal-option-wrap" key={modal.code}><label className={"modal-option " + (codes.includes(modal.code) ? "selected" : "")}><input type="checkbox" value={modal.code} checked={codes.includes(modal.code)} onChange={event => changeCodes(event.target.checked ? [...codes, modal.code] : codes.filter(code => code !== modal.code))}/><span><strong>{modal.name}</strong><small>{codes.includes(modal.code) ? "Selecionado para esta transportadora" : "Disponível na base geral"}</small>{modal.isFixedFleet ? <span className="fixed-fleet-badge">Frota fixa · FF</span> : modal.calendarizationType === "SDD" ? <span className="sdd-calendar-badge">Calendarização SDD</span> : null}</span><Truck size={17}/></label><button type="button" className="modal-configure-button" aria-label={`Configurar modal ${modal.name}`} onClick={() => setEditingModal(modal)}><Pencil size={12}/>Configurar</button></div>)}
          {!visible.length && <div className="modal-empty"><Search size={24}/><p>{modals.length ? "Nenhum modal encontrado. Tente outro nome." : "Cadastre o primeiro modal na base geral."}</p></div>}
        </fieldset>
        <div className="modal-assignment-actions"><p><Info size={14}/>Somente os modais marcados ficam disponíveis para novos pedidos.</p>{saveError && <div className="dashboard-alert" role="alert">{saveError}<button type="button" disabled={saving} onClick={() => { setSelection(null); setCodes([]); setReload(value => value + 1); }}>Recarregar e revisar</button></div>}{saved && <div className="modal-success" role="status"><CheckCircle2 size={18}/><p>{saved}</p></div>}<div><button className="button secondary" type="button" disabled={!dirty || saving || creating} onClick={() => { changeCodes(selection?.codes ?? []); }}>Descartar alterações</button><button className="button primary" type="submit" disabled={!ready || !dirty || saving || creating}>{saving ? <><LoaderCircle size={17} className="spin"/>Salvando...</> : <><Save size={17}/>Salvar modais da {currentCarrier?.name}</>}</button></div></div>
      </form>}
    </section>
    <CalendarizationSourcePanel endpoint={sourceEndpoint} onLoaded={setSource}/>
    {editingModal && <ModalEditor modal={editingModal} endpoint={endpoint} source={source} onClose={() => setEditingModal(null)} onSaved={updated => { setModals(current => current.map(modal => modal.id === updated.id ? updated : modal)); setSaved(`Configuração de ${updated.name} atualizada para novos pedidos.`); }}/>}
  </div>;
}
