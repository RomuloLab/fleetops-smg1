"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    function sync() { setDark(document.documentElement.dataset.theme === "dark"); }
    function storage(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
      sync();
    }
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(THEME_CHANGE_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  function toggle() {
    const theme: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    setDark(theme === "dark");
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Switching still works when storage is unavailable. */ }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
  return <button type="button" className="theme-toggle" role="switch" aria-label="Modo escuro" aria-checked={dark} title={dark ? "Ativar modo claro" : "Ativar modo escuro"} onClick={toggle}>
    <span className="theme-toggle-thumb" aria-hidden="true"/>
    <Sun className="theme-toggle-sun" size={16} aria-hidden="true"/>
    <Moon className="theme-toggle-moon" size={16} aria-hidden="true"/>
  </button>;
}
