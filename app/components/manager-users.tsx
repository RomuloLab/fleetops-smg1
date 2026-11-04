"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Crown, LoaderCircle, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { MANAGER_TABS, type ManagerTab, type ManagerUser } from "@/lib/manager-access-model";
import ManagerEmailSettings from "./manager-email-settings";
import { MAIL_STATUS_LABELS } from "@/lib/email-model";
import { newRequestId } from "@/lib/request-id";

const ALL_TABS = MANAGER_TABS.map(tab => tab.key);
function MasterRoleField({ value, onChange, disabled }: { value: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  const hint = useId();
  return <label className={"manager-master-choice " + (value ? "selected" : "")}><input type="checkbox" aria-label="Acesso master" aria-describedby={hint} checked={value} disabled={disabled} onChange={event => onChange(event.target.checked)}/><Crown size={20} aria-hidden="true"/><span><strong>Acesso master</strong><small id={hint}>Libera todas as abas, incluindo Usuários, e permite gerenciar acessos e nomear outros masters.</small></span></label>;
}
function PermissionFields({ value, onChange, disabled = false, fullAccess = false }: { value: ManagerTab[]; onChange: (value: ManagerTab[]) => void; disabled?: boolean; fullAccess?: boolean }) {
  return <fieldset className="manager-permissions" disabled={disabled}><legend>Abas permitidas</legend><p>{fullAccess ? "O perfil master tem acesso completo. A aba Usuários também é liberada automaticamente." : "O gestor verá somente as abas selecionadas abaixo."}</p><div>{MANAGER_TABS.map(tab => <label className={value.includes(tab.key) ? "selected" : ""} key={tab.key}><input type="checkbox" checked={value.includes(tab.key)} onChange={event => onChange(event.target.checked ? [...value, tab.key] : value.filter(key => key !== tab.key))}/><span><strong>{tab.label}</strong><small>{tab.description}</small></span></label>)}</div></fieldset>;
}
type FormValue = { name: string; email: string; permissions: ManagerTab[]; active: boolean; isMaster: boolean };
const emptyForm = (): FormValue => ({ name: "", email: "", permissions: [], active: true, isMaster: false });

export default function ManagerUsers({ endpoint = "/api/gestao/usuarios", mailEndpoint = "/api/gestao/email" }: { endpoint?: string; mailEndpoint?: string }) {
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [reload, setReload] = useState(0);
  const [form, setForm] = useState<FormValue>(emptyForm); const [adding, setAdding] = useState(false);
  const [createError, setCreateError] = useState(""); const [notice, setNotice] = useState("");
  const [inviting, setInviting] = useState("");
  const inviteAttempts = useRef<Record<string, string>>({});
  const [editing, setEditing] = useState<ManagerUser | null>(null); const [search, setSearch] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json() as { users?: ManagerUser[]; error?: string };
      if (!response.ok || !body.users) throw new Error(body.error || "Não foi possível carregar os usuários.");
      if (!controller.signal.aborted) setUsers(body.users);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha de conexão."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, reload]);
  function upsert(user: ManagerUser) { setUsers(current => current.some(item => item.id === user.id) ? current.map(item => item.id === user.id ? user : item) : [...current, user]); }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (adding) return;
    setAdding(true); setCreateError(""); setNotice("");
    const values = { ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), permissions: form.isMaster ? ALL_TABS : form.permissions };
    const signature = JSON.stringify(values);
    try {
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: newRequestId() };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, id: attempt.current.id }) });
      const body = await response.json() as { user?: ManagerUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error || "O cadastro não foi confirmado.");
      upsert(body.user); setForm(emptyForm()); attempt.current = null;
      setNotice(`${body.user.name} cadastrado${body.user.isMaster ? " como master" : ""}. ${body.user.active ? `Convite: ${MAIL_STATUS_LABELS[body.user.inviteStatus] || "não confirmado"}. ${body.user.inviteError || "O primeiro acesso confirma o e-mail."}` : "Ative o acesso para enviar um convite."}`);
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { setAdding(false); }
  }
  async function invite(user: ManagerUser) {
    if (inviting) return; setInviting(user.id); setError(""); setNotice("");
    try {
      const id = inviteAttempts.current[user.id] ||= newRequestId();
      const response = await fetch(mailEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invite", id, userId: user.id }) });
      const body = await response.json() as { user?: ManagerUser; error?: string }; if (!response.ok || !body.user) throw new Error(body.error || "O convite não foi confirmado.");
      delete inviteAttempts.current[user.id]; upsert(body.user); setNotice(`Convite de ${user.name}: ${MAIL_STATUS_LABELS[body.user.inviteStatus] || "não confirmado"}. ${body.user.inviteError || "Confira o recebimento com o destinatário."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão."); } finally { setInviting(""); }
  }
  const managers = users.filter(user => !user.isOwner);
  const visible = users.filter(user => `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <div className="manager-users-panel">
    <div className="manager-master-note"><span className="small-icon"><Crown size={21}/></span><div><strong>Você está no perfil master</strong><p>Cadastre gestores, nomeie outros masters e gerencie as permissões. A conta master principal permanece protegida e com acesso completo.</p></div><span className="manager-role master"><ShieldCheck size={12}/>Master</span></div>
    <div className="manager-user-metrics"><article><UsersRound size={20}/><div><strong>{loading ? "—" : managers.length}</strong><span>Gestores cadastrados</span></div></article><article><CheckCircle2 size={20}/><div><strong>{loading ? "—" : managers.filter(user => user.active).length}</strong><span>Acessos ativos</span></div></article><article><LockKeyhole size={20}/><div><strong>{loading ? "—" : managers.filter(user => !user.active).length}</strong><span>Acessos bloqueados</span></div></article></div>
    <ManagerEmailSettings endpoint={mailEndpoint}/>
    <section className="form-card manager-create-card"><div className="section-title"><span className="step-number"><Plus size={19}/></span><div><h2>Novo gestor</h2><p>Cadastre qualquer e-mail válido. O convite automático permite verificar o endereço e acessar.</p></div></div>
      <form onSubmit={create}><fieldset className="manager-create-fields" disabled={adding}><label className="field-label">Nome do gestor<input autoComplete="off" required minLength={2} maxLength={80} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nome e sobrenome"/></label><label className="field-label">E-mail de acesso<input type="email" autoComplete="off" required maxLength={254} value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="gestor@empresa.com"/></label></fieldset>
        <MasterRoleField value={form.isMaster} disabled={adding} onChange={isMaster => setForm(current => ({ ...current, isMaster }))}/>
        <PermissionFields value={form.isMaster ? ALL_TABS : form.permissions} fullAccess={form.isMaster} disabled={adding || form.isMaster} onChange={permissions => setForm(current => ({ ...current, permissions }))}/>
        {createError && <p className="manager-form-error" role="alert">{createError}</p>}
        <div className="manager-create-actions"><small><LockKeyhole size={13}/>A aba Usuários é exclusiva do master.</small><button className="button primary" disabled={adding || form.name.trim().length < 2 || !form.email.trim()}>{adding ? <LoaderCircle size={16} className="spin"/> : <Plus size={16}/>}Cadastrar gestor</button></div>
      </form>
    </section>
    {notice && <div className="manager-success" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button type="button" aria-label="Fechar confirmação" onClick={() => setNotice("")}><X size={16}/></button></div>}
    <section className="table-panel manager-users-table"><div className="panel-heading"><div><h2>Usuários e permissões<span className="count-badge">{users.length}</span></h2><p>As permissões são conferidas em cada ação. Painéis ativos atualizam o menu a cada 15 segundos.</p></div><button className="icon-button" aria-label="Atualizar usuários" onClick={() => setReload(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""}/></button></div>
      <div className="table-controls"><span className="manager-table-note">Master e gestores da operação</span><label className="search-input"><Search size={15}/><input aria-label="Buscar usuário" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail"/></label></div>
      {error && <div className="dashboard-alert" role="alert">{error}</div>}
      {loading && !users.length ? <div className="loading-links"><LoaderCircle className="spin" size={20}/>Carregando usuários...</div> : <div className="table-scroll"><table><thead><tr><th>USUÁRIO</th><th>PERFIL</th><th>STATUS / E-MAIL</th><th>ABAS PERMITIDAS</th><th aria-label="Ações"/></tr></thead><tbody>{visible.map(user => <tr key={user.id}><td><div className="manager-user-name"><span className="admin-avatar">{user.isMaster ? <Crown size={17}/> : <UserRound size={17}/>}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div></td><td><span className={"manager-role " + (user.isMaster ? "master" : "")}><ShieldCheck size={12}/>{user.isOwner ? "Master principal" : user.isMaster ? "Master" : "Gestor"}</span></td><td><span className={"status-badge " + (user.active ? "received" : "not_done")}><span/>{user.active ? "Ativo" : "Bloqueado"}</span>{!user.isOwner && <div className="manager-email-status"><strong>{user.emailVerifiedAt ? "E-mail verificado" : "Verificação pendente"}</strong><small title={user.inviteError || undefined}>Convite: {MAIL_STATUS_LABELS[user.inviteStatus] || "Não enviado"}</small></div>}</td><td><div className="manager-permission-tags">{MANAGER_TABS.filter(tab => user.isMaster || user.permissions.includes(tab.key)).map(tab => <span key={tab.key}>{tab.label}</span>)}{user.isMaster && <span>Usuários</span>}{!user.isMaster && !user.permissions.length && <small>Nenhuma aba liberada</small>}</div></td><td>{user.isOwner ? <span className="manager-protected"><LockKeyhole size={13}/>Protegido</span> : <div className="manager-row-actions"><button className="text-button" disabled={!user.active || !!inviting} onClick={() => invite(user)}>{inviting === user.id ? <LoaderCircle size={14} className="spin"/> : null}{user.inviteStatus === "sent" ? "Reenviar convite" : "Enviar convite"}</button><button className="text-button" aria-label={`Editar permissões de ${user.name}`} onClick={() => setEditing(user)}>Editar<ChevronRight size={15}/></button></div>}</td></tr>)}</tbody></table>{!visible.length && !loading && <div className="scheduling-empty"><UsersRound size={26}/><strong>Nenhum usuário encontrado</strong><p>Altere a busca ou cadastre um novo gestor.</p></div>}</div>}
    </section>
    {editing && <EditManager key={editing.id} user={editing} endpoint={endpoint} onClose={() => setEditing(null)} onSaved={user => { upsert(user); setNotice(`Perfil e acesso de ${user.name} atualizados.`); setEditing(null); }}/>}</div>;
}

function EditManager({ user, endpoint, onClose, onSaved }: { user: ManagerUser; endpoint: string; onClose: () => void; onSaved: (user: ManagerUser) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(user.name); const [permissions, setPermissions] = useState(user.permissions); const [active, setActive] = useState(user.active);
  const [isMaster, setIsMaster] = useState(user.isMaster);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    const values = { id: user.id, revision: user.revision, name: name.trim(), permissions: isMaster ? ALL_TABS : permissions, active, isMaster };
    const signature = JSON.stringify(values);
    try {
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: newRequestId() };
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, changeId: attempt.current.id }) });
      const body = await response.json() as { user?: ManagerUser; error?: string };
      if (!response.ok || !body.user) throw new Error(body.error || "As alterações não foram confirmadas.");
      onSaved(body.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="response-dialog manager-edit-dialog" aria-labelledby="manager-edit-title" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}><div className="dialog-heading"><div><span className="eyebrow">GESTÃO DE ACESSOS</span><h2 id="manager-edit-title">Permissões do gestor</h2></div><button type="button" className="icon-button" aria-label="Fechar edição" disabled={saving} onClick={onClose}><X size={19}/></button></div>
    <form onSubmit={save}><label className="field-label">Nome do gestor<input required minLength={2} maxLength={80} value={name} disabled={saving} onChange={event => setName(event.target.value)}/></label><div className="manager-edit-email"><span>E-mail de acesso</span><strong>{user.email}</strong><small>Verificado por um código enviado a este endereço.</small></div><MasterRoleField value={isMaster} onChange={setIsMaster} disabled={saving}/><PermissionFields value={isMaster ? ALL_TABS : permissions} fullAccess={isMaster} onChange={setPermissions} disabled={saving || isMaster}/><label className="manager-active-check"><input type="checkbox" checked={active} disabled={saving} onChange={event => setActive(event.target.checked)}/><span><strong>Acesso ativo</strong><small>{active ? "Este gestor pode entrar e usar as abas liberadas." : "Este gestor está bloqueado e não pode acessar o painel."}</small></span></label>
      {!isMaster && !permissions.length && active && <p className="manager-zero-note">Sem abas selecionadas, o gestor verá um aviso para solicitar permissões ao master.</p>}{error && <p className="manager-form-error" role="alert">{error}</p>}<div className="manager-edit-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving || name.trim().length < 2}>{saving ? <LoaderCircle size={16} className="spin"/> : <ShieldCheck size={16}/>}Salvar permissões</button></div></form>
  </dialog>;
}
