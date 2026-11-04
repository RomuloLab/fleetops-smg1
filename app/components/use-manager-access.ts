"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagerAccess } from "@/lib/manager-access-model";
export function useManagerAccess(initial: ManagerAccess, endpoint = "/api/gestao/acesso") {
  const [access, setAccess] = useState<ManagerAccess | null>(initial);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setAccess(null); return; }
      if (!response.ok) return;
      const body = await response.json() as { access?: ManagerAccess };
      if (!controller.signal.aborted && body.access) setAccess(body.access);
    } catch { /* The server continues to authorize every operation during a connection failure. */ }
  }, [endpoint]);
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(onVisible, 15000);
    document.addEventListener("visibilitychange", onVisible); window.addEventListener("focus", onVisible);
    return () => { window.clearInterval(timer); active.current?.abort(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [refresh]);
  return { access, refreshAccess: refresh };
}
