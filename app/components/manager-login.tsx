"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { BRAND_DESCRIPTOR, BRAND_NAME } from "@/config/brand";
import { EMAIL_RESEND_SECONDS, REMEMBER_SESSION_DAYS } from "@/lib/email-model";
import { LOGIN_COOLDOWN_KEY, cooldownSeconds } from "@/lib/login-cooldown";
import { newRequestId } from "@/lib/request-id";
import Brand from "./brand";
import ThemeToggle from "./theme-toggle";
import CalendarizationWeekTimer from "./calendarization-countdown";

export default function ManagerLogin({ signedInEmail }: { signedInEmail?: string }) {
  const [email, setEmail] = useState(""); const [otp, setOtp] = useState(""); const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [cooldownUntil, setCooldownUntil] = useState(0); const [clock, setClock] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  const cooldown = cooldownSeconds(cooldownUntil, clock);
  useEffect(() => { const params = new URLSearchParams(window.location.hash.slice(1)); const linkedEmail = params.get("email"); const linkedCode = params.get("codigo");
    if (linkedEmail && linkedCode && /^\d{6}$/.test(linkedCode)) { setEmail(linkedEmail); setOtp(linkedCode); setStep("code"); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  useEffect(() => {
    function syncCooldown() {
      let until = 0; try { const stored = Number(localStorage.getItem(LOGIN_COOLDOWN_KEY)); if (Number.isFinite(stored) && stored > Date.now()) until = Math.min(stored, Date.now() + 600000); } catch { /* Server limits also protect browsers without storage. */ }
      setClock(Date.now()); setCooldownUntil(until);
    }
    function storageChanged(event: StorageEvent) { if (event.key === LOGIN_COOLDOWN_KEY || event.key === null) syncCooldown(); }
    syncCooldown(); window.addEventListener("storage", storageChanged); return () => window.removeEventListener("storage", storageChanged);
  }, []);
  useEffect(() => {
    if (!cooldownUntil) return;
    function tick() { const now = Date.now(); setClock(now); if (now >= cooldownUntil) setCooldownUntil(0); }
    const interval = window.setInterval(tick, 500); window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [cooldownUntil]);
  function setCooldown(seconds: number) {
    const duration = Math.max(0, Math.min(600, seconds)); const until = duration ? Date.now() + duration * 1000 : 0;
    setClock(Date.now()); setCooldownUntil(until);
    try { if (until) localStorage.setItem(LOGIN_COOLDOWN_KEY, String(until)); else localStorage.removeItem(LOGIN_COOLDOWN_KEY); } catch { /* Storage is optional; the server remains authoritative. */ }
  }
  async function requestCode(event?: React.FormEvent) {
    event?.preventDefault(); if (busy || cooldown > 0) return; setBusy(true); setError(""); setNotice(""); setOtp(""); setCooldown(EMAIL_RESEND_SECONDS);
    const normalized = email.trim().toLowerCase();
    try {
      const response = await fetch("/api/auth/email-otp/send-verification-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalized, type: "sign-in", requestId: newRequestId() }) });
      const body = await response.json() as { message?: string; error?: string; retryAfter?: number };
      if (typeof body.retryAfter === "number") setCooldown(body.retryAfter);
      if (!response.ok) { if (!body.retryAfter && response.status < 500) setCooldown(0); throw new Error(body.error || "Não foi possível solicitar o código."); }
      setEmail(normalized); setStep("code"); setNotice(body.message || "Confira seu e-mail."); setCooldown(body.retryAfter ?? EMAIL_RESEND_SECONDS);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), otp, rememberMe }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível verificar o código.");
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira sua conexão e tente novamente."); setBusy(false); }
  }
  return <main className="access-page manager-login-page">
    <header className="public-header"><Brand/><div className="public-header-actions"><CalendarizationWeekTimer/><ThemeToggle/></div></header>
    <div className="access-layout manager-login-layout">
      <section className="access-copy"><span className="eyebrow">ACESSO DOS GESTORES</span><h1>Sua equipe.<br/><span>A operação conectada.</span></h1><p>Entre no FleetOps para acompanhar a disponibilidade, gerenciar pedidos e organizar a próxima expedição.</p>
        <div className="manager-login-points"><div><ShieldCheck size={19}/><span><strong>Seu e-mail, seu acesso</strong><small>Um código confirma o endereço cadastrado.</small></span></div><div><UsersRound size={19}/><span><strong>Acesso sob medida</strong><small>Cada gestor vê as abas liberadas pelo master.</small></span></div></div>
      </section>
      <section className="access-card manager-login-card"><span className="lock-icon">{step === "email" ? <Mail size={25}/> : <LockKeyhole size={25}/>}</span><span className="manager-login-tag">PAINEL DE GESTÃO</span><h2>{step === "email" ? "Entrar com e-mail" : "Confira seu e-mail"}</h2><p>{step === "email" ? "Use o e-mail cadastrado pelo master. Enviaremos um código para confirmar que o endereço é seu." : "Digite o código de seis números. Ele vale por 10 minutos e pode ser usado uma única vez."}</p>
        <form className="email-login-form" onSubmit={step === "email" ? requestCode : verify}>
          <label className="field-label">E-mail de acesso<input type="email" required maxLength={254} autoComplete="email" disabled={busy || step === "code"} value={email} onChange={event => { setEmail(event.target.value); setError(""); }} placeholder="seunome@empresa.com"/></label>
          {step === "code" && <label className="field-label">Código de verificação<input className="email-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus value={otp} disabled={busy} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000000"/></label>}
          <label className="login-remember-choice"><input type="checkbox" checked={rememberMe} disabled={busy} onChange={event => setRememberMe(event.target.checked)}/><span><strong>Manter conectado</strong><small>{rememberMe ? `Seu acesso ficará salvo por até ${REMEMBER_SESSION_DAYS} dias neste navegador.` : "Sem marcar, o acesso vale somente nesta sessão do navegador."}</small></span></label>
          {error && <p className="manager-form-error" role="alert">{error}</p>}{notice && <p className="email-login-notice" role="status">{notice}</p>}
          <button className="button primary full" disabled={busy || (step === "email" ? !email.trim() || cooldown > 0 : otp.length !== 6)}>{busy ? <LoaderCircle className="spin" size={17}/> : <ArrowRight size={17}/>} {step === "email" ? cooldown > 0 ? `Receber código em ${cooldown}s` : "Receber código por e-mail" : "Verificar e entrar"}</button>
          {step === "code" && <div className="email-login-actions"><button type="button" className="text-button" disabled={busy || cooldown > 0} onClick={() => requestCode()}>{cooldown > 0 ? `Reenviar em ${cooldown}s` : "Enviar outro código"}</button><button type="button" className="text-button" disabled={busy} onClick={() => { setStep("email"); setOtp(""); setError(""); setNotice(""); }}>Alterar e-mail</button></div>}
        </form>
        <small className="manager-login-note"><Check size={13}/>O master define as permissões do seu perfil.</small>
        <details className="master-recovery"><summary>Recuperação do master principal</summary><p>Acesso de recuperação da conta original da operação.</p><a href={signedInEmail ? "/signout-with-chatgpt?return_to=%2Flogin" : "/signin-with-chatgpt?return_to=%2F"} target="_top">{signedInEmail ? "Trocar conta de recuperação" : "Continuar com ChatGPT"}<ArrowUpRight size={13}/></a></details>
        <div className="carrier-instruction"><strong>É uma transportadora?</strong><p>Use o link exclusivo enviado no seu grupo para informar disponibilidade e acompanhar pedidos.</p></div>
      </section>
    </div><footer className="public-footer">{BRAND_NAME} · {BRAND_DESCRIPTOR}<span>Uma operação, os acessos certos.</span></footer>
  </main>;
}
