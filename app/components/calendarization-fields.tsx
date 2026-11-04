"use client";
import { Info } from "lucide-react";
import type { CatalogModal } from "@/lib/modal-catalog-model";
export type ModalCalendarConfig = Pick<CatalogModal, "isFixedFleet" | "calendarizationType" | "sourceModalName">;
export const EMPTY_MODAL_CALENDAR: ModalCalendarConfig = { isFixedFleet: false, calendarizationType: "none", sourceModalName: "" };
export default function CalendarizationFields({ value, onChange, modalName, listId, sourceNames = [], disabled = false }: {
  value: ModalCalendarConfig; onChange: (value: ModalCalendarConfig) => void; modalName: string; listId: string; sourceNames?: string[]; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="calendar-modal-fields">
    <label className="calendar-config-check"><input type="checkbox" checked={value.isFixedFleet} onChange={event => onChange({ ...value, isFixedFleet: event.target.checked, calendarizationType: event.target.checked ? "FF" : "none" })}/><span><strong>Frota fixa</strong><small>Exige placa no pedido e consulta a calendarização FF da SMG1.</small></span></label>
    {!value.isFixedFleet && <label className="calendar-config-check"><input type="checkbox" checked={value.calendarizationType === "SDD"} onChange={event => onChange({ ...value, calendarizationType: event.target.checked ? "SDD" : "none" })}/><span><strong>Consultar calendarização SDD</strong><small>Confere a quantidade por data, ciclo, modal e transportadora.</small></span></label>}
    {value.calendarizationType !== "none" && <label className="field-label calendar-source-modal-label">Nome do modal na planilha<span className="optional">opcional</span><input maxLength={80} list={listId} placeholder={modalName.trim() || "Usar o nome do modal cadastrado"} value={value.sourceModalName} onChange={event => onChange({ ...value, sourceModalName: event.target.value })}/><datalist id={listId}>{sourceNames.map(name => <option key={name} value={name}/>)}</datalist><small>Preencha se o nome na planilha for diferente. Vazio usa o nome cadastrado.</small></label>}
    {value.isFixedFleet && <p className="calendar-config-help"><Info size={14}/>Cada pedido de frota fixa corresponde a um veículo e uma placa.</p>}
  </fieldset>;
}
