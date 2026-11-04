"use client";
import ManagerSignOut from "./manager-signout";
import { LockKeyhole, RefreshCw } from "lucide-react";
import Brand from "./brand";
import ThemeToggle from "./theme-toggle";
import CalendarizationWeekTimer from "./calendarization-countdown";
export default function ManagerAccessEmpty({ name, email, blocked, onRefresh }: { name: string; email: string; blocked: boolean; onRefresh: () => void }) {
  return <main className="access-page"><header className="public-header"><Brand/><div className="public-header-actions"><CalendarizationWeekTimer/><ThemeToggle/></div></header><section className="access-card manager-no-access"><span className="lock-icon"><LockKeyhole size={25}/></span><h1>{blocked ? "Acesso ao painel indisponível" : "Nenhuma aba liberada"}</h1><p>{name}, peça ao gestor master para {blocked ? "conferir seu cadastro e reativar seu acesso" : "selecionar as abas que você poderá acessar"}.</p><div className="manager-signed-in-email">Conta conectada<strong>{email}</strong></div><button className="button primary full" onClick={onRefresh}><RefreshCw size={16}/>Conferir meu acesso</button><ManagerSignOut text/></section></main>;
}
