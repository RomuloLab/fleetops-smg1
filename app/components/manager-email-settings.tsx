"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, LoaderCircle, Mail, Send, Settings2 } from "lucide-react";
import { newRequestId } from "@/lib/request-id";
import { MAIL_STATUS_LABELS, type MailDelivery, type MailSettingsInfo } from "@/lib/email-model";
export default function ManagerEmailSettings({ endpoint = "/api/gestao/email" }: { endpoint?: string }) {
  const [settings, setSettings] = useState<MailSettingsInfo | null>(null); const [fromEmail, setFromEmail] = useState(""); const [apiKey, setApiKey] = useState(""); const [testEmail, setTestEmail] = useState("");
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null); const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const saveAttempt = useRef<{ signature: string; id: string } | null>(null); const testAttempt = useRef<{ email: string; id: string } | null>(null);
  useEffect(() => { const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json() as { settings: MailSettingsInfo; preview: { html: string; subject: string }; testEmail: string; error?: string }; if (!response.ok) throw new Error(body.error || "Não foi possível carregar o remetente.");
      if (!controller.signal.aborted) { setSettings(body.settings); setFromEmail(body.settings.fromEmail); setPreview(body.preview); setTestEmail(body.testEmail || ""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); });
    return () => controller.abort();
  }, [endpoint]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!settings || busy) return; setBusy("save"); setError(""); setNotice("");
    const values = { fromEmail: fromEmail.trim().toLowerCase(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), revision: settings.revision };
    try {
      const signature = JSON.stringify(values); if (saveAttempt.current?.signature !== signature) saveAttempt.current = { signature, id: newRequestId() };
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, changeId: saveAttempt.current.id }) });
      const body = await response.json() as { settings: MailSettingsInfo; error?: string }; if (!response.ok) throw new Error(body.error || "Configuração não confirmada.");
      setSettings(body.settings); setApiKey(""); saveAttempt.current = null; setNotice("Remetente salvo. Envie um teste para confirmar o recebimento antes de convidar a equipe.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão."); } finally { setBusy(""); }
  }
  async function test(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy("test"); setError(""); setNotice("");
    try {
      const email = testEmail.trim().toLowerCase(); if (testAttempt.current?.email !== email) testAttempt.current = { email, id: newRequestId() };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", email, id: testAttempt.current.id }) });
      const body = await response.json() as { delivery?: MailDelivery; error?: string }; if (!response.ok || !body.delivery) throw new Error(body.error || "Teste não confirmado.");
      testAttempt.current = null;
      if (body.delivery.status !== "sent") throw new Error(body.delivery.error || MAIL_STATUS_LABELS[body.delivery.status]);
      setNotice(`Teste enviado ao serviço para ${email}. Confira a caixa de entrada e o spam para confirmar a entrega.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão."); } finally { setBusy(""); }
  }
  return <section className="form-card email-settings-card"><div className="section-title"><span className="step-number"><Mail size={19}/></span><div><h2>Convites e verificação por e-mail</h2><p>O convite é enviado ao cadastrar um gestor ativo. O primeiro acesso confirma o endereço.</p></div><span className={"email-setup-badge " + (settings?.configured ? "configured" : "")}>{settings?.configured ? "Remetente salvo" : "Configurar remetente"}</span></div>
    <details className="email-provider-details" open={!settings?.configured}><summary><Settings2 size={15}/>Serviço de envio · Resend</summary><p>Use uma chave de envio do Resend e um remetente de um domínio verificado. A chave fica protegida e não é exibida novamente.</p>
      <form onSubmit={save}><fieldset disabled={!!busy || !settings?.secretReady} className="email-settings-fields"><label className="field-label">E-mail do remetente<input type="email" required maxLength={254} autoComplete="off" placeholder="acesso@suaempresa.com.br" value={fromEmail} onChange={event => setFromEmail(event.target.value)}/></label><label className="field-label">Chave de envio<input type="password" autoComplete="new-password" required={!settings?.configured} maxLength={512} placeholder={settings?.configured ? "Chave salva · preencha somente para trocar" : "re_…"} value={apiKey} onChange={event => setApiKey(event.target.value)}/></label></fieldset>
      {settings && !settings.secretReady && <p className="manager-form-error">O acesso por e-mail aguarda a configuração do servidor.</p>}
      <button className="button secondary" disabled={!!busy || !settings?.secretReady}>{busy === "save" ? <LoaderCircle size={15} className="spin"/> : <CheckCircle2 size={15}/>}Salvar remetente</button></form>
    </details>
    <div className="email-settings-bottom"><form onSubmit={test}><label className="field-label">Destinatário do teste<input type="email" required maxLength={254} value={testEmail} onChange={event => setTestEmail(event.target.value)} placeholder="seuemail@empresa.com" disabled={!!busy}/></label><button className="button secondary" disabled={!!busy || !settings?.configured || !testEmail}>{busy === "test" ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>}Enviar teste</button></form><button type="button" className="text-button" onClick={() => setShowPreview(value => !value)} disabled={!preview}><Eye size={16}/>{showPreview ? "Fechar prévia" : "Ver mensagem do convite"}</button></div>
    {error && <p className="manager-form-error" role="alert">{error}</p>}{notice && <p className="email-settings-notice" role="status">{notice}</p>}
    {showPreview && preview && <div className="email-message-preview"><strong>{preview.subject}</strong><small>Exemplo de mensagem · sem código válido</small><iframe title="Prévia do convite por e-mail" srcDoc={preview.html} sandbox="" referrerPolicy="no-referrer"/></div>}
  </section>;
}
