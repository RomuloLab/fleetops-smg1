import { Truck } from "lucide-react";
import { BRAND_NAME, BRAND_TITLE } from "@/config/brand";
export default function Brand() {
  return <a className="brand" href="/" aria-label={BRAND_TITLE}><span className="brand-symbol"><Truck size={22}/></span><span className="brand-word">{BRAND_NAME}<span className="brand-dot">.</span></span></a>;
}
