import { AsyncLocalStorage } from "node:async_hooks";

// Only the Worker may populate this after authenticating the hosting gateway.
const origins = new AsyncLocalStorage<string | undefined>();

export function runWithGatewayOrigin<T>(origin: string | undefined, run: () => T): T {
  return origins.run(origin, run);
}

export function gatewayOrigin(): string | undefined {
  return origins.getStore();
}
