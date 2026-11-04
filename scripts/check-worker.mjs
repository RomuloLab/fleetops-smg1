import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { CYCLE, CYCLES, operationDate, selectCycleForDate } from "../lib/model.ts";
import { AMBULANCE_RELEASERS } from "../config/ambulance-releasers.ts";
import { calendarFixtures } from "./calendarization-fixtures.mjs";
import { checkMultiPlates } from "./check-multi-plates.mjs";
import { checkLoginSessions } from "./check-login-sessions.mjs";
import { checkEmailAccess } from "./check-email-access.mjs";
import { checkManagerAccess } from "./check-manager-access.mjs";
import { carrierNoticeContent, schedulingNotice } from "../lib/scheduling-alert-content.ts";
import { checkStela, checkStelaAI } from "./check-stela.mjs";
import { checkGatewayIntegration } from "./check-gateway-integration.mjs";
import { checkStelaSpeech } from "./check-stela-speech.mjs";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wranglerRequire("miniflare");
const secret = "isolated-integration-test-only";
const mailHarness = { messages: [], status: 200, malformed: false };
const stelaHarness = { requests: [], unavailable: false };
const elevenHarness={requests:[],catalogReads:0,catalogFailure:null,status:200,contentType:"audio/mpeg"};
let calendarFixture = null; let calendarUnavailable = false; const calendarReads = [];
const files = (await readdir("dist/server", { recursive: true })).filter(file => /\.m?js$/.test(file) && file !== "index.js");
const workerOptions = {
  modulesRoot: path.resolve("dist/server"),
  modules: ["index.js", ...files].map(file => ({ type: "ESModule", path: path.resolve("dist/server", file) })),
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  bindings: { LINK_SECRET: secret, OWNER_EMAIL: "owner@dispo.test", BETTER_AUTH_SECRET: "isolated-auth-secret-at-least-thirty-two-bytes-2026", AUTH_BASE_URL: "https://dispo.test", FLEETOPS_GATEWAY_TOKEN: "isolated-gateway-token-at-least-48-characters-0123456789abcdef", FLEETOPS_GATEWAY_ORIGINS: "https://fleetops.test,https://fleetops.dev.br", FLEETOPS_CLOUDFLARE_GATEWAY_TOKEN: "isolated-cloudflare-gateway-token-at-least-48-characters-0123456789", FLEETOPS_CLOUDFLARE_GATEWAY_ORIGIN: "https://fleetops.example.workers.dev" }, d1Databases: ["DB"], r2Buckets: ["BUCKET"],
  assets: { directory: path.resolve("dist/client"), routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } }, cf: false,
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.hostname === "api.resend.com" && url.pathname === "/emails") {
      assert.equal(request.method, "POST"); assert.equal(request.headers.get("authorization"), "Bearer re_isolated_test_key_20261025");
      const message = await request.json(); mailHarness.messages.push({ ...message, idempotencyKey: request.headers.get("idempotency-key") });
      return Response.json(mailHarness.malformed ? {} : { id: "mail-" + mailHarness.messages.length }, { status: mailHarness.status });
    }
    if(url.hostname==="api.openai.com" && url.pathname==="/v1/responses") {
      assert.equal(request.headers.get("authorization"),"Bearer isolated-stela-provider-key");const body=await request.json();stelaHarness.requests.push(body);
      if(stelaHarness.unavailable)return Response.json({error:{message:"Simulated provider failure",type:"server_error",code:"server_error"}},{status:503});
      return Response.json({id:"resp_stela_test",object:"response",created_at:1792972800,model:"gpt-5.4-mini",status:"completed",output:[{id:"msg_stela_test",type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:"Resposta simulada da Stela com contexto autorizado.",annotations:[]}]}],usage:{input_tokens:50,output_tokens:10,total_tokens:60,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}});
    }
    if(url.hostname==="api.elevenlabs.io"){
      assert.equal(request.headers.get("xi-api-key"),"sk_isolated_elevenlabs_test_0123456789abcdef");
      if(url.pathname==="/v2/voices"){
        elevenHarness.catalogReads++;assert.equal(request.method,"GET");
        if(elevenHarness.catalogFailure)return Response.json(elevenHarness.catalogFailure.body,{status:elevenHarness.catalogFailure.status});
        return Response.json({voices:[{voice_id:"en_voice_isolated_01",name:"English — test",labels:{language:"en"}},{voice_id:"pt_voice_isolated_01",name:"Stela brasileira — teste",labels:{language:"pt",gender:"female"},verified_languages:[{language:"pt",locale:"pt-BR",accent:"brasileiro"}],samples:[{private:"private-provider-data"}]}]});
      }
      if(url.pathname==="/v1/text-to-speech/pt_voice_isolated_01"){
        assert.equal(request.method,"POST");const body=await request.json();elevenHarness.requests.push(body);
        if(elevenHarness.status!==200)return Response.json({detail:"private-provider-data"},{status:elevenHarness.status});
        return new Response(new Uint8Array([73,68,51,0,0,0,0,0,0,0]),{headers:{"Content-Type":elevenHarness.contentType}});
      }
      return Response.json({error:"Unexpected voice request"},{status:404});
    }
    if (url.hostname !== "docs.google.com" || !calendarFixture || calendarUnavailable) return new Response("Source unavailable", { status: 503 });
    const query = url.searchParams.get("tq"); calendarReads.push(query);
    if (url.searchParams.get("gid") === "801104757" && query === "select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S where E = 'SMG1'") return new Response(calendarFixture.ff, { headers: { "Content-Type": "text/csv" } });
    if (url.searchParams.get("gid") === "1533539391" && query === "select A,B,C,D,E,F,G,H,I,J,K,L,M,N where B = 'SMG1'") return new Response(calendarFixture.sdd, { headers: { "Content-Type": "text/csv" } });
    return new Response("Unexpected source query", { status: 400 });
  },
};
const mf = new Miniflare(workerOptions);
const owner = { "oai-authenticated-user-id": "test-owner", "oai-authenticated-user-email": "owner@dispo.test" };
const token = slug => createHmac("sha256", secret).update("dispo-carrier-v1:" + slug).digest("hex");
async function request(url, options) { return mf.dispatchFetch("https://dispo.test" + url, options); }
const today = operationDate();
const calendarAnchor = new Date(today + "T12:00:00Z");
const plusDays = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const monday = plusDays(today, (1 - calendarAnchor.getUTCDay() + 7) % 7 + 7);
const tuesday = plusDays(monday, 1);
const sunday = plusDays(monday, -1);
const nextSunday = plusDays(sunday, 7);
const payload = { carrier: "ado", date: monday, cycle: "CPM(CHP)", utilitarios: 5, vans: 3, vucs: 1, outros: 0, contact: "Teste isolado", notes: "", revision: null, noVehicles: false };
async function submit(data, slug = "ado", origin = "https://dispo.test") {
  return request("/api/disponibilidade", { method: "POST", headers: { Authorization: "Bearer " + token(slug), "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) });
}
try {
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("drizzle")).filter(name => name.endsWith(".sql")).sort()) {
    const migration = await readFile("drizzle/" + name, "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await checkManagerAccess({ request, owner, db, today, cycle: selectCycleForDate(today), mailHarness });
  await checkEmailAccess({ request, owner, db, mailHarness });
  await checkLoginSessions({ request, owner, db, mailHarness });
  assert.equal((await request(`/api/gestao?data=${monday}`)).status, 403);
  assert.equal((await request("/api/gestao/links")).status, 403);
  assert.equal((await request(`/api/gestao?data=${monday}`, { headers: { ...owner, "oai-authenticated-user-email": "another@dispo.test" } })).status, 403);
  const admin = await request(`/api/gestao?data=${monday}`, { headers: owner });
  assert.equal(admin.status, 200); assert.equal((await admin.json()).responses.length, 0);
  // A newly opened portal uses today's civil date in Brasília, not the
  // original 26/10 launch date (which prematurely selected W44).
  for (const [page, headers] of [["/", owner], ["/t/alc", undefined]]) {
    const html = await (await request(page, { headers })).text();
    assert.ok(html.includes(`value="${today}"`), `${page} must start on ${today}`);
    assert.ok(html.includes(`value="${selectCycleForDate(today)}" selected`), `${page} must start on a valid cycle`);
  }
  const links = await (await request("/api/gestao/links", { headers: owner })).json();
  assert.equal(links.links.length, 14); assert.equal(new Set(links.links.map(l => l.path)).size, 14);
  assert.equal((await request(`/api/disponibilidade?transportadora=alc&data=${monday}`, { headers: { Authorization: "Bearer " + token("ado") } })).status, 403);
  assert.equal((await submit(payload, "alc")).status, 403);
  assert.equal((await submit(payload, "ado", "https://other.test")).status, 403);
  assert.equal((await submit({ ...payload, vans: -1 })).status, 400);
  assert.equal((await submit({ ...payload, date: "2026-02-30" })).status, 400);
  const first = await submit(payload); assert.equal(first.status, 200);
  const firstBody = await first.json();
  const created = firstBody.response; assert.equal(created.revision, 1);
  assert.equal(firstBody.window.editable, true);
  assert.ok(Date.parse(firstBody.window.serverNow) < Date.parse(firstBody.window.closesAt));
  assert.equal((await submit(payload)).status, 409);
  const update = await submit({ ...payload, vans: 4, revision: 1 }); assert.equal(update.status, 200);
  assert.equal((await update.json()).response.revision, 2);
  assert.equal((await submit({ ...payload, revision: 1 })).status, 409);
  const zero = { ...payload, utilitarios: 0, vans: 0, vucs: 0, revision: 2 };
  assert.equal((await submit(zero)).status, 400);
  assert.equal((await submit({ ...zero, noVehicles: true })).status, 200);
  assert.equal((await submit({ ...payload, date: tuesday })).status, 200);
  const rows = await (await request(`/api/gestao?data=${monday}`, { headers: owner })).json();
  assert.equal(rows.responses.length, 1); assert.equal(rows.responses[0].revision, 3); assert.equal(rows.responses[0].vans, 0);
  const count = await db.prepare("SELECT COUNT(*) AS n FROM availability").first(); assert.equal(count.n, 2);
  for (const [index, cycle] of CYCLES.entries()) {
    if (cycle !== CYCLE) assert.equal((await submit({ ...payload, cycle, utilitarios: 10 + index })).status, 200);
    const query = `data=${monday}&ciclo=${encodeURIComponent(cycle)}`;
    const carrierResponse = await request(`/api/disponibilidade?transportadora=ado&${query}`, { headers: { Authorization: "Bearer " + token("ado") } });
    assert.equal(carrierResponse.status, 200);
    const saved = (await carrierResponse.json()).response;
    assert.equal(saved.cycle, cycle); assert.equal(saved.utilitarios, cycle === CYCLE ? 0 : 10 + index);
    const dashboard = await (await request(`/api/gestao?${query}`, { headers: owner })).json();
    assert.equal(dashboard.responses.length, 1); assert.equal(dashboard.responses[0].cycle, cycle);
  }
  assert.equal((await submit({ ...payload, cycle: "AM", vans: 17, revision: 1 })).status, 200);
  assert.equal((await submit({ ...payload, cycle: "PM", revision: 2 })).status, 409);
  const unchangedCpm = await (await request(`/api/gestao?data=${monday}`, { headers: owner })).json();
  assert.equal(unchangedCpm.responses[0].revision, 3); assert.equal(unchangedCpm.responses[0].vans, 0);
  for (const cycle of CYCLES) {
    const sundayData = { ...payload, date: sunday, cycle };
    const allowed = ["AM", "SD", "SDE"].includes(cycle);
    const result = await submit(sundayData); assert.equal(result.status, allowed ? 200 : 400);
    if (!allowed) assert.match((await result.json()).error, /Aos domingos/);
    const query = `data=${sunday}&ciclo=${encodeURIComponent(cycle)}`;
    assert.equal((await request(`/api/disponibilidade?transportadora=ado&${query}`, { headers: { Authorization: "Bearer " + token("ado") } })).status, allowed ? 200 : 400);
    assert.equal((await request(`/api/gestao?${query}`, { headers: owner })).status, allowed ? 200 : 400);
  }
  assert.equal((await submit({ ...payload, date: nextSunday, cycle: "PM", noVehicles: true, utilitarios: 0, vans: 0, vucs: 0 })).status, 400);
  assert.equal((await request(`/api/gestao?data=${monday}&ciclo=INVALID`, { headers: owner })).status, 400);
  const sundayDefault = await (await request(`/api/gestao?data=${sunday}`, { headers: owner })).json();
  assert.equal(sundayDefault.responses.length, 1); assert.equal(sundayDefault.responses[0].cycle, "AM");
  const sundayCount = await db.prepare(`SELECT COUNT(*) AS n FROM availability WHERE date='${sunday}'`).first(); assert.equal(sundayCount.n, 3);
  const historicalDate = "2020-01-06";
  for (const cycle of CYCLES) {
    const closedWrite = await submit({ ...payload, date: historicalDate, cycle, serverNow: "2019-01-01T00:00:00Z", editable: true });
    assert.equal(closedWrite.status, 403);
    const body = await closedWrite.json();
    assert.equal(body.code, "DATE_CLOSED"); assert.equal(body.window.editable, false);
    assert.match(body.error, /somente para consulta/);
  }
  await db.prepare("INSERT INTO availability (id,carrier,date,cycle,utilitarios,vans,vucs,outros,contact,notes,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("historical-test", "ado", historicalDate, CYCLE, 4, 2, 1, 0, "Responsável histórico", "Registro preservado", 1, "2020-01-06T15:00:00Z", "2020-01-06T15:00:00Z").run();
  const blockedUpdate = await submit({ ...payload, date: historicalDate, revision: 1, utilitarios: 999 });
  assert.equal(blockedUpdate.status, 403); assert.equal((await blockedUpdate.json()).code, "DATE_CLOSED");
  const historicalRead = await request(`/api/disponibilidade?transportadora=ado&data=${historicalDate}`, { headers: { Authorization: "Bearer " + token("ado") } });
  assert.equal(historicalRead.status, 200);
  const historical = await historicalRead.json();
  assert.equal(historical.window.editable, false); assert.equal(historical.response.utilitarios, 4);
  assert.equal(historical.response.revision, 1); assert.equal(historical.response.notes, "Registro preservado");
  const historicalDashboard = await request(`/api/gestao?data=${historicalDate}`, { headers: owner });
  assert.equal(historicalDashboard.status, 200);
  const historicalPanel = await historicalDashboard.json();
  assert.equal(historicalPanel.window.editable, false); assert.equal(historicalPanel.responses.length, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM availability WHERE date=?").bind(historicalDate).first()).n, 1);
  const currentCycle = selectCycleForDate(today);
  const currentWrite = await submit({ ...payload, carrier: "spot", date: today, cycle: currentCycle }, "spot");
  assert.equal(currentWrite.status, 200); assert.equal((await currentWrite.json()).window.editable, true);
  async function schedule(data, slug = "ado") {
    return request("/api/scheduling", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token(slug), Origin: "https://dispo.test" }, body: JSON.stringify(data) });
  }
  const schedulingQuery = `transportadora=ado&data=${monday}&ciclo=${encodeURIComponent(CYCLE)}`;
  assert.equal((await request("/api/scheduling?" + schedulingQuery)).status, 403);
  assert.equal((await request(`/api/gestao/scheduling?data=${monday}`)).status, 403);
  assert.equal((await request("/api/gestao/scheduling/events")).status, 403);
  assert.equal((await request("/api/gestao/scheduling/events?after=0", { headers: { ...owner, "oai-authenticated-user-email": "another@dispo.test" } })).status, 403);
  const carrierInitial = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  assert.equal(carrierInitial.modals.length, 0); assert.equal(carrierInitial.requests.length, 0);
  const alcQuery = `transportadora=alc&data=${monday}&ciclo=${encodeURIComponent(CYCLE)}`;
  const alcCatalog = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
  const expectedAlcModals = ["Vuc Rental TKS", "Vuc SDD", "Vuc PP SDD", "HR SDD", "HR 8hs", "Vuc Dedicado com Ajudante", "Utilitario", "Utilitario SDD"];
  assert.deepEqual(alcCatalog.modals.map(modal => modal.name), expectedAlcModals);
  assert.equal(alcCatalog.window.editable, true);
  const repeatedAlcCatalog = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
  assert.deepEqual(repeatedAlcCatalog.modals, alcCatalog.modals);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM carrier_modals WHERE carrier='alc'").first()).n, 8);
  const adoAfterAlc = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  assert.equal(adoAfterAlc.modals.length, 0);
  const baseline = await (await request("/api/gestao/scheduling/events", { headers: owner })).json();
  assert.equal(baseline.cursor, 0); assert.deepEqual(baseline.events, []);
  const orderPayload = { id: randomUUID(), carrier: "ado", date: monday, cycle: CYCLE, modalId: "ado-test-modal", quantity: 2, contact: "Teste de Scheduling", notes: "Pedido de teste isolado" };
  assert.equal((await schedule(orderPayload)).status, 422);
  await db.prepare("INSERT INTO carrier_modals (id,carrier,code,name,active) VALUES (?,?,?,?,?)").bind("ado-test-modal", "ado", "TEST_ADO", "Modal de teste ADO", 1).run();
  await db.prepare("INSERT INTO carrier_modals (id,carrier,code,name,active) VALUES (?,?,?,?,?)").bind("alc-test-modal", "alc", "TEST_ALC", "Modal de teste ALC", 1).run();
  await db.prepare("INSERT INTO carrier_modals (id,carrier,code,name,active) VALUES (?,?,?,?,?)").bind("ado-inactive-modal", "ado", "TEST_OFF", "Modal inativo", 0).run();
  const configured = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  assert.equal(configured.modals.length, 1); assert.equal(configured.modals[0].id, "ado-test-modal");
  assert.equal((await request("/api/scheduling?" + schedulingQuery.replace("transportadora=ado", "transportadora=alc"), { headers: { Authorization: "Bearer " + token("ado") } })).status, 403);
  assert.equal((await schedule(orderPayload, "alc")).status, 403);
  assert.equal((await schedule({ ...orderPayload, modalId: "alc-test-modal" })).status, 422);
  assert.equal((await schedule({ ...orderPayload, modalId: "ado-inactive-modal" })).status, 422);
  assert.equal((await schedule({ ...orderPayload, quantity: 0 })).status, 400);
  assert.equal((await schedule({ ...orderPayload, quantity: 1.5 })).status, 400);
  assert.equal((await schedule({ ...orderPayload, date: sunday })).status, 400);
  const closedOrder = await schedule({ ...orderPayload, date: historicalDate, editable: true, serverNow: "2019-01-01T00:00:00Z" });
  assert.equal(closedOrder.status, 403); assert.equal((await closedOrder.json()).code, "DATE_CLOSED");
  const submittedOrder = await schedule({ ...orderPayload, status: "approved", modalName: "Nome falsificado" });
  assert.equal(submittedOrder.status, 201);
  const savedOrder = (await submittedOrder.json()).request;
  assert.equal(savedOrder.ambulance, false); assert.equal(savedOrder.ambulanceReleasedBy, "");
  assert.equal(savedOrder.modalName, "Modal de teste ADO"); assert.equal(savedOrder.status, "pending"); assert.equal(savedOrder.statusRevision, 1); assert.equal(savedOrder.resolutionNotes, "");
  const firstAlert = await (await request("/api/gestao/scheduling/events?after=0", { headers: owner })).json();
  assert.equal(firstAlert.events.length, 1); assert.equal(firstAlert.events[0].id, orderPayload.id);
  assert.equal(firstAlert.cursor, savedOrder.seq);
  const duplicate = await schedule(orderPayload); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).replay, true);
  assert.equal((await schedule({ ...orderPayload, quantity: 3 })).status, 409);
  assert.equal((await schedule({ ...orderPayload, carrier: "alc", modalId: "alc-test-modal" }, "alc")).status, 409);
  const quiet = await (await request(`/api/gestao/scheduling/events?after=${savedOrder.seq}`, { headers: owner })).json();
  assert.equal(quiet.events.length, 0); assert.equal(quiet.cursor, savedOrder.seq);
  const sundayOrder = await schedule({ ...orderPayload, id: randomUUID(), date: sunday, cycle: "AM" }); assert.equal(sundayOrder.status, 201);
  const alcOrder = await schedule({ ...orderPayload, id: randomUUID(), carrier: "alc", modalId: "alc-test-modal", cycle: "PM" }, "alc"); assert.equal(alcOrder.status, 201);
  const acrossScopes = await (await request(`/api/gestao/scheduling/events?after=${savedOrder.seq}`, { headers: owner })).json();
  assert.equal(acrossScopes.events.length, 2); assert.equal(acrossScopes.events[0].date, sunday); assert.equal(acrossScopes.events[1].carrier, "alc");
  const ownOrders = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  assert.equal(ownOrders.requests.length, 1); assert.equal(ownOrders.requests[0].carrier, "ado");
  const schedulingPanel = await (await request(`/api/gestao/scheduling?data=${monday}`, { headers: owner })).json();
  assert.equal(schedulingPanel.summary.total, 1); assert.equal(schedulingPanel.summary.quantity, 2); assert.equal(schedulingPanel.configuredCarriers, 2);
  // A burst larger than one feed page must be drained in order without loss,
  // even when all orders have exactly the same timestamp.
  const burstTime = new Date().toISOString();
  const burst = Array.from({ length: 55 }, () => db.prepare("INSERT INTO scheduling_requests (id,carrier,date,cycle,modal_id,modal_name,quantity,contact,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(randomUUID(), "ado", monday, CYCLE, "ado-test-modal", "Modal de teste ADO", 1, "Teste de lote", "", "received", burstTime));
  await db.batch(burst);
  const feedPage1 = await (await request("/api/gestao/scheduling/events?after=0", { headers: owner })).json();
  assert.equal(feedPage1.events.length, 50); assert.equal(feedPage1.hasMore, true);
  const feedPage2 = await (await request(`/api/gestao/scheduling/events?after=${feedPage1.cursor}`, { headers: owner })).json();
  assert.equal(feedPage2.events.length, 8); assert.equal(feedPage2.hasMore, false);
  const eventIds = [...feedPage1.events, ...feedPage2.events].map(order => order.id); assert.equal(new Set(eventIds).size, 58);
  const reloadedFeed = await (await request("/api/gestao/scheduling/events", { headers: owner })).json();
  assert.equal(reloadedFeed.cursor, feedPage2.cursor); assert.equal(reloadedFeed.events.length, 0);
  const pages = [];
  for (const pageNumber of [1, 2, 3]) {
    const result = await (await request(`/api/gestao/scheduling?data=${monday}&pagina=${pageNumber}`, { headers: owner })).json();
    assert.equal(result.summary.total, 56); assert.equal(result.summary.quantity, 57); pages.push(...result.requests);
  }
  assert.equal(pages.length, 56); assert.equal(new Set(pages.map(order => order.id)).size, 56);
  assert.equal((await request(`/api/gestao/scheduling?data=${monday}&pagina=0`, { headers: owner })).status, 400);
  assert.equal((await request("/api/gestao/scheduling/events?after=invalid", { headers: owner })).status, 400);
  const beforeAlcOrders = await (await request("/api/gestao/scheduling/events", { headers: owner })).json();
  for (const modal of alcCatalog.modals) {
    const result = await schedule({ ...orderPayload, id: randomUUID(), carrier: "alc", modalId: modal.id }, "alc");
    assert.equal(result.status, 201);
    const created = (await result.json()).request;
    assert.equal(created.carrier, "alc"); assert.equal(created.modalName, modal.name);
    assert.equal((await schedule({ ...orderPayload, id: randomUUID(), modalId: modal.id }, "ado")).status, 422);
  }
  const alcAlerts = await (await request(`/api/gestao/scheduling/events?after=${beforeAlcOrders.cursor}`, { headers: owner })).json();
  assert.equal(alcAlerts.events.length, 8);
  assert.deepEqual(alcAlerts.events.map(order => order.modalName), expectedAlcModals);
  const alcClosed = await schedule({ ...orderPayload, id: randomUUID(), carrier: "alc", date: historicalDate, modalId: alcCatalog.modals[0].id }, "alc");
  assert.equal(alcClosed.status, 403); assert.equal((await alcClosed.json()).code, "DATE_CLOSED");
  const page = await request("/", { headers: owner }); assert.equal(page.status, 200);
  const pageHtml = await page.text(); assert.ok(pageHtml.includes("Disponibilidade de veículos")); assert.ok(pageHtml.includes("Scheduling"));
  async function resolveOrder(data, headers = owner, origin = "https://dispo.test") {
    return request("/api/gestao/scheduling", { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) });
  }
  async function carrierEvents(slug, after) {
    return request(`/api/scheduling/events?transportadora=${slug}` + (after === undefined ? "" : `&after=${after}`), { headers: { Authorization: "Bearer " + token(slug) } });
  }
  const decision = { id: savedOrder.id, changeId: randomUUID(), revision: 1, status: "not_done", resolutionNotes: "  Sem veículo disponível no horário solicitado.  " };
  assert.equal((await resolveOrder(decision, {})).status, 403);
  assert.equal((await resolveOrder(decision, { Authorization: "Bearer " + token("ado") })).status, 403);
  assert.equal((await resolveOrder(decision, { ...owner, "oai-authenticated-user-email": "another@dispo.test" })).status, 403);
  assert.equal((await resolveOrder(decision, owner, "https://other.test")).status, 403);
  assert.equal((await resolveOrder({ ...decision, resolutionNotes: "   " })).status, 400);
  assert.equal((await resolveOrder({ ...decision, resolutionNotes: "x".repeat(1001) })).status, 400);
  assert.equal((await resolveOrder({ ...decision, status: "approved" })).status, 400);
  assert.equal((await resolveOrder({ ...decision, id: randomUUID() })).status, 404);
  assert.equal((await request("/api/scheduling/events?transportadora=ado")).status, 403);
  assert.equal((await request("/api/scheduling/events?transportadora=alc&after=0", { headers: { Authorization: "Bearer " + token("ado") } })).status, 403);
  assert.equal((await carrierEvents("ado", "invalid")).status, 400);
  const carrierBaseline = await (await carrierEvents("ado")).json();
  assert.equal(carrierBaseline.cursor, 0); assert.deepEqual(carrierBaseline.events, []);
  const declined = await resolveOrder(decision); assert.equal(declined.status, 200);
  const notDone = (await declined.json()).request;
  assert.equal(notDone.status, "not_done"); assert.equal(notDone.resolutionNotes, decision.resolutionNotes.trim());
  assert.equal(notDone.statusRevision, 2); assert.ok(notDone.statusUpdatedAt);
  const ownerOrderCount = await (await request(`/api/gestao/scheduling?data=${monday}`, { headers: owner })).json();
  const lastOrderPage = Math.ceil(ownerOrderCount.summary.total / ownerOrderCount.pageSize);
  const ownerNotDone = await (await request(`/api/gestao/scheduling?data=${monday}&pagina=${lastOrderPage}`, { headers: owner })).json();
  const ownerRecord = ownerNotDone.requests.find(row => row.id === savedOrder.id);
  assert.equal(ownerRecord.status, "not_done"); assert.equal(ownerRecord.resolutionNotes, notDone.resolutionNotes);
  const carrierNotDone = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  const carrierRecord = carrierNotDone.requests.find(row => row.id === savedOrder.id);
  assert.equal(carrierRecord.status, "not_done"); assert.equal(carrierRecord.resolutionNotes, notDone.resolutionNotes);
  assert.equal(carrierRecord.notes, orderPayload.notes);
  const declinedEvents = await (await carrierEvents("ado", 0)).json();
  assert.equal(declinedEvents.events.length, 1); assert.equal(declinedEvents.events[0].status, "not_done");
  assert.equal(declinedEvents.events[0].resolutionNotes, notDone.resolutionNotes);
  const declinedAlert = schedulingNotice(declinedEvents.events, true); assert.ok(declinedAlert);
  assert.equal(carrierNoticeContent(declinedAlert).outcome, "PEDIDO NÃO FOI FEITO.");
  assert.equal(carrierNoticeContent(declinedAlert).reason, decision.resolutionNotes.trim());
  assert.equal((await request("/qa-scheduling-alerts")).status, 404);
  assert.equal((await (await carrierEvents("alc", 0)).json()).events.length, 0);
  assert.equal((await resolveOrder(decision)).status, 200); // same attempt, no duplicate event
  assert.equal((await resolveOrder({ ...decision, resolutionNotes: "Outro motivo" })).status, 409);
  assert.equal((await resolveOrder({ ...decision, changeId: randomUUID(), status: "done" })).status, 409);
  assert.equal((await (await carrierEvents("ado", declinedEvents.cursor)).json()).events.length, 0);
  const complete = { ...decision, changeId: randomUUID(), revision: 2, status: "done", resolutionNotes: "" };
  const completed = await resolveOrder(complete); assert.equal(completed.status, 200);
  const done = (await completed.json()).request;
  assert.equal(done.status, "done"); assert.equal(done.statusRevision, 3); assert.equal(done.resolutionNotes, "");
  const completedEvents = await (await carrierEvents("ado", declinedEvents.cursor)).json();
  assert.equal(completedEvents.events.length, 1); assert.equal(completedEvents.events[0].status, "done");
  assert.equal(completedEvents.events[0].id, savedOrder.id); assert.equal(completedEvents.events[0].carrier, "ado");
  assert.equal(completedEvents.events[0].date, monday); assert.equal(completedEvents.events[0].modalName, savedOrder.modalName);
  assert.equal((await resolveOrder(complete)).status, 200);
  assert.equal((await resolveOrder({ ...complete, revision: 3, changeId: randomUUID() })).status, 200); // no-op
  assert.equal((await (await carrierEvents("ado", completedEvents.cursor)).json()).events.length, 0);
  const persistedReason = await db.prepare("SELECT resolution_notes FROM scheduling_status_events WHERE request_id=? AND status='not_done'").bind(savedOrder.id).first();
  assert.equal(persistedReason.resolution_notes, notDone.resolutionNotes);
  const afterReload = await (await carrierEvents("ado")).json();
  assert.equal(afterReload.cursor, completedEvents.cursor); assert.deepEqual(afterReload.events, []);
  const completedCarrier = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  assert.equal(completedCarrier.requests.find(row => row.id === savedOrder.id).status, "done");
  // Received records from earlier releases remain pending without a destructive backfill.
  const legacy = completedCarrier.requests.find(row => row.status === "pending"); assert.ok(legacy);
  const race = { id: legacy.id, revision: legacy.statusRevision, status: "done", resolutionNotes: "" };
  const contenders = await Promise.all([resolveOrder({ ...race, changeId: randomUUID() }), resolveOrder({ ...race, changeId: randomUUID(), status: "not_done", resolutionNotes: "Motivo concorrente" })]);
  assert.deepEqual(contenders.map(row => row.status).sort(), [200, 409]);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM scheduling_status_events WHERE request_id=?").bind(legacy.id).first()).n, 1);
  // Reusing another order's change id cannot commit a status without its event.
  const untouched = completedCarrier.requests.find(row => row.id !== legacy.id && row.status === "pending");
  assert.equal((await resolveOrder({ ...race, id: untouched.id, changeId: complete.changeId })).status, 409);
  const unchanged = await db.prepare("SELECT status_revision FROM scheduling_requests WHERE id=?").bind(untouched.id).first();
  assert.equal(unchanged.status_revision, 1);
  // An ALC completion is visible only in ALC's feed, across operation dates/cycles.
  const alcOwn = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
  const alcDone = await resolveOrder({ id: alcOwn.requests[0].id, changeId: randomUUID(), revision: 1, status: "done", resolutionNotes: "" }); assert.equal(alcDone.status, 200);
  const alcStatusEvents = await (await carrierEvents("alc", 0)).json(); assert.equal(alcStatusEvents.events.length, 1); assert.equal(alcStatusEvents.events[0].status, "done");
  assert.ok((await (await carrierEvents("ado", 0)).json()).events.every(event => event.carrier === "ado"));
  // Status changes never create another new-order notification for the manager.
  assert.equal((await (await request(`/api/gestao/scheduling/events?after=${alcAlerts.cursor}`, { headers: owner })).json()).events.length, 0);
  const statusBurst = Array.from({ length: 55 }, (_, i) => db.prepare("INSERT INTO scheduling_status_events (change_id,request_id,carrier,date,cycle,modal_name,quantity,status,resolution_notes,revision,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(randomUUID(), savedOrder.id, "ado", monday, CYCLE, savedOrder.modalName, 2, "done", "", 100 + i, burstTime));
  await db.batch(statusBurst);
  const statusPage1 = await (await carrierEvents("ado", completedEvents.cursor)).json();
  assert.equal(statusPage1.events.length, 50); assert.equal(statusPage1.hasMore, true);
  const statusPage2 = await (await carrierEvents("ado", statusPage1.cursor)).json();
  assert.equal(statusPage2.events.length, 6); assert.equal(statusPage2.hasMore, false);
  assert.equal(new Set([...statusPage1.events, ...statusPage2.events].map(event => event.changeId)).size, 56);
  const beforeAmbulances = await (await request("/api/gestao/scheduling/events", { headers: owner })).json();
  const ambulancePayload = { ...orderPayload, id: randomUUID(), carrier: "alc", modalId: alcCatalog.modals[0].id, ambulance: true, ambulanceReleasedBy: "" };
  const missingRelease = await schedule(ambulancePayload, "alc"); assert.equal(missingRelease.status, 400); assert.match((await missingRelease.json()).error, /quem liberou/);
  assert.equal((await schedule({ ...ambulancePayload, ambulanceReleasedBy: "Nome fora da lista" }, "alc")).status, 400);
  assert.equal((await schedule({ ...ambulancePayload, ambulance: "true", ambulanceReleasedBy: "Romulo" }, "alc")).status, 400);
  assert.equal((await schedule({ ...ambulancePayload, ambulanceReleasedBy: "Romulo" }, "ado")).status, 403);
  const ambulances=[];
  for(const name of AMBULANCE_RELEASERS){
    const payload={...ambulancePayload,id:randomUUID(),ambulanceReleasedBy:name};
    const result=await schedule(payload,"alc");assert.equal(result.status,201);
    const row=(await result.json()).request;
    assert.equal(row.ambulance,true);assert.equal(row.ambulanceReleasedBy,name);assert.equal(row.status,"pending");
    ambulances.push({payload,row});
  }
  const repeatedAmbulance=await schedule(ambulances[0].payload,"alc");assert.equal(repeatedAmbulance.status,200);assert.equal((await repeatedAmbulance.json()).replay,true);
  assert.equal((await schedule({...ambulances[0].payload,ambulanceReleasedBy:"Charles"},"alc")).status,409);
  assert.equal((await schedule({...ambulances[0].payload,ambulance:false},"alc")).status,409);
  const unmarked=await schedule({...ambulancePayload,id:randomUUID(),ambulance:false,ambulanceReleasedBy:"Romulo"},"alc");assert.equal(unmarked.status,201);
  const unmarkedRow=(await unmarked.json()).request;assert.equal(unmarkedRow.ambulance,false);assert.equal(unmarkedRow.ambulanceReleasedBy,"");
  const ambulanceFeed=await(await request(`/api/gestao/scheduling/events?after=${beforeAmbulances.cursor}`,{headers:owner})).json();
  assert.equal(ambulanceFeed.events.length,17);assert.deepEqual(ambulanceFeed.events.slice(0,16).map(row=>row.ambulanceReleasedBy),[...AMBULANCE_RELEASERS]);
  assert.ok(ambulanceFeed.events.slice(0,16).every(row=>row.ambulance===true));
  const ambulanceOwner=await(await request(`/api/gestao/scheduling?data=${monday}`,{headers:owner})).json();
  const ambulanceCarrier=await(await request("/api/scheduling?"+alcQuery,{headers:{Authorization:"Bearer "+token("alc")}})).json();
  for(const {row} of ambulances){
    assert.equal(ambulanceOwner.requests.find(order=>order.id===row.id).ambulanceReleasedBy,row.ambulanceReleasedBy);
    assert.equal(ambulanceCarrier.requests.find(order=>order.id===row.id).ambulanceReleasedBy,row.ambulanceReleasedBy);
  }
  const persistedAmbulance=await db.prepare("SELECT ambulance,ambulance_released_by FROM scheduling_requests WHERE id=?").bind(ambulances[9].row.id).first();
  assert.equal(persistedAmbulance.ambulance,1);assert.equal(persistedAmbulance.ambulance_released_by,"Carlão");
  const resolvedAmbulance=await resolveOrder({id:ambulances[0].row.id,changeId:randomUUID(),revision:1,status:"not_done",resolutionNotes:"Sem disponibilidade no horário."});assert.equal(resolvedAmbulance.status,200);
  const resolvedRow=(await resolvedAmbulance.json()).request;assert.equal(resolvedRow.ambulance,true);assert.equal(resolvedRow.ambulanceReleasedBy,"Denisson");
  const pastAmbulance=await schedule({...ambulancePayload,id:randomUUID(),date:historicalDate,ambulanceReleasedBy:"Romulo"},"alc");assert.equal(pastAmbulance.status,403);assert.equal((await pastAmbulance.json()).code,"DATE_CLOSED");
  async function register(data, headers=owner, origin="https://dispo.test") {
    const form=new FormData();form.set("id",data.id);form.set("name",data.name);
    if(data.logo)form.set("logo",new Blob([data.logo],{type:data.mime||"image/png"}),data.filename||"logo.png");
    if(data.frame)form.set("logoFrame",JSON.stringify(data.frame));
    const encoded=new Request("https://dispo.test/api/gestao/transportadoras",{method:"POST",body:form});
    return request("/api/gestao/transportadoras",{method:"POST",headers:{...headers,Origin:origin,"Content-Type":encoded.headers.get("content-type")},body:await encoded.arrayBuffer()});
  }
  assert.equal((await request("/api/gestao/transportadoras")).status,403);
  const registrationList=await(await request("/api/gestao/transportadoras",{headers:owner})).json();
  assert.equal(registrationList.carriers.length,14);assert.equal(registrationList.links.length,14);
  const png=await readFile("public/logos/carriers/alc.png");
  const newProfile={id:randomUUID(),name:"Nova Transportadora",logo:png,frame:{x:66,y:61,width:424,height:432,background:"#000000"}};
  assert.equal((await register(newProfile,{})).status,403);
  assert.equal((await register(newProfile,{Authorization:"Bearer "+token("alc")})).status,403);
  assert.equal((await register(newProfile,{...owner,"oai-authenticated-user-email":"other@dispo.test"})).status,403);
  assert.equal((await register(newProfile,owner,"https://other.test")).status,403);
  assert.equal((await register({...newProfile,name:"A"})).status,400);
  const duplicateBase=await register({...newProfile,name:"ALC"});assert.equal(duplicateBase.status,409,await duplicateBase.text());
  assert.equal((await register({...newProfile,name:"ÁLC"})).status,409);
  assert.equal((await register({...newProfile,id:"invalid"})).status,400);
  assert.equal((await register({...newProfile,logo:Buffer.from("<svg><script>alert(1)</script></svg>"),filename:"logo.svg"})).status,400);
  assert.equal((await register({...newProfile,frame:{x:0,y:0,width:9000,height:9000,background:"#ffffff"}})).status,400);
  assert.equal((await register({...newProfile,logo:Buffer.alloc(2*1024*1024+1)})).status,413);
  const beforeRegisterEvents=await(await request("/api/gestao/scheduling/events",{headers:owner})).json();
  const newResult=await register(newProfile);assert.equal(newResult.status,201);
  const registration=await newResult.json();assert.equal(registration.carrier.slug,"nova-transportadora");assert.equal(registration.carrier.name,newProfile.name);
  assert.equal(registration.path,`/t/nova-transportadora#chave=${token("nova-transportadora")}`);
  assert.equal(registration.carrier.logo.viewBox,"66 61 424 432");assert.equal(registration.carrier.logo.background,"#000000");
  assert.equal((await register(newProfile)).status,200);
  const retryRegistration=await(await register(newProfile)).json();assert.equal(retryRegistration.replay,true);assert.equal(retryRegistration.path,registration.path);
  assert.equal((await register({...newProfile,id:randomUUID(),name:"  NOVA  TRANSPORTADORA  "})).status,409);
  assert.equal((await register({...newProfile,name:"Outro nome"})).status,409);
  const logoResponse=await request(registration.carrier.logo.src);assert.equal(logoResponse.status,200);assert.equal(logoResponse.headers.get("content-type"),"image/png");assert.equal(logoResponse.headers.get("x-content-type-options"),"nosniff");
  assert.deepEqual(Buffer.from(await logoResponse.arrayBuffer()),png);
  assert.equal((await request(registration.carrier.logo.src,{headers:{"If-None-Match":logoResponse.headers.get("etag")}})).status,304);
  assert.equal((await request("/api/logos/nao-cadastrada")).status,404);
  const dynamicPage=await request("/t/nova-transportadora");assert.equal(dynamicPage.status,200);const dynamicHtml=await dynamicPage.text();assert.ok(dynamicHtml.includes("Nova Transportadora"));assert.ok(dynamicHtml.includes("/api/logos/nova-transportadora"));
  assert.equal((await request("/t/nao-cadastrada")).status,404);
  const newAvailability={...payload,carrier:"nova-transportadora"};assert.equal((await submit(newAvailability,"nova-transportadora")).status,200);
  assert.equal((await submit(newAvailability,"alc")).status,403);
  assert.equal((await submit({...newAvailability,date:historicalDate},"nova-transportadora")).status,403);
  const newOwn=await request(`/api/disponibilidade?transportadora=nova-transportadora&data=${monday}`,{headers:{Authorization:"Bearer "+token("nova-transportadora")}});assert.equal(newOwn.status,200);assert.equal((await newOwn.json()).response.contact,payload.contact);
  assert.equal((await request(`/api/disponibilidade?transportadora=nao-cadastrada&data=${monday}`,{headers:{Authorization:"Bearer "+token("nao-cadastrada")}})).status,403);
  const newScheduling=await request(`/api/scheduling?transportadora=nova-transportadora&data=${monday}`,{headers:{Authorization:"Bearer "+token("nova-transportadora")}});assert.equal(newScheduling.status,200);assert.equal((await newScheduling.json()).modals.length,0);
  const dynamicPanel=await(await request(`/api/gestao?data=${monday}`,{headers:owner})).json();assert.equal(dynamicPanel.carriers.length,15);assert.ok(dynamicPanel.responses.some(row=>row.carrier==="nova-transportadora"));
  const allLinks=await(await request("/api/gestao/links",{headers:owner})).json();assert.equal(allLinks.links.length,15);assert.equal(allLinks.links.find(row=>row.slug==="alc").path,links.links.find(row=>row.slug==="alc").path);
  assert.equal((await(await request(`/api/gestao/scheduling/events?after=${beforeRegisterEvents.cursor}`,{headers:owner})).json()).events.length,0);
  for(const [filename,mime,name] of [["ado.jpg","image/jpeg","Cadastro JPG"],["basepex.webp","image/webp","Cadastro WebP"]]){
    const bytes=await readFile("public/logos/carriers/"+filename);const response=await register({id:randomUUID(),name,logo:bytes,mime,filename});assert.equal(response.status,201);const record=await response.json();const picture=await request(record.carrier.logo.src);assert.equal(picture.status,200);assert.equal(picture.headers.get("content-type"),mime);assert.deepEqual(Buffer.from(await picture.arrayBuffer()),bytes);
  }
  const noLogo=await register({id:randomUUID(),name:"Cadastro Sem Logo"});assert.equal(noLogo.status,201);assert.equal((await noLogo.json()).carrier.logo,undefined);
  const bucket=await mf.getR2Bucket("BUCKET");const objectsBeforeRace=(await bucket.list()).objects.length;
  const racing=await Promise.all([register({id:randomUUID(),name:"Cadastro Concorrente",logo:png}),register({id:randomUUID(),name:"Cadastro Concorrente",logo:png})]);assert.deepEqual(racing.map(response=>response.status).sort(),[201,409]);
  assert.equal((await bucket.list()).objects.length,objectsBeforeRace+1);
  const completedCatalog=await(await request("/api/gestao/transportadoras",{headers:owner})).json();assert.equal(completedCatalog.carriers.length,19);assert.equal(new Set(completedCatalog.carriers.map(row=>row.slug)).size,19);
  const registeredCount=await db.prepare("SELECT count(*) AS n FROM registered_carriers").first();assert.equal(registeredCount.n,5);
  const managerHtml=await(await request("/",{headers:owner})).text();assert.ok(managerHtml.includes("Cadastro"));assert.ok(managerHtml.includes("Nova Transportadora"));
  assert.equal((await request("/qa-registration")).status,404);
  assert.equal((await request("/qa-registration-api")).status,404);
  console.log("PASS: cadastro protegido; PNG/JPG/WebP salvos em R2; nomes únicos e reenvios idempotentes; novo link abre portal e permite disponibilidade; catálogo, indicadores e links dinâmicos; permissões anteriores preservadas.");

  // Shared catalog -> per-carrier assignments -> carrier Scheduling, including
  // persistent removals, history, concurrent edits and newly registered carriers.
  const modalEndpoint = "/api/gestao/modais";
  const manageModals = (method, data, headers = owner, origin = "https://dispo.test") => request(modalEndpoint, {
    method, headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data),
  });
  const readModals = async carrier => {
    const response = await request(`${modalEndpoint}?transportadora=${carrier}`, { headers: owner });
    assert.equal(response.status, 200); return response.json();
  };
  assert.equal((await request(modalEndpoint)).status, 403);
  assert.equal((await request(modalEndpoint, { headers: { Authorization: "Bearer " + token("alc") } })).status, 403);
  assert.equal((await request(modalEndpoint, { headers: { ...owner, "oai-authenticated-user-email": "other@dispo.test" } })).status, 403);
  const newModal = { id: randomUUID(), name: "  Van   SDD  " };
  assert.equal((await manageModals("POST", newModal, {})).status, 403);
  assert.equal((await manageModals("POST", newModal, owner, "https://other.test")).status, 403);
  assert.equal((await manageModals("POST", { ...newModal, name: " " })).status, 400);
  assert.equal((await manageModals("POST", { ...newModal, name: "X".repeat(81) })).status, 400);
  assert.equal((await request(modalEndpoint, { method: "POST", headers: { ...owner, "Content-Type": "application/json" }, body: "x".repeat(24001) })).status, 413);
  assert.equal((await request(`${modalEndpoint}?transportadora=nao-cadastrada`, { headers: owner })).status, 404);
  const initialModals = await readModals("alc");
  for (const name of expectedAlcModals) assert.ok(initialModals.modals.some(modal => modal.name === name));
  for (const modal of alcCatalog.modals) assert.ok(initialModals.selection.codes.includes(modal.code));
  const modalCreated = await manageModals("POST", newModal); assert.equal(modalCreated.status, 201);
  const sharedModal = (await modalCreated.json()).modal; assert.equal(sharedModal.name, "Van SDD");
  const modalReplay = await manageModals("POST", newModal); assert.equal(modalReplay.status, 200); assert.equal((await modalReplay.json()).replay, true);
  assert.equal((await manageModals("POST", { ...newModal, name: "Outro Modal" })).status, 409);
  assert.equal((await manageModals("POST", { id: randomUUID(), name: "VÁN sdd" })).status, 409);
  assert.ok(!(await readModals("alc")).selection.codes.includes(sharedModal.code));
  assert.ok(!(await readModals("ado")).selection.codes.includes(sharedModal.code));
  const historicModal = alcCatalog.modals[0];
  const oldAlcOrder = await db.prepare("SELECT * FROM scheduling_requests WHERE modal_id = ? LIMIT 1").bind(historicModal.id).first();
  assert.ok(oldAlcOrder);
  const withoutRental = { ...initialModals.selection, codes: initialModals.selection.codes.filter(code => code !== historicModal.code), changeId: randomUUID() };
  assert.equal((await manageModals("PUT", withoutRental, { Authorization: "Bearer " + token("alc") })).status, 403);
  assert.equal((await manageModals("PUT", withoutRental, owner, "https://other.test")).status, 403);
  assert.equal((await manageModals("PUT", { ...withoutRental, codes: [sharedModal.code, sharedModal.code] })).status, 400);
  assert.equal((await manageModals("PUT", { ...withoutRental, codes: ["missing-modal"] })).status, 400);
  const removed = await manageModals("PUT", withoutRental); assert.equal(removed.status, 200);
  const removedSelection = (await removed.json()).selection; assert.equal(removedSelection.revision, initialModals.selection.revision + 1);
  const removalReplay = await manageModals("PUT", withoutRental); assert.equal(removalReplay.status, 200); assert.equal((await removalReplay.json()).replay, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    const carrierList = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
    assert.ok(!carrierList.modals.some(modal => modal.id === historicModal.id));
    await request(`/api/gestao/scheduling?data=${monday}`, { headers: owner });
    assert.ok(!(await readModals("alc")).selection.codes.includes(historicModal.code));
  }
  assert.equal((await schedule({ ...orderPayload, id: randomUUID(), carrier: "alc", modalId: historicModal.id }, "alc")).status, 422);
  assert.deepEqual(await db.prepare("SELECT * FROM scheduling_requests WHERE id = ?").bind(oldAlcOrder.id).first(), oldAlcOrder);
  assert.equal((await manageModals("PUT", { ...withoutRental, codes: initialModals.selection.codes, changeId: randomUUID() })).status, 409);
  assert.deepEqual((await readModals("alc")).selection.codes, removedSelection.codes);

  const adoSelection = (await readModals("ado")).selection;
  const grantAdo = { ...adoSelection, codes: [...adoSelection.codes, sharedModal.code], changeId: randomUUID() };
  assert.equal((await manageModals("PUT", grantAdo)).status, 200);
  const adoScheduling = await (await request("/api/scheduling?" + schedulingQuery, { headers: { Authorization: "Bearer " + token("ado") } })).json();
  const adoVan = adoScheduling.modals.find(modal => modal.code === sharedModal.code); assert.ok(adoVan);
  const requestedVan = await schedule({ ...orderPayload, id: randomUUID(), modalId: adoVan.id }); assert.equal(requestedVan.status, 201);
  const vanOrder = (await requestedVan.json()).request; assert.equal(vanOrder.status, "pending"); assert.equal(vanOrder.modalName, sharedModal.name);
  assert.equal((await schedule({ ...orderPayload, id: randomUUID(), carrier: "alc", modalId: adoVan.id }, "alc")).status, 422);
  const concurrentSelection = (await readModals("ado")).selection;
  const concurrentEdits = await Promise.all([
    manageModals("PUT", { ...concurrentSelection, codes: [sharedModal.code], changeId: randomUUID() }),
    manageModals("PUT", { ...concurrentSelection, codes: [], changeId: randomUUID() }),
  ]);
  assert.deepEqual(concurrentEdits.map(response => response.status).sort(), [200, 409]);
  const winner = await concurrentEdits.find(response => response.status === 200).json();
  assert.deepEqual((await readModals("ado")).selection, winner.selection);
  const removeAllAlc = await manageModals("PUT", { ...removedSelection, codes: [], changeId: randomUUID() }); assert.equal(removeAllAlc.status, 200);
  const allRemoved = (await removeAllAlc.json()).selection;
  const alcEmpty = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json(); assert.equal(alcEmpty.modals.length, 0);
  assert.equal((await manageModals("PUT", { ...allRemoved, codes: initialModals.selection.codes, changeId: randomUUID() })).status, 200);
  const restored = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
  assert.deepEqual(restored.modals.filter(modal => alcCatalog.modals.some(original => original.id === modal.id)), alcCatalog.modals);
  assert.deepEqual(await db.prepare("SELECT * FROM scheduling_requests WHERE id = ?").bind(oldAlcOrder.id).first(), oldAlcOrder);
  const dynamicSelection = (await readModals("nova-transportadora")).selection; assert.deepEqual(dynamicSelection.codes, []);
  assert.equal((await manageModals("PUT", { ...dynamicSelection, codes: [sharedModal.code], changeId: randomUUID() })).status, 200);
  const dynamicModals = await (await request(`/api/scheduling?transportadora=nova-transportadora&data=${monday}`, { headers: { Authorization: "Bearer " + token("nova-transportadora") } })).json();
  assert.equal(dynamicModals.modals.length, 1); assert.equal(dynamicModals.modals[0].name, sharedModal.name);
  assert.equal((await schedule({ ...orderPayload, id: randomUUID(), carrier: "nova-transportadora", modalId: dynamicModals.modals[0].id }, "nova-transportadora")).status, 201);
  assert.equal((await request("/qa-modals")).status, 404);
  assert.equal((await request("/qa-modals-api")).status, 404);
  console.log("PASS: base geral protegida e sem duplicatas; seleção por transportadora; retiradas persistentes e histórico preservado; edições concorrentes sem sobrescrita; reenvios idempotentes; novos cadastros recebem modais e enviam pedidos pendentes.");

  calendarFixture = calendarFixtures(monday);
  const calendarEndpoint = "/api/gestao/calendarizacao";
  const calendarAction = (data, headers = owner, origin = "https://dispo.test") => request(calendarEndpoint, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(data) });
  assert.equal((await request(calendarEndpoint)).status, 403);
  assert.equal((await request(calendarEndpoint, { headers: { Authorization: "Bearer " + token("alc") } })).status, 403);
  assert.equal((await calendarAction({ action: "refresh_source" }, {})).status, 403);
  assert.equal((await calendarAction({ action: "refresh_source" }, owner, "https://other.test")).status, 403);
  const sourceResponse = await request(calendarEndpoint, { headers: owner }); assert.equal(sourceResponse.status, 200);
  const sourceInfo = (await sourceResponse.json()).source;
  assert.equal(sourceInfo.facility, "SMG1"); assert.equal(sourceInfo.ffRows, 5); assert.equal(sourceInfo.sddRows, 2);
  assert.equal(sourceInfo.dates[0], monday); assert.ok(!JSON.stringify(sourceInfo).includes("ABC1234"));
  assert.equal(calendarReads.length, 2); assert.ok(calendarReads.every(query => query.includes("'SMG1'")));
  const catalogBeforeFixed = await readModals("alc");
  const rental = catalogBeforeFixed.modals.find(modal => modal.code === "vuc-rental-tks"); assert.equal(rental.isFixedFleet, false);
  const fixedSettings = { id: rental.id, revision: rental.revision, changeId: randomUUID(), isFixedFleet: true, calendarizationType: "FF", sourceModalName: "Vuc Rental TKS" };
  assert.equal((await manageModals("PATCH", fixedSettings, {})).status, 403);
  assert.equal((await manageModals("PATCH", fixedSettings, owner, "https://other.test")).status, 403);
  assert.equal((await manageModals("PATCH", { ...fixedSettings, calendarizationType: "none" })).status, 400);
  const fixedResponse = await manageModals("PATCH", fixedSettings); assert.equal(fixedResponse.status, 200);
  const fixedModal = (await fixedResponse.json()).modal; assert.equal(fixedModal.isFixedFleet, true); assert.equal(fixedModal.revision, rental.revision + 1);
  const fixedReplay = await manageModals("PATCH", fixedSettings); assert.equal(fixedReplay.status, 200); assert.equal((await fixedReplay.json()).replay, true);
  assert.equal((await manageModals("PATCH", { ...fixedSettings, changeId: randomUUID() })).status, 409);
  const fixedCarrierCatalog = await (await request("/api/scheduling?" + alcQuery, { headers: { Authorization: "Bearer " + token("alc") } })).json();
  const rentalBinding = fixedCarrierCatalog.modals.find(modal => modal.code === rental.code); assert.equal(rentalBinding.isFixedFleet, true);
  const fixedPayload = { ...orderPayload, id: randomUUID(), carrier: "alc", modalId: rentalBinding.id, date: monday, cycle: "AM", quantity: 1, licensePlate: "abc-1234" };
  assert.equal((await schedule({ ...fixedPayload, licensePlate: "" }, "alc")).status, 422);
  assert.equal((await schedule({ ...fixedPayload, licensePlate: "semplaca" }, "alc")).status, 422);
  assert.equal((await schedule({ ...fixedPayload, quantity: 2 }, "alc")).status, 422);
  assert.equal((await schedule({ ...fixedPayload, licensePlate: "", isFixedFleet: false }, "alc")).status, 422);
  const fixedOrderResponse = await schedule(fixedPayload, "alc"); assert.equal(fixedOrderResponse.status, 201);
  const fixedOrder = (await fixedOrderResponse.json()).request;
  assert.equal(fixedOrder.isFixedFleet, true); assert.equal(fixedOrder.licensePlate, "ABC1234"); assert.equal(fixedOrder.status, "pending");
  assert.equal(fixedOrder.calendarStatus, "matched"); assert.equal(fixedOrder.calendarizationType, "FF"); assert.equal(fixedOrder.calendarPlanned, 1); assert.equal(fixedOrder.calendarRevision, 1);
  assert.equal(calendarReads.length, 2); // Both source tabs came from the fresh bounded cache.
  const fixedOrderReplay = await schedule(fixedPayload, "alc"); assert.equal(fixedOrderReplay.status, 200); assert.equal((await fixedOrderReplay.json()).replay, true);
  assert.equal((await schedule({ ...fixedPayload, licensePlate: "XYZ1A23" }, "alc")).status, 409);
  for (const [patch, expected] of [[{ licensePlate: "DEF1A23" }, "carrier_mismatch"], [{ licensePlate: "GHI1B23" }, "modal_mismatch"], [{ licensePlate: "JKL1C23" }, "not_found"], [{ licensePlate: "MNO1D23" }, "ambiguous"], [{ date: plusDays(monday, 2) }, "off"], [{ date: tuesday }, "cycle_mismatch"], [{ date: plusDays(monday, 7) }, "period_missing"]]) {
    const response = await schedule({ ...fixedPayload, ...patch, id: randomUUID(), calendarStatus: "matched" }, "alc"); assert.equal(response.status, 201);
    const order = (await response.json()).request; assert.equal(order.calendarStatus, expected); assert.equal(order.status, "pending");
  }
  assert.equal((await calendarAction({ action: "check_order", id: fixedOrder.id }, { Authorization: "Bearer " + token("alc") })).status, 403);
  assert.equal((await calendarAction({ action: "check_order", id: randomUUID() })).status, 404);
  calendarUnavailable = true;
  const failedCheck = await calendarAction({ action: "check_order", id: fixedOrder.id }); assert.equal(failedCheck.status, 200);
  const unavailableOrder = (await failedCheck.json()).request; assert.equal(unavailableOrder.calendarStatus, "unavailable"); assert.equal(unavailableOrder.status, "pending");
  assert.equal((await calendarAction({ action: "refresh_source" })).status, 503);
  calendarUnavailable = false;
  const recovered = (await (await calendarAction({ action: "check_order", id: fixedOrder.id })).json()).request;
  assert.equal(recovered.calendarStatus, "matched"); assert.equal(recovered.statusRevision, 1); assert.equal(recovered.resolutionNotes, "");
  await checkMultiPlates({ schedule, fixedPayload, db, calendarAction, request, owner, token, calendarFixture });
  const clearFixed = await manageModals("PATCH", { id: fixedModal.id, revision: fixedModal.revision, changeId: randomUUID(), isFixedFleet: false, calendarizationType: "none", sourceModalName: "" }); assert.equal(clearFixed.status, 200);
  const preservedFixed = await (await request("/api/scheduling?" + alcQuery.replace("CPM(CHP)", "AM"), { headers: { Authorization: "Bearer " + token("alc") } })).json();
  const preservedRecord = await db.prepare("SELECT is_fixed_fleet,license_plate,calendar_status FROM scheduling_requests WHERE id = ?").bind(fixedOrder.id).first();
  assert.equal(preservedRecord.is_fixed_fleet, 1); assert.equal(preservedRecord.license_plate, "ABC1234");
  const pp = (await readModals("alc")).modals.find(modal => modal.code === "vuc-pp-sdd");
  assert.equal((await manageModals("PATCH", { id: pp.id, revision: pp.revision, changeId: randomUUID(), isFixedFleet: false, calendarizationType: "SDD", sourceModalName: "VUC PP SDD" })).status, 200);
  const ppBinding = alcCatalog.modals.find(modal => modal.code === "vuc-pp-sdd");
  const sddPayload = { ...fixedPayload, id: randomUUID(), modalId: ppBinding.id, quantity: 2, licensePlate: "" };
  const sddFirst = await schedule(sddPayload, "alc"); assert.equal(sddFirst.status, 201); const sddFirstOrder = (await sddFirst.json()).request;
  assert.equal(sddFirstOrder.isFixedFleet, false); assert.equal(sddFirstOrder.licensePlate, ""); assert.equal(sddFirstOrder.calendarStatus, "matched"); assert.equal(sddFirstOrder.calendarPlanned, 3); assert.equal(sddFirstOrder.calendarRequested, 2);
  const sddSecond = await schedule({ ...sddPayload, id: randomUUID() }, "alc"); assert.equal(sddSecond.status, 201); const sddSecondOrder = (await sddSecond.json()).request;
  assert.equal(sddSecondOrder.calendarStatus, "quantity_exceeded"); assert.equal(sddSecondOrder.calendarRequested, 4); assert.equal(sddSecondOrder.status, "pending");
  assert.equal((await resolveOrder({ id: sddFirstOrder.id, revision: 1, changeId: randomUUID(), status: "not_done", resolutionNotes: "Pedido de teste cancelado." })).status, 200);
  const recounted = (await (await calendarAction({ action: "check_order", id: sddSecondOrder.id })).json()).request;
  assert.equal(recounted.calendarStatus, "matched"); assert.equal(recounted.calendarRequested, 2); assert.equal(recounted.status, "pending");
  assert.deepEqual(await db.prepare("SELECT * FROM scheduling_requests WHERE id = ?").bind(oldAlcOrder.id).first(), oldAlcOrder);
  assert.equal((await request("/qa-fixed")).status, 404);
  assert.equal((await request("/qa-fixed-calendar")).status, 404);
  assert.equal((await request("/qa-fixed-modais")).status, 404);
  console.log("PASS: frota fixa exige uma placa válida por veículo; configuração e histórico preservados; FF cruza placa/MLP/modal/semana/dia/ciclo; SDD confere quantidades acumuladas; apenas SMG1; indisponibilidade e reconsulta sem alterar decisão ou alertas.");
  await checkStela({request,owner,db,token,today,cycle:selectCycleForDate(today),mailHarness});
  await checkStelaSpeech({request,owner,db,token,today,cycle:selectCycleForDate(today),mailHarness,harness:elevenHarness});
  const stelaMigrations=[];for(const name of(await readdir("drizzle")).filter(name=>name.endsWith(".sql")).sort())stelaMigrations.push(...(await readFile("drizzle/"+name,"utf8")).split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean));
  await checkStelaAI({createWorker:()=>new Miniflare({...workerOptions,bindings:{...workerOptions.bindings,OPENAI_API_KEY:"isolated-stela-provider-key"}}),owner,harness:stelaHarness,migrations:stelaMigrations});
  await checkGatewayIntegration({request,owner,db,mailHarness,token,futureDate:plusDays(monday,21)});
  await checkGatewayIntegration({request,owner,db,mailHarness,token,futureDate:plusDays(monday,21),origin:"https://fleetops.dev.br"});
  await checkGatewayIntegration({request,owner,db,mailHarness,token,futureDate:plusDays(monday,28),origin:"https://fleetops.example.workers.dev",entry:"cloudflare"});
} finally { await mf.dispose(); }
