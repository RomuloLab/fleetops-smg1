"use client";
import { useEffect, useState } from "react";
import type { OperationWindow } from "@/lib/model";

export function useOperationWindow(access: OperationWindow | null) {
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  useEffect(() => {
    if (!access) { setDeadlinePassed(false); return; }
    const initiallyEditable = access.editable;
    const deadline = performance.now() + Date.parse(access.closesAt) - Date.parse(access.serverNow);
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      clearTimeout(timer);
      const remaining = deadline - performance.now();
      const closed = !initiallyEditable || remaining <= 0;
      setDeadlinePassed(closed);
      if (!closed) timer = setTimeout(check, Math.min(remaining, 60000));
    }
    function onVisibility() { if (!document.hidden) check(); }
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [access]);
  return !!access && (!access.editable || deadlinePassed);
}
