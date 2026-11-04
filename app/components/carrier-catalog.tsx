"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CARRIERS, getCarrier, type Carrier } from "@/lib/model";
type Catalog = { carriers: readonly Carrier[]; findCarrier: (slug: string) => Carrier | undefined; replaceCarriers: (carriers: Carrier[]) => void; upsertCarrier: (carrier: Carrier) => void };
const Context = createContext<Catalog>({ carriers: CARRIERS, findCarrier: getCarrier, replaceCarriers: () => undefined, upsertCarrier: () => undefined });
export function CarrierCatalogProvider({ initialCarriers, children }: { initialCarriers: Carrier[]; children: ReactNode }) {
  const [carriers, setCarriers] = useState<Carrier[]>(initialCarriers);
  const latest = useRef(carriers); latest.current = carriers;
  // Alert polling keeps this stable lookup and still sees newly registered names.
  const findCarrier = useCallback((slug: string) => latest.current.find(carrier => carrier.slug === slug) ?? getCarrier(slug), []);
  const upsertCarrier = useCallback((carrier: Carrier) => setCarriers(current => current.some(row => row.slug === carrier.slug) ? current.map(row => row.slug === carrier.slug ? carrier : row) : [...current, carrier]), []);
  return <Context.Provider value={{ carriers, findCarrier, replaceCarriers: setCarriers, upsertCarrier }}>{children}</Context.Provider>;
}
export function useCarrierCatalog() { return useContext(Context); }
