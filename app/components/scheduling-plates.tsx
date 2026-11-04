"use client";
import { useId, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, Info, X } from "lucide-react";
import { inspectSchedulingPlates, parseSchedulingPlateList } from "@/lib/scheduling-plates";
import { validPlate } from "@/lib/calendarization-model";
const PAGE_SIZE = 6;
export default function SchedulingPlates({ plates, onChange }: { plates: string[]; onChange: (plates: string[]) => void }) {
  const id = useId(); const [page, setPage] = useState(0); const [bulk, setBulk] = useState(false); const [text, setText] = useState(""); const [error, setError] = useState("");
  const { normalized, duplicates, valid } = inspectSchedulingPlates(plates);
  const totalPages = Math.max(1, Math.ceil(plates.length / PAGE_SIZE)); const activePage = Math.min(page, totalPages - 1); const start = activePage * PAGE_SIZE;
  function applyList() {
    const pasted = parseSchedulingPlateList(text); const checked = inspectSchedulingPlates(pasted);
    if (!pasted.length) { setError("Cole pelo menos uma placa."); return; }
    if (pasted.length > plates.length) { setError(`A lista contém ${pasted.length} placas e o pedido tem ${plates.length} veículos. Ajuste a quantidade ou a lista.`); return; }
    if (checked.valid !== pasted.length) { setError(checked.duplicates.size ? "Há placas repetidas na lista. Confira antes de aplicar." : "Há placas com formato inválido. Use ABC1234 ou ABC1D23."); return; }
    onChange(Array.from({ length: plates.length }, (_, index) => pasted[index] ?? "")); setPage(0); setBulk(false); setText(""); setError("");
  }
  return <section className="fixed-fleet-plate-field plate-entry" aria-labelledby={`${id}-title`}>
    <div className="plate-entry-heading"><div><h3 id={`${id}-title`}>Placas dos veículos</h3><p>Uma placa diferente para cada veículo de frota fixa.</p></div><span className={"plate-progress-label " + (valid === plates.length && plates.length ? "complete" : "")} aria-live="polite">{valid} de {plates.length} válidas</span></div>
    <div className="plate-progress-track" role="progressbar" aria-label="Placas válidas" aria-valuemin={0} aria-valuemax={Math.max(1, plates.length)} aria-valuenow={valid}><span style={{ width: `${plates.length ? valid / plates.length * 100 : 0}%` }}/></div>
    <div className="plate-entry-tools"><span>{plates.length > PAGE_SIZE ? `Veículos ${start + 1}–${Math.min(start + PAGE_SIZE, plates.length)} de ${plates.length}` : `${plates.length} veículo${plates.length === 1 ? "" : "s"} no pedido`}</span><button className="text-button" type="button" onClick={() => { setBulk(value => !value); setError(""); }}><ClipboardPaste size={14}/>{bulk ? "Fechar lista" : "Colar lista de placas"}</button></div>
    {bulk && <div className="plate-bulk-entry"><label className="field-label" htmlFor={`${id}-bulk`}>Cole as placas<textarea id={`${id}-bulk`} rows={4} maxLength={180000} placeholder={"ABC1234\nDEF1A23\nGHI4J56"} value={text} onChange={event => { setText(event.target.value); setError(""); }}/></label><small>Separe por linha, espaço, vírgula ou ponto e vírgula. A lista substituirá o preenchimento atual.</small>{error && <div className="registration-field-error" role="alert">{error}</div>}<div><button type="button" className="button secondary small" onClick={applyList}><ClipboardPaste size={14}/>Aplicar lista</button><button type="button" className="text-button" onClick={() => { setBulk(false); setError(""); }}><X size={13}/>Cancelar</button></div></div>}
    <div className="plate-input-grid">{plates.slice(start, start + PAGE_SIZE).map((plate, offset) => {
      const index = start + offset; const normalizedPlate = normalized[index]; const duplicate = duplicates.has(normalizedPlate); const invalid = !!plate && !validPlate(plate); const complete = !!normalizedPlate && !duplicate && !invalid;
      const hint = duplicate ? "Placa repetida" : invalid ? "Confira o formato" : complete ? "Placa válida" : "Preenchimento obrigatório";
      return <div className={"plate-input-item " + (duplicate || invalid ? "invalid" : complete ? "valid" : "")} key={index}><label htmlFor={`${id}-plate-${index}`}><span>Veículo {String(index + 1).padStart(2, "0")}</span></label><div><input id={`${id}-plate-${index}`} aria-label={`Placa do veículo ${index + 1}`} aria-describedby={`${id}-hint-${index}`} aria-invalid={duplicate || invalid} required minLength={7} maxLength={8} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABC1D23" value={plate} onChange={event => { const next = [...plates]; next[index] = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""); onChange(next); }}/>{complete && <CheckCircle2 size={15}/>}</div><small id={`${id}-hint-${index}`}>{hint}</small></div>;
    })}</div>
    {totalPages > 1 && <nav className="plate-pagination" aria-label="Páginas de placas"><button type="button" className="button secondary small" aria-label="Página anterior de placas" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}><ChevronLeft size={14}/>Anterior</button><span>Página {activePage + 1} de {totalPages}</span><button type="button" className="button secondary small" aria-label="Próxima página de placas" disabled={activePage >= totalPages - 1} onClick={() => setPage(activePage + 1)}>Próxima<ChevronRight size={14}/></button></nav>}
    {valid < plates.length && totalPages > 1 && <button className="text-button plate-next-pending" type="button" onClick={() => { const index = normalized.findIndex(plate => !validPlate(plate) || duplicates.has(plate)); if (index >= 0) setPage(Math.floor(index / PAGE_SIZE)); }}>Ir para a primeira placa pendente</button>}
    <p className="plate-calendar-note"><Info size={14}/>Cada placa será consultada na calendarização FF da SMG1.</p>
  </section>;
}
