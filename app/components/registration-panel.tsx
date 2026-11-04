"use client";
import { useState } from "react";
import { Building2, Truck } from "lucide-react";
import type { Carrier } from "@/lib/model";
import CarrierRegistration from "./carrier-registration";
import ModalManagement from "./modal-management";

export default function RegistrationPanel({ registrationEndpoint, modalsEndpoint, onRegistered }: {
  registrationEndpoint?: string; modalsEndpoint?: string; onRegistered?: (carrier: Carrier) => void;
}) {
  const [section, setSection] = useState<"carriers" | "modals">("carriers");
  const [carrier, setCarrier] = useState("alc");
  const [modalsVisited, setModalsVisited] = useState(false);
  function manageModals(slug: string) { setCarrier(slug); setModalsVisited(true); setSection("modals"); }
  return <>
    <nav className="registration-tabs" aria-label="Seções de cadastro">
      <button className={section === "carriers" ? "selected" : ""} aria-pressed={section === "carriers"} onClick={() => setSection("carriers")}><Building2 size={17}/>Transportadoras</button>
      <button className={section === "modals" ? "selected" : ""} aria-pressed={section === "modals"} onClick={() => { setModalsVisited(true); setSection("modals"); }}><Truck size={17}/>Base de modais</button>
    </nav>
    <div hidden={section !== "carriers"}><CarrierRegistration endpoint={registrationEndpoint} onRegistered={onRegistered} onManageModals={manageModals}/></div>
    <div hidden={section !== "modals"}>{modalsVisited && <ModalManagement key={carrier} initialCarrier={carrier} endpoint={modalsEndpoint}/>}</div>
  </>;
}
