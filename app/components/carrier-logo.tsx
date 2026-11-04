"use client";
import { CARRIER_LOGOS, type CarrierLogoAsset } from "@/config/carrier-logos";
import { useCarrierCatalog } from "./carrier-catalog";
type Size = "table" | "card" | "portal" | "notice";
export function CarrierLogoFrame({ logo, initials, label, size = "table" }: { logo?: CarrierLogoAsset; initials: string; label: string; size?: Size }) {
  return <span className={`carrier-logo carrier-logo-${size}${logo ? "" : " carrier-logo-fallback"}`} style={logo ? { backgroundColor: logo.background } : undefined}>
    {logo ? <svg viewBox={logo.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Logo ${label}`} focusable="false"><image href={logo.src} x={0} y={0} width={logo.width} height={logo.height} preserveAspectRatio="none"/></svg> : <span aria-hidden="true">{initials}</span>}
  </span>;
}
export default function CarrierLogo({ slug, size = "table" }: { slug: string; size?: Size }) {
  const { findCarrier } = useCarrierCatalog(); const carrier = findCarrier(slug);
  return <CarrierLogoFrame logo={carrier?.logo ?? CARRIER_LOGOS[slug]} initials={carrier?.initials ?? "TP"} label={carrier?.name ?? slug} size={size}/>;
}
