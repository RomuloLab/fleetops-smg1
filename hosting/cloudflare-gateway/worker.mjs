// This Worker provides a new entry to the existing FleetOps server and data.
// Configure GATEWAY_TOKEN as a secret binding, never in source or plain vars.
const UPSTREAM_ORIGIN = "https://disponibilidade-cpm-chp.shadycharm33.chatgpt.site";
const AUTH_HEADER = "x-fleetops-gateway-authorization";
const NATIVE_AUTH = new Set(["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"]);

function responseHeaders(source) {
  const headers = new Headers(source);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("X-FleetOps-Entry", "cloudflare");
  return headers;
}

function unavailable(status = 503) {
  return Response.json({ error: "O acesso ao FleetOps está indisponível. Tente novamente em instantes." }, { status, headers: responseHeaders() });
}

export default {
  async fetch(request, env) {
    let origin;
    try {
      origin = new URL(env.PUBLIC_ORIGIN || "");
      if (origin.protocol !== "https:" || origin.origin !== env.PUBLIC_ORIGIN || origin.username || origin.password) return unavailable();
    } catch { return unavailable(); }
    const url = new URL(request.url);
    if (url.origin !== origin.origin) return unavailable(403);
    if (typeof env.GATEWAY_TOKEN !== "string" || new TextEncoder().encode(env.GATEWAY_TOKEN).length < 48) return unavailable();

    const upstream = new URL(UPSTREAM_ORIGIN);
    upstream.pathname = url.pathname;
    upstream.search = url.search;
    // Native ChatGPT recovery stays on the platform that owns that sign-in.
    if (NATIVE_AUTH.has(url.pathname)) return new Response(null, { status: 307, headers: responseHeaders({ Location: upstream.href }) });
    const clientIp = request.headers.get("cf-connecting-ip");
    if (!clientIp) return unavailable(403);
    const headers = new Headers(request.headers);
    for (const name of Array.from(headers.keys())) {
      if (name.startsWith("oai-authenticated-") || name.startsWith("x-forwarded-") ||
        name === AUTH_HEADER || name === "oai-sites-authorization" || name === "x-real-ip") headers.delete(name);
    }
    headers.set(AUTH_HEADER, env.GATEWAY_TOKEN);
    headers.set("x-forwarded-host", origin.host);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-forwarded-for", clientIp);
    headers.set("host", upstream.host);
    try {
      const forwarded = new Request(upstream, new Request(request, { headers, redirect: "manual" }));
      const response = await fetch(forwarded, { cf: { cacheEverything: false, cacheTtl: 0 } });
      const outgoing = responseHeaders(response.headers);
      const location = outgoing.get("Location");
      if (location) {
        const target = new URL(location, upstream);
        if (target.origin === UPSTREAM_ORIGIN && !NATIVE_AUTH.has(target.pathname)) {
          target.protocol = origin.protocol;
          target.host = origin.host;
          outgoing.set("Location", target.href);
        }
      }
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
    } catch { return unavailable(502); }
  },
};
