import assert from "node:assert/strict";
import worker from "../hosting/cloudflare-gateway/worker.mjs";

const origin = "https://fleetops.example.workers.dev";
const upstream = "https://disponibilidade-cpm-chp.shadycharm33.chatgpt.site";
const env = { PUBLIC_ORIGIN: origin, GATEWAY_TOKEN: "isolated-cloudflare-gateway-token-at-least-48-characters-0123456789" };
const request = (path = "/", options = {}) => new Request(origin + path, { ...options, headers: { "cf-connecting-ip": "198.51.100.30", ...options.headers } });
const calls = [];
const originalFetch = globalThis.fetch;
let outboundResponse = () => new Response("FleetOps", { headers: { "Set-Cookie": "__Secure-fleetops.session_token=isolated; Secure; HttpOnly; Path=/", "Cache-Control": "public,max-age=86400" } });
globalThis.fetch = async (forwarded, options) => { calls.push({ request: forwarded, options }); return outboundResponse(); };
try {
  for (const settings of [{}, { ...env, PUBLIC_ORIGIN: origin + "/" }, { ...env, PUBLIC_ORIGIN: "http://fleetops.example.workers.dev" }, { ...env, GATEWAY_TOKEN: "too-short" }]) {
    assert.equal((await worker.fetch(request(), settings)).status, 503);
  }
  assert.equal((await worker.fetch(new Request("https://preview.example.workers.dev/"), env)).status, 403);
  assert.equal((await worker.fetch(new Request(origin), env)).status, 403);
  assert.equal(calls.length, 0, "invalid settings and foreign hosts never reach the server");

  for (const path of ["/signin-with-chatgpt?return_to=%2Flogin", "/signout-with-chatgpt", "/callback"]) {
    const native = await worker.fetch(request(path), env);
    assert.equal(native.status, 307); assert.equal(native.headers.get("location"), upstream + path);
  }
  assert.equal(calls.length, 0, "native recovery goes directly to its original owner");
  const response = await worker.fetch(request("/api/scheduling?transportadora=alc", { method: "POST", body: '{"quantity":15}', headers: {
    "Content-Type": "application/json", Origin: origin, Cookie: "__Secure-fleetops.session_token=isolated", Authorization: "Bearer carrier-test",
    "x-forwarded-for": "attacker", "x-forwarded-host": "attacker.test", "x-forwarded-proto": "http", "x-real-ip": "attacker",
    "x-fleetops-gateway-authorization": "attacker", "oai-authenticated-user-id": "forged", "oai-authenticated-user-email": "forged@test.invalid", "oai-sites-authorization": "forged",
  } }), env);
  assert.equal(response.status, 200); assert.equal(await response.text(), "FleetOps");
  assert.match(response.headers.get("set-cookie"), /Secure; HttpOnly/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store"); assert.equal(response.headers.get("x-fleetops-entry"), "cloudflare");
  const forwarded = calls.at(-1).request;
  assert.equal(forwarded.url, upstream + "/api/scheduling?transportadora=alc");
  assert.equal(forwarded.method, "POST"); assert.equal(await forwarded.text(), '{"quantity":15}');
  assert.equal(forwarded.redirect, "manual");
  assert.equal(forwarded.headers.get("origin"), origin); assert.match(forwarded.headers.get("cookie"), /session_token/);
  assert.equal(forwarded.headers.get("authorization"), "Bearer carrier-test");
  assert.equal(forwarded.headers.get("x-forwarded-for"), "198.51.100.30");
  assert.equal(forwarded.headers.get("x-forwarded-host"), "fleetops.example.workers.dev");
  assert.equal(forwarded.headers.get("x-forwarded-proto"), "https");
  assert.equal(forwarded.headers.get("x-fleetops-gateway-authorization"), env.GATEWAY_TOKEN);
  for (const name of ["oai-authenticated-user-id", "oai-authenticated-user-email", "oai-sites-authorization", "x-real-ip"]) assert.equal(forwarded.headers.get(name), null);
  assert.deepEqual(calls.at(-1).options.cf, { cacheEverything: false, cacheTtl: 0 });

  await worker.fetch(request("//attacker.test/leak?secret=none"), env);
  assert.equal(new URL(calls.at(-1).request.url).origin, upstream, "a path starting with // cannot change the destination or leak the gateway credential");
  outboundResponse = () => new Response(null, { status: 302, headers: { Location: upstream + "/login?return_to=%2F#access" } });
  const redirect = await worker.fetch(request("/"), env);
  assert.equal(redirect.status, 302); assert.equal(redirect.headers.get("location"), origin + "/login?return_to=%2F#access");
  outboundResponse = () => new Response(null, { status: 307, headers: { Location: upstream + "/signin-with-chatgpt" } });
  assert.equal((await worker.fetch(request("/"), env)).headers.get("location"), upstream + "/signin-with-chatgpt");
  outboundResponse = () => { throw new Error("isolated upstream failure"); };
  const failed = await worker.fetch(request("/"), env); assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes(env.GATEWAY_TOKEN));
  console.log("PASS: Worker Cloudflare fechado sem configuração; origem exata; recuperação nativa; POST/cookies/chaves preservados; identidade forjada removida; destino fixo contra exfiltração; redirecionamentos e falhas seguros; cache desativado.");
} finally { globalThis.fetch = originalFetch; }
