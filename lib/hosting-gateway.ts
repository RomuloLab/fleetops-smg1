import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export const GATEWAY_AUTH_HEADER = "x-fleetops-gateway-authorization";

type GatewayEntry = "vercel" | "cloudflare";
type GatewayConfig = { token?: string; origin?: string; origins?: string; cloudflareToken?: string; cloudflareOrigin?: string };
type GatewayRequest = { request: Request; origin?: string; entry?: GatewayEntry };

function tokenMatches(supplied: string, expected?: string): boolean {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected || "");
  return expectedBytes.length >= 48 && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function denied(): Response {
  return Response.json({ error: "O endereço alternativo está indisponível. Tente novamente em instantes." }, {
    status: 403, headers: { "Cache-Control": "no-store" },
  });
}

export function prepareGatewayRequest(request: Request, config: GatewayConfig): GatewayRequest | Response {
  const supplied = request.headers.get(GATEWAY_AUTH_HEADER);
  if (supplied === null) return { request };
  const entry: GatewayEntry | undefined = tokenMatches(supplied, config.token) ? "vercel" : tokenMatches(supplied, config.cloudflareToken) ? "cloudflare" : undefined;
  if (!entry) return denied();

  let allowedOrigins: URL[];
  try {
    // Keep the single-origin setting compatible with earlier deployments.
    // An explicit list replaces it and must contain only exact HTTPS origins.
    const configured = entry === "cloudflare" ? [config.cloudflareOrigin || ""] : config.origins === undefined ? [config.origin || ""] : config.origins.split(",").map(value => value.trim());
    allowedOrigins = configured.map(value => {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.origin !== value || url.username || url.password) throw new Error("Invalid gateway origin");
      return url;
    });
  } catch { return denied(); }
  const origin = allowedOrigins.find(value => value.host === request.headers.get("x-forwarded-host"));
  if (!origin || request.headers.get("x-forwarded-proto") !== "https") return denied();
  // Each gateway overwrites forwarded headers using its trusted platform IP.
  // Cloudflare can append its immediate peer on the final upstream hop.
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "";
  if (!isIP(clientIp)) return denied();

  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith("oai-authenticated-") || name.startsWith("x-forwarded-") ||
      name === GATEWAY_AUTH_HEADER || name === "oai-sites-authorization" || name === "x-real-ip") headers.delete(name);
  }
  headers.set("cf-connecting-ip", clientIp);
  headers.set("host", origin.host);
  const publicUrl = new URL(request.url);
  publicUrl.protocol = origin.protocol;
  publicUrl.host = origin.host;
  return { request: new Request(new Request(publicUrl, request), { headers }), origin: origin.origin, entry };
}

export function gatewayResponse(response: Response, origin?: string, entry: GatewayEntry = "vercel"): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  // No HTML, API response, session, or carrier information is shared by the CDN.
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  headers.set("X-FleetOps-Entry", entry);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
