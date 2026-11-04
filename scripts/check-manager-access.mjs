import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Runs against the same isolated Worker/database used by check-worker.mjs.
export async function checkManagerAccess({ request, owner, db, today, cycle, mailHarness }) {
  const endpoint = "/api/gestao/usuarios";
  const mutate = (method, data, headers = owner, origin = "https://dispo.test") => request(endpoint, { method, headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) });
  const identity = (name, email = `${name}@dispo.test`) => ({ "oai-authenticated-user-id": `manager-${name}`, "oai-authenticated-user-email": email });
  const mailEndpoint = "/api/gestao/email";
  assert.equal((await request(mailEndpoint)).status, 403);
  assert.equal((await request(mailEndpoint, { headers: identity("stranger") })).status, 403);
  const unconfigured = await mutate("POST", { id: randomUUID(), name: "Convite pendente", email: "unconfigured@dispo.test", permissions: [], active: true });
  assert.equal(unconfigured.status, 201); assert.equal((await unconfigured.json()).user.inviteStatus, "not_configured");
  const configure = await request(mailEndpoint, { method: "PUT", headers: { ...owner, "Content-Type": "application/json", Origin: "https://dispo.test" }, body: JSON.stringify({ fromEmail: "acesso@fleetops.test", apiKey: "re_isolated_test_key_20261025", revision: 0, changeId: randomUUID() }) });
  assert.equal(configure.status, 200); assert.equal((await configure.json()).settings.configured, true);
  const settings = await db.prepare("SELECT encrypted_key FROM mail_settings").first(); assert.ok(!settings.encrypted_key.includes("re_isolated"));
  const sessions = new Map();
  async function signIn(name, email = `${name}@dispo.test`) {
    if (sessions.has(name)) return sessions.get(name);
    const message = mailHarness.messages.findLast(message => message.to.includes(email)); assert.ok(message, email + " receives an automatic invitation");
    const otp = message.text.match(/Código de acesso: (\d{6})/)[1];
    const result = await request("/api/auth/sign-in/email-otp", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://dispo.test", "cf-connecting-ip": "192.0.2." + (sessions.size + 1) }, body: JSON.stringify({ email, otp }) });
    assert.equal(result.status, 200, await result.clone().text());
    const cookies = result.headers.getSetCookie(); assert.ok(cookies.some(value => /HttpOnly/i.test(value) && /Secure/i.test(value) && /SameSite=Lax/i.test(value)));
    const session = { Cookie: cookies.map(value => value.split(";")[0]).join("; ") }; sessions.set(name, session); return session;
  }
  assert.equal((await request("/api/gestao/acesso")).status, 403);
  assert.equal((await request(endpoint)).status, 403);
  const master = (await (await request("/api/gestao/acesso", { headers: owner })).json()).access;
  assert.equal(master.isMaster, true); assert.equal(master.isOwner, true); assert.deepEqual(master.permissions, ["dashboard", "scheduling", "links", "registration"]);
  const originalMaster = (await (await request(endpoint, { headers: owner })).json()).users.sort((a,b) => Number(b.isOwner) - Number(a.isOwner));
  assert.equal(originalMaster.length, 2); assert.equal(originalMaster[0].isMaster, true); assert.equal(originalMaster[0].isOwner, true);
  const payload = { id: randomUUID(), name: "Gestor de testes", email: "single@dispo.test", permissions: ["dashboard"], active: true };
  assert.equal((await mutate("POST", payload, {})).status, 403);
  assert.equal((await mutate("POST", payload, identity("stranger"))).status, 403);
  assert.equal((await mutate("POST", payload, owner, "https://other.test")).status, 403);
  for (const invalid of [{ ...payload, role: "master" }, { ...payload, isOwner: true }, { ...payload, isMaster: "true" }, { ...payload, permissions: ["users"] }, { ...payload, permissions: ["dashboard", "dashboard"] }, { ...payload, email: "email inválido" }]) assert.equal((await mutate("POST", invalid)).status, 400);
  assert.equal((await mutate("POST", { ...payload, email: " OWNER@DISPO.TEST " })).status, 409);
  assert.equal((await request(endpoint, { method: "POST", headers: { ...owner, "Content-Type": "application/json" }, body: "x".repeat(5001) })).status, 413);

  const getEndpoints = [
    ["dashboard", `/api/gestao?data=${today}&ciclo=${cycle}`],
    ["scheduling", `/api/gestao/scheduling?data=${today}&ciclo=${cycle}`],
    ["scheduling", "/api/gestao/scheduling/events"],
    ["links", "/api/gestao/links"],
    ["registration", "/api/gestao/modais"],
    ["registration", "/api/gestao/transportadoras"],
  ];
  const users = [];
  for (const tab of ["dashboard", "scheduling", "links", "registration"]) {
    const data = { ...payload, id: randomUUID(), name: `Gestor ${tab}`, email: `${tab}@dispo.test`, permissions: [tab] };
    const created = await mutate("POST", data); assert.equal(created.status, 201); const user = (await created.json()).user; users.push(user);
    assert.equal((await request("/api/gestao/acesso", { headers: identity(tab) })).status, 403);
    assert.equal(user.inviteStatus, "sent", JSON.stringify(user));
    const session = await signIn(tab);
    const accessResponse = await request("/api/gestao/acesso", { headers: session }); assert.equal(accessResponse.status, 200);
    const access = (await accessResponse.json()).access; assert.equal(access.isMaster, false); assert.deepEqual(access.permissions, [tab]);
    assert.equal((await request(endpoint, { headers: session })).status, 403);
    assert.equal((await mutate("POST", { ...payload, id: randomUUID(), isMaster: true }, session)).status, 403);
    assert.equal((await mutate("PATCH", { id: user.id, name: user.name, isMaster: true, permissions: ["dashboard", "scheduling", "links", "registration"], active: true, revision: 1, changeId: randomUUID() }, session)).status, 403);
    for (const [required, path] of getEndpoints) {
      const response = await request(path, { headers: session });
      assert.equal(response.status, required === tab ? 200 : 403, `${tab}: ${path}`);
    }
    const html = await (await request("/", { headers: session })).text();
    const nav = html.match(/<nav aria-label="Navegação principal">([\s\S]*?)<\/nav>/)?.[1] ?? "";
    assert.ok(nav.includes({ dashboard: "Visão geral", scheduling: "Scheduling", links: "Links de coleta", registration: "Cadastro" }[tab]));
    for (const [key, label] of Object.entries({ dashboard: "Visão geral", scheduling: "Scheduling", links: "Links de coleta", registration: "Cadastro", users: "Usuários" })) if (key !== tab) assert.ok(!nav.includes(label), `${tab} must not show ${label}`);
    // Even manually posting an action cannot escape the permitted tab.
    for (const [required, path, method] of [["registration", "/api/gestao/modais", "POST"], ["registration", "/api/gestao/modais", "PUT"], ["registration", "/api/gestao/modais", "PATCH"], ["registration", "/api/gestao/transportadoras", "POST"], ["scheduling", "/api/gestao/scheduling", "PATCH"]]) {
      if (required !== tab) assert.equal((await request(path, { method, headers: { ...session, "Content-Type": "application/json", Origin: "https://dispo.test" }, body: "{}" })).status, 403);
    }
    if (!["scheduling", "registration"].includes(tab)) assert.equal((await request("/api/gestao/calendarizacao", { headers: session })).status, 403);
    if (tab === "registration") assert.equal((await request("/api/gestao/calendarizacao", { method: "POST", headers: { ...session, "Content-Type": "application/json" }, body: JSON.stringify({ action: "check_order", id: randomUUID() }) })).status, 403);
  }
  const sameEmailWrongIdentity = identity("different", users[0].email);
  assert.equal((await request("/api/gestao/acesso", { headers: sameEmailWrongIdentity })).status, 403);
  const bound = await db.prepare("SELECT identity_id FROM manager_users WHERE id = ?").bind(users[0].id).first();
  assert.equal(bound.identity_id, null);
  const secondEmail = { ...payload, id: randomUUID(), email: "alias@dispo.test" };
  assert.equal((await mutate("POST", secondEmail)).status, 201);
  assert.equal((await request("/api/gestao/acesso", { headers: identity("dashboard", secondEmail.email) })).status, 403);
  assert.equal((await mutate("POST", { ...payload, id: randomUUID(), email: " DASHBOARD@DISPO.TEST " })).status, 409);
  assert.equal((await mutate("POST", { ...payload, id: users[0].id, email: users[0].email, name: users[0].name })).status, 200);
  const user = users[0]; const session = await signIn("dashboard");
  const update = { id: user.id, name: user.name, permissions: ["scheduling"], active: true, revision: user.revision, changeId: randomUUID() };
  assert.equal((await mutate("PATCH", { ...update, email: "new@dispo.test" })).status, 400);
  const changedResponse = await mutate("PATCH", update); assert.equal(changedResponse.status, 200);
  let current = (await changedResponse.json()).user; assert.equal(current.revision, user.revision + 1);
  assert.equal((await mutate("PATCH", update)).status, 200);
  assert.equal((await mutate("PATCH", { ...update, changeId: randomUUID() })).status, 409);
  assert.equal((await request(getEndpoints[0][1], { headers: session })).status, 403);
  assert.equal((await request(getEndpoints[1][1], { headers: session })).status, 200);
  const emptyPermissions = await mutate("PATCH", { id: current.id, name: current.name, permissions: [], active: true, revision: current.revision, changeId: randomUUID() });
  assert.equal(emptyPermissions.status, 200); current = (await emptyPermissions.json()).user;
  const emptyHtml = await (await request("/", { headers: session })).text(); assert.ok(emptyHtml.includes("Nenhuma aba liberada")); assert.ok(!emptyHtml.includes('aria-label="Navegação principal"'));
  for (const [, path] of getEndpoints) assert.equal((await request(path, { headers: session })).status, 403);
  const blocked = await mutate("PATCH", { id: current.id, name: current.name, permissions: ["dashboard"], active: false, revision: current.revision, changeId: randomUUID() });
  assert.equal(blocked.status, 200); current = (await blocked.json()).user;
  assert.equal((await request("/api/gestao/acesso", { headers: session })).status, 403);
  const blockedHtml = await (await request("/", { headers: session })).text(); assert.ok(blockedHtml.includes("Entrar com e-mail")); assert.ok(!blockedHtml.includes('aria-label="Navegação principal"'));
  const restored = await mutate("PATCH", { id: current.id, name: current.name, permissions: ["dashboard"], active: true, revision: current.revision, changeId: randomUUID() }); assert.equal(restored.status, 200);
  assert.equal((await request(getEndpoints[0][1], { headers: session })).status, 200);
  assert.equal((await request("/api/gestao/acesso", { headers: sameEmailWrongIdentity })).status, 403);
  const masterAfter = (await (await request("/api/gestao/acesso", { headers: owner })).json()).access;
  assert.equal(masterAfter.isMaster, true); assert.equal(masterAfter.permissions.length, 4);
  // Delegated masters have the same application permissions as the owner,
  // including Users and the ability to create/promote other masters.
  const delegate = users[1]; const delegateSession = await signIn("scheduling");
  const promote = { id: delegate.id, name: delegate.name, permissions: [], active: true, isMaster: true, revision: delegate.revision, changeId: randomUUID() };
  const promotedResponse = await mutate("PATCH", promote); assert.equal(promotedResponse.status, 200);
  let promoted = (await promotedResponse.json()).user;
  assert.equal(promoted.isMaster, true); assert.equal(promoted.isOwner, false); assert.deepEqual(promoted.permissions, master.permissions);
  assert.equal((await mutate("PATCH", promote)).status, 200);
  assert.equal((await mutate("PATCH", { ...promote, changeId: randomUUID() })).status, 409);
  const delegateAccess = (await (await request("/api/gestao/acesso", { headers: delegateSession })).json()).access;
  assert.equal(delegateAccess.isMaster, true); assert.equal(delegateAccess.isOwner, false); assert.deepEqual(delegateAccess.permissions, master.permissions);
  for (const [, path] of getEndpoints) assert.equal((await request(path, { headers: delegateSession })).status, 200);
  const delegatedList = (await (await request(endpoint, { headers: delegateSession })).json()).users;
  assert.equal(delegatedList.filter(row => row.isOwner).length, 1);
  assert.equal(delegatedList.find(row => row.isOwner).email, "owner@dispo.test");
  assert.equal(delegatedList.filter(row => row.id === promoted.id).length, 1);
  const delegateHtml = await (await request("/", { headers: delegateSession })).text();
  assert.match(delegateHtml.match(/<nav aria-label="Navegação principal">([\s\S]*?)<\/nav>/)?.[1] ?? "", /Usuários/);
  const masterCreated = { ...payload, id: randomUUID(), name: "Novo master", email: "new-master@dispo.test", permissions: [], isMaster: true };
  const createdByDelegate = await mutate("POST", masterCreated, delegateSession); assert.equal(createdByDelegate.status, 201);
  const otherMaster = (await createdByDelegate.json()).user; assert.equal(otherMaster.isMaster, true);
  const beforeReplay = mailHarness.messages.length;
  assert.equal((await mutate("POST", masterCreated, delegateSession)).status, 200); assert.equal(mailHarness.messages.length, beforeReplay);
  const otherSession = await signIn("new-master");
  assert.equal((await request(endpoint, { headers: otherSession })).status, 200);
  assert.equal((await mutate("POST", { ...payload, id: randomUUID(), email: "owner@dispo.test", isMaster: true }, delegateSession)).status, 409);
  assert.equal((await mutate("PATCH", { id: originalMaster[0].id, name: "Alterado", active: false, isMaster: false, permissions: [], revision: 1, changeId: randomUUID() }, delegateSession)).status, 400);
  // Omitting the role in an older client preserves an existing master role.
  const legacyUpdate = await mutate("PATCH", { id: promoted.id, name: promoted.name, permissions: [], active: true, revision: promoted.revision, changeId: randomUUID() }, otherSession);
  assert.equal(legacyUpdate.status, 200); promoted = (await legacyUpdate.json()).user; assert.equal(promoted.isMaster, true);
  // Revoking a delegated master immediately removes privileged API access.
  const demotedResponse = await mutate("PATCH", { id: promoted.id, name: promoted.name, permissions: ["links"], active: true, isMaster: false, revision: promoted.revision, changeId: randomUUID() }, otherSession);
  assert.equal(demotedResponse.status, 200); assert.equal((await demotedResponse.json()).user.isMaster, false);
  assert.equal((await request(endpoint, { headers: delegateSession })).status, 403);
  assert.equal((await request(getEndpoints[0][1], { headers: delegateSession })).status, 403);
  assert.equal((await request("/api/gestao/links", { headers: delegateSession })).status, 200);
  const blockedMaster = await mutate("PATCH", { id: otherMaster.id, name: otherMaster.name, permissions: [], active: false, isMaster: true, revision: otherMaster.revision, changeId: randomUUID() });
  assert.equal(blockedMaster.status, 200);
  assert.equal((await request(endpoint, { headers: otherSession })).status, 403);
  assert.equal((await request("/api/gestao/acesso", { headers: otherSession })).status, 403);
  const protectedOwner = (await (await request("/api/gestao/acesso", { headers: owner })).json()).access;
  assert.equal(protectedOwner.isOwner, true); assert.equal(protectedOwner.isMaster, true);
  const login = await (await request("/login")).text(); assert.ok(login.includes("Receber código por e-mail")); assert.ok(!login.includes("Gestor dashboard"));
  for (const path of ["/qa-manager", "/qa-manager-api", "/qa-manager-access", "/qa-manager-sizes.html", "/qa-master-role", "/qa-master-role-api", "/qa-email", "/qa-email-api"]) assert.equal((await request(path)).status, 404);
  const verifiedRow = await db.prepare("SELECT email_verified_at FROM manager_users WHERE email='dashboard@dispo.test'").first(); assert.ok(verifiedRow.email_verified_at);
  assert.equal((await request("/api/gestao/acesso", { headers: { ...session, ...identity("unrelated", "unrelated@elsewhere.test") } })).status, 200);
  console.log("PASS: master principal protegido; promoção de gestores e cadastro de novos masters; acesso completo e gestão de usuários por outros masters; revogação e bloqueio imediatos; sem autopromoção; compatibilidade, identidade e concorrência preservadas.");
}
