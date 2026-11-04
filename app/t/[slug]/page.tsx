import { notFound } from "next/navigation";
import { findCarrier } from "@/lib/carrier-registry";
import { CarrierCatalogProvider } from "@/app/components/carrier-catalog";
import CarrierForm from "@/app/components/carrier-form";
import { operationDate } from "@/lib/model";
export const dynamic = "force-dynamic";
export default async function CarrierPage({ params }: { params: Promise<{ slug: string }> }) {
  const carrier = await findCarrier((await params).slug);
  if (!carrier) notFound();
  return <CarrierCatalogProvider initialCarriers={[carrier]}><CarrierForm carrier={carrier} initialDate={operationDate()}/></CarrierCatalogProvider>;
}
