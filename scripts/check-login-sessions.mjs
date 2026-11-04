import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function checkLoginSessions({ request, owner, db, mailHarness }) {
  const endpoint = "/api/auth/email-otp/send-verification-otp"; const verify = "/api/auth/sign-in/email-otp";
  let ip = 150;
  const post = (path, data, extra = {}) => request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://dispo.test", "cf-connecting-ip": `192.0.2.${ip}`, ...extra }, body: JSON.stringify(data) });
  const email = "remember@fleetops.test";
  const created = await post("/api/gestao/usuarios", { id: randomUUID(), name: "Teste de sessão", email, permissions: ["dashboard"], active: true }, owner); assert.equal(created.status, 201);
  const getOTP = () => mailHarness.messages.findLast(message => message.to.includes(email)).text.match(/Código de acesso: (\d{6})/)[1];
  const newCode = () => post(endpoint, { email, type: "sign-in", requestId: randomUUID() });
  const jar = (response, previous = {}) => {
    const values = new Map(Object.entries(previous));
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const index = pair.indexOf("="); if (/max-age=0(?:;|$)/i.test(cookie)) values.delete(pair.slice(0,index)); else values.set(pair.slice(0,index),pair.slice(index+1)); }
    return Object.fromEntries(values);
  };
  const headersFor = cookies => ({ Cookie: Object.entries(cookies).map(([name,value]) => name + "=" + value).join("; ") });
  const remembered = await post(verify, { email, otp: getOTP(), rememberMe: true }); assert.equal(remembered.status, 200);
  const sessionCookie = remembered.headers.getSetCookie().find(value => /fleetops\.session_token=/.test(value)); assert.match(sessionCookie,/Max-Age=2592000/i); assert.match(sessionCookie,/HttpOnly/i); assert.match(sessionCookie,/Secure/i);
  const rememberedJar = jar(remembered);
  const rememberedHeaders = headersFor(rememberedJar);
  assert.equal((await request("/api/gestao/acesso", {headers:rememberedHeaders})).status,200);
  const storedSession = await db.prepare("SELECT expires_at FROM email_auth_sessions ORDER BY created_at DESC LIMIT 1").first(); assert.ok(storedSession.expires_at > Date.now() + 29 * 86400000);
  // A remembered session also authorizes a fresh page request without a code.
  const page = await request("/", {headers:rememberedHeaders}); assert.equal(page.status,200); assert.match(await page.text(),/Navegação principal/);
  await db.prepare("DELETE FROM email_rate_limits").run(); ip++;
  assert.equal((await newCode()).status, 202); const first = getOTP(); const before = mailHarness.messages.length;
  const limited = await newCode(); assert.equal(limited.status, 429); const blockedBody = await limited.json(); assert.ok(blockedBody.retryAfter > 0 && blockedBody.retryAfter <= 50); assert.ok(Number(limited.headers.get("Retry-After")) <= 50); assert.equal(mailHarness.messages.length,before);
  // Move the isolated clock window to its boundary without a real 50-second wait.
  await db.prepare("UPDATE email_rate_limits SET resets_at=? WHERE count < 100").bind(Date.now()-1).run();
  const acceptedAgain = await newCode(); assert.equal(acceptedAgain.status,202); assert.equal((await acceptedAgain.json()).retryAfter,50); const second = getOTP(); assert.notEqual(first,second);
  assert.equal((await post(verify,{email,otp:first,rememberMe:false})).status,400);
  const temporary = await post(verify,{email,otp:second,rememberMe:false},rememberedHeaders); assert.equal(temporary.status,200);
  const temporaryCookie = temporary.headers.getSetCookie().find(value => /fleetops\.session_token=/.test(value)); assert.ok(!/Max-Age=|Expires=/i.test(temporaryCookie)); assert.match(temporaryCookie,/HttpOnly/i);
  assert.ok(temporary.headers.getSetCookie().some(value => /dont_remember=/.test(value) && !/Max-Age=0/i.test(value)));
  const temporaryJar = jar(temporary, rememberedJar); const tempHeaders = headersFor(temporaryJar);
  const temporaryRecord = await db.prepare("SELECT expires_at FROM email_auth_sessions ORDER BY created_at DESC LIMIT 1").first(); assert.ok(temporaryRecord.expires_at <= Date.now()+86400000); assert.ok(temporaryRecord.expires_at > Date.now()+23*3600000);
  assert.equal((await request("/api/gestao/acesso", {headers:tempHeaders})).status,200);
  await db.prepare("DELETE FROM email_rate_limits").run(); ip++;
  assert.equal((await newCode()).status,202);
  const upgraded = await post(verify,{email,otp:getOTP(),rememberMe:true},tempHeaders); assert.equal(upgraded.status,200);
  assert.match(upgraded.headers.getSetCookie().find(value => /fleetops\.session_token=/.test(value)),/Max-Age=2592000/i);
  assert.ok(upgraded.headers.getSetCookie().some(value => /dont_remember=/.test(value) && /Max-Age=0/i.test(value)));
  assert.equal((await post("/api/auth/sign-out",{},headersFor(jar(upgraded,temporaryJar)))).status,200);
  const unknown = await post(endpoint,{email:"not-in-list@fleetops.test",type:"sign-in",requestId:randomUUID()}); assert.equal(unknown.status,403); assert.match((await unknown.json()).error,/não está cadastrado/);
  const [row] = (await db.prepare("SELECT id,revision FROM manager_users WHERE email=?").bind(email).all()).results;
  await db.prepare("UPDATE manager_users SET active=0 WHERE id=?").bind(row.id).run();
  assert.equal((await newCode()).status,403); assert.equal((await request("/api/gestao/acesso",{headers:rememberedHeaders})).status,403);
  for(const path of ["/qa-login-session", "/qa-login-session-api"]) assert.equal((await request(path)).status,404);
  console.log("PASS: Manter conectado por 30 dias; sessão temporária sem persistência; mudança de preferência e logout; bloqueio imediato; reenvio após 50s com código diferente e anterior inválido; erro de e-mail sem acesso.");
}
