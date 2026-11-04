import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkGatewayIntegration({ request, owner, db, mailHarness, token, futureDate, origin = "https://fleetops.test", entry = "vercel" }) {
  const host = new URL(origin).host;
  const gateway = {
    "x-fleetops-gateway-authorization": entry === "cloudflare" ? "isolated-cloudflare-gateway-token-at-least-48-characters-0123456789" : "isolated-gateway-token-at-least-48-characters-0123456789abcdef",
    "x-forwarded-host": host, "x-forwarded-proto": "https", "x-forwarded-for": "198.51.100.30, 203.0.113.50",
  };
  const forwarded = (path, options = {}) => request(path, { ...options, headers: { ...gateway, ...options.headers } });
  const post = (path, data, extra = {}) => forwarded(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...extra }, body: JSON.stringify(data) });
  assert.equal((await forwarded("/api/gestao/acesso", { headers: owner })).status, 403, "native identity is never accepted through the gateway");
  assert.equal((await forwarded("/api/gestao/links", { headers: owner })).status, 403);
  assert.equal((await forwarded("/", { headers: { "x-fleetops-gateway-authorization": "invalid" } })).status, 403);
  assert.equal((await forwarded("/", { headers: { "x-forwarded-host": "attacker.test" } })).status, 403);
  const loginPage = await forwarded("/"); assert.equal(loginPage.status, 200);
  assert.equal(loginPage.headers.get("X-FleetOps-Entry"), entry); assert.match(loginPage.headers.get("cache-control"), /no-store/);
  assert.match(await loginPage.text(), /Entrar com e-mail/);
  const email = "gateway-login@" + host;
  const created = await request("/api/gestao/usuarios", { method: "POST", headers: { ...owner, Origin: "https://dispo.test", "Content-Type": "application/json" }, body: JSON.stringify({ id: randomUUID(), name: "Teste da hospedagem", email, permissions: ["dashboard"], active: true }) });
  assert.equal(created.status, 201);
  await db.prepare("DELETE FROM email_rate_limits").run();
  const codePath = "/api/auth/email-otp/send-verification-otp";
  const body = { email, type: "sign-in", requestId: randomUUID() };
  assert.equal((await post(codePath, body, { Origin: "https://other.test" })).status, 403);
  assert.equal((await post(codePath, body, { Origin: "https://dispo.test" })).status, 403);
  assert.equal((await post(codePath, body, { Origin: origin === "https://fleetops.test" ? "https://fleetops.dev.br" : "https://fleetops.test" })).status, 403, "another allowed gateway domain cannot submit for this origin");
  const sent = await post(codePath, body); assert.equal(sent.status, 202);
  const message = mailHarness.messages.findLast(item => item.to.includes(email)); assert.ok(message);
  assert.ok(message.text.includes(origin + "/login#"));
  const otp = message.text.match(/Código de acesso: (\d{6})/)[1];
  const signed = await post("/api/auth/sign-in/email-otp", { email, otp, rememberMe: true });
  assert.equal(signed.status, 200);
  const cookies = signed.headers.getSetCookie();
  const session = cookies.find(item => /fleetops\.session_token=/.test(item));
  assert.match(session, /HttpOnly/i); assert.match(session, /Secure/i); assert.match(session, /Max-Age=2592000/i);
  assert.ok(!/Domain=/i.test(session));
  const cookie = cookies.filter(item => !/Max-Age=0(?:;|$)/i.test(item)).map(item => item.split(";")[0]).join("; ");
  const access = await forwarded("/api/gestao/acesso", { headers: { Cookie: cookie } }); assert.equal(access.status, 200);
  assert.equal((await forwarded("/api/gestao/links", { headers: { Cookie: cookie } })).status, 403, "original tab permissions still apply");
  const dashboard = await forwarded("/", { headers: { Cookie: cookie } }); assert.equal(dashboard.status, 200); assert.match(await dashboard.text(), /Navegação principal/);
  const carrier = origin === "https://fleetops.test" ? "ado" : "alc";
  const otherCarrier = carrier === "ado" ? "alc" : "ado";
  const availability = { carrier, date: futureDate, cycle: "AM", utilitarios: 1, vans: 0, vucs: 0, outros: 0, contact: "Teste isolado da hospedagem", notes: "", revision: null, noVehicles: false };
  const authorization = "Bearer " + token(carrier);
  assert.equal((await post("/api/disponibilidade", availability, { Authorization: authorization, Origin: "https://other.test" })).status, 403);
  assert.equal((await post("/api/disponibilidade", availability, { Authorization: "Bearer " + token(otherCarrier) })).status, 403);
  assert.equal((await post("/api/disponibilidade", availability, { Authorization: authorization })).status, 200);
  const saved = await request(`/api/disponibilidade?transportadora=${carrier}&data=${futureDate}&ciclo=AM`, { headers: { Authorization: authorization } });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).response.contact, availability.contact);
  const original = await request("/"); assert.equal(original.status, 200); assert.equal(original.headers.get("X-FleetOps-Entry"), null);
  const signedOut = await post("/api/auth/sign-out", {}, { Cookie: cookie });
  assert.equal(signedOut.status, 200); assert.equal((await signedOut.json()).nextPath, "/login");
  assert.equal((await forwarded("/api/gestao/acesso", { headers: { Cookie: cookie } })).status, 403);
  console.log("PASS: entrada alternativa com login, cookie seguro, e-mail no domínio correto, permissões por aba, identidade nativa rejeitada, mesma base de disponibilidade, isolamento entre transportadoras e saída da sessão; origem original preservada.");
}
