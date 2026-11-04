import assert from "node:assert/strict";
import { prepareGatewayRequest, gatewayResponse, GATEWAY_AUTH_HEADER } from "../lib/hosting-gateway.ts";
import { gatewayOrigin, runWithGatewayOrigin } from "../lib/gateway-context.ts";

const config = { token: "isolated-gateway-token-at-least-48-characters-0123456789abcdef", origin: "https://fleetops.test" };
const headers = { [GATEWAY_AUTH_HEADER]: config.token, "x-forwarded-host": "fleetops.test", "x-forwarded-proto": "https", "x-forwarded-for": "198.51.100.30, 203.0.113.50" };
const make = (patch = {}, options = {}) => new Request("https://original.test/api/scheduling?data=2026-10-27", { ...options, headers: { ...headers, ...patch } });
const direct = new Request("https://original.test/", { headers: { "oai-authenticated-user-email": "master@test.invalid" } });
assert.equal(prepareGatewayRequest(direct, config).request, direct);
for (const [request, settings] of [[make({ [GATEWAY_AUTH_HEADER]: "wrong" }), config], [make(), {}], [make({ "x-forwarded-host": "evil.test" }), config], [make({ "x-forwarded-proto": "http" }), config], [make({ "x-forwarded-for": "not-an-ip" }), config], [make(), { ...config, origin: "https://fleetops.test/" }], [make(), { ...config, origin: "http://fleetops.test" }]]) {
  assert.equal(prepareGatewayRequest(request, settings).status, 403);
}
const mapped = prepareGatewayRequest(make({ "oai-authenticated-user-id": "forged", "oai-authenticated-user-email": "master@test.invalid", "oai-sites-authorization": "forged", "Content-Type": "application/json", Cookie: "__Secure-fleetops.session_token=test" }, { method: "POST", body: '{"quantity":2}' }), config);
assert.equal(mapped.origin, config.origin); assert.equal(mapped.request.url, "https://fleetops.test/api/scheduling?data=2026-10-27");
assert.equal(mapped.request.headers.get("cf-connecting-ip"), "198.51.100.30");
assert.equal(mapped.request.headers.get("host"), "fleetops.test");
assert.equal(await mapped.request.text(), '{"quantity":2}');
assert.match(mapped.request.headers.get("cookie"), /session_token/);
for (const key of [GATEWAY_AUTH_HEADER, "oai-authenticated-user-id", "oai-authenticated-user-email", "oai-sites-authorization", "x-forwarded-for"]) assert.equal(mapped.request.headers.get(key), null);
assert.equal(prepareGatewayRequest(make({ "x-forwarded-for": "2001:db8::1" }), config).request.headers.get("cf-connecting-ip"), "2001:db8::1");
const multiple = { ...config, origins: "https://fleetops.test, https://fleetops.dev.br" };
assert.equal(prepareGatewayRequest(make(), multiple).origin, config.origin);
const custom = prepareGatewayRequest(make({ "x-forwarded-host": "fleetops.dev.br", Origin: "https://fleetops.dev.br" }), multiple);
assert.equal(custom.origin, "https://fleetops.dev.br");
assert.equal(custom.request.url, "https://fleetops.dev.br/api/scheduling?data=2026-10-27");
assert.equal(custom.request.headers.get("origin"), "https://fleetops.dev.br");
for (const host of ["www.fleetops.dev.br", "fleetops.dev.br.evil.test", "fleetops.dev.br, fleetops.test", "fleetops.dev.br:443"]) {
  assert.equal(prepareGatewayRequest(make({ "x-forwarded-host": host }), multiple).status, 403);
}
for (const origins of ["", "https://fleetops.test,", "https://fleetops.test,http://fleetops.dev.br", "https://fleetops.test,https://fleetops.dev.br/path", "https://fleetops.test,https://user:password@fleetops.dev.br"]) {
  assert.equal(prepareGatewayRequest(make(), { ...multiple, origins }).status, 403);
}
assert.equal(prepareGatewayRequest(make(), { ...multiple, origins: "https://fleetops.dev.br" }).status, 403, "explicit list replaces legacy origin");
const cloudflareConfig = { ...multiple, cloudflareToken: "isolated-cloudflare-gateway-token-at-least-48-characters-0123456789", cloudflareOrigin: "https://fleetops.example.workers.dev" };
const cloudflare = prepareGatewayRequest(make({ [GATEWAY_AUTH_HEADER]: cloudflareConfig.cloudflareToken, "x-forwarded-host": "fleetops.example.workers.dev" }), cloudflareConfig);
assert.equal(cloudflare.origin, cloudflareConfig.cloudflareOrigin); assert.equal(cloudflare.entry, "cloudflare");
assert.equal(cloudflare.request.url, "https://fleetops.example.workers.dev/api/scheduling?data=2026-10-27");
assert.equal(prepareGatewayRequest(make(), cloudflareConfig).entry, "vercel");
assert.equal(prepareGatewayRequest(make({ "x-forwarded-host": "fleetops.example.workers.dev" }), cloudflareConfig).status, 403, "Vercel credential cannot authorize Cloudflare host");
assert.equal(prepareGatewayRequest(make({ [GATEWAY_AUTH_HEADER]: cloudflareConfig.cloudflareToken }), cloudflareConfig).status, 403, "Cloudflare credential cannot authorize Vercel host");
assert.equal(prepareGatewayRequest(make({ [GATEWAY_AUTH_HEADER]: cloudflareConfig.cloudflareToken, "x-forwarded-host": "fleetops.example.workers.dev" }), multiple).status, 403, "Cloudflare entry stays closed until configured");
const response = new Response("private", { headers: { "Set-Cookie": "session=abc; Secure; HttpOnly" } });
assert.equal(gatewayResponse(response), response);
const secured = gatewayResponse(response, config.origin); assert.match(secured.headers.get("cache-control"), /private, no-store/); assert.equal(secured.headers.get("vercel-cdn-cache-control"), "no-store"); assert.equal(secured.headers.get("x-fleetops-entry"), "vercel"); assert.match(secured.headers.get("set-cookie"), /HttpOnly/);
assert.equal(gatewayResponse(new Response("private"), cloudflare.origin, cloudflare.entry).headers.get("x-fleetops-entry"), "cloudflare");
assert.equal(gatewayOrigin(), undefined);
const contexts = await Promise.all([runWithGatewayOrigin(config.origin, async () => { await Promise.resolve(); return gatewayOrigin(); }), runWithGatewayOrigin(custom.origin, async () => { await Promise.resolve(); return gatewayOrigin(); }), runWithGatewayOrigin(undefined, async () => { await Promise.resolve(); return gatewayOrigin(); })]);
assert.deepEqual(contexts, [config.origin, custom.origin, undefined]); assert.equal(gatewayOrigin(), undefined);
console.log("PASS: entrada autenticada; origens HTTPS da Vercel e domínio próprio validadas; hosts externos rejeitados; corpo/cookies preservados; contexto isolado por domínio/requisição; cache compartilhado desativado.");
