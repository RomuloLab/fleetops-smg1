import { getDb } from "@/db";
import { carrierModals } from "@/db/schema";
import { CONFIGURED_CARRIER_MODALS } from "@/config/carrier-modals";

export async function ensureConfiguredCarrierModals(carrier: string) {
  const configured = CONFIGURED_CARRIER_MODALS[carrier] ?? [];
  if (!configured.length) return;
  // Defaults initialize missing rows only. An owner removal must survive polling,
  // new requests, reloads and future deployments.
  await getDb().insert(carrierModals).values(configured.map(modal => ({ ...modal, carrier, active: 1 })))
    .onConflictDoNothing();
}

export async function ensureConfiguredCatalog() {
  for (const carrier of Object.keys(CONFIGURED_CARRIER_MODALS)) await ensureConfiguredCarrierModals(carrier);
}
