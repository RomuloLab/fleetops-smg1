"use client";
import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
export default function ManagerSignOut({ text = false }: { text?: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  async function signOut() {
    if (busy) return; setBusy(true); setError(false);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("success" in body) || body.success !== true) throw new Error();
      window.location.assign("nextPath" in body && body.nextPath === "/login" ? "/login" : "/signout-with-chatgpt?return_to=%2Flogin");
    }
    catch { setError(true); setBusy(false); }
  }
  return <button className="manager-signout" aria-label={error ? "Falha ao sair. Tentar novamente" : "Sair do painel"} title={error ? "Não foi possível sair. Tente novamente." : "Sair do painel"} disabled={busy} onClick={signOut}>{busy ? <LoaderCircle className="spin" size={17}/> : <LogOut size={17}/>} {text && (error ? "Tentar sair novamente" : "Sair da conta")}</button>;
}
