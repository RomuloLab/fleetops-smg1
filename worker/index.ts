import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { prepareGatewayRequest, gatewayResponse } from "../lib/hosting-gateway";
import { runWithGatewayOrigin } from "../lib/gateway-context";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const gateway = prepareGatewayRequest(request, {
      token: env.FLEETOPS_GATEWAY_TOKEN, origin: env.FLEETOPS_GATEWAY_ORIGIN, origins: env.FLEETOPS_GATEWAY_ORIGINS,
      cloudflareToken: env.FLEETOPS_CLOUDFLARE_GATEWAY_TOKEN, cloudflareOrigin: env.FLEETOPS_CLOUDFLARE_GATEWAY_ORIGIN,
    });
    if (gateway instanceof Response) return gateway;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const response = await runWithGatewayOrigin(gateway.origin, () =>
      runWithConnectorBinding(binding, () => handler.fetch(gateway.request, env, ctx)));
    return gatewayResponse(response, gateway.origin, gateway.entry);
  },
};

export default worker;
