declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LINK_SECRET?: string;
    OWNER_EMAIL?: string;
    BETTER_AUTH_SECRET?: string;
    AUTH_BASE_URL?: string;
    OPENAI_API_KEY?: string;
    STELA_MODEL?: string;
    FLEETOPS_GATEWAY_TOKEN?: string;
    FLEETOPS_GATEWAY_ORIGIN?: string;
    FLEETOPS_GATEWAY_ORIGINS?: string;
    FLEETOPS_CLOUDFLARE_GATEWAY_TOKEN?: string;
    FLEETOPS_CLOUDFLARE_GATEWAY_ORIGIN?: string;
  }
}
