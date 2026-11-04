import type { SchedulingModal } from "@/lib/scheduling";

// Approved carrier configuration. Catalog data is synchronized separately from
// schema migrations; IDs and codes remain stable for existing order history.
export const CONFIGURED_CARRIER_MODALS: Record<string, readonly SchedulingModal[]> = {
  alc: [
    { id: "alc-vuc-rental-tks", code: "vuc-rental-tks", name: "Vuc Rental TKS" },
    { id: "alc-vuc-sdd", code: "vuc-sdd", name: "Vuc SDD" },
    { id: "alc-vuc-pp-sdd", code: "vuc-pp-sdd", name: "Vuc PP SDD" },
    { id: "alc-hr-sdd", code: "hr-sdd", name: "HR SDD" },
    { id: "alc-hr-8hs", code: "hr-8hs", name: "HR 8hs" },
    { id: "alc-vuc-dedicado-com-ajudante", code: "vuc-dedicado-com-ajudante", name: "Vuc Dedicado com Ajudante" },
    { id: "alc-utilitario", code: "utilitario", name: "Utilitario" },
    { id: "alc-utilitario-sdd", code: "utilitario-sdd", name: "Utilitario SDD" },
  ],
};

export function orderCarrierModals<T extends SchedulingModal>(carrier: string, modals: T[]): T[] {
  const configured = CONFIGURED_CARRIER_MODALS[carrier] ?? [];
  if (!configured.length) return modals;
  const rank = new Map(configured.map((modal, index) => [modal.code, index]));
  return [...modals].sort((a, b) => (rank.get(a.code) ?? configured.length) - (rank.get(b.code) ?? configured.length) || a.name.localeCompare(b.name, "pt-BR"));
}
