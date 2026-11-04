export const LOGIN_COOLDOWN_KEY = "fleetops-email-code-cooldown-v1";
export function cooldownSeconds(until: number, now: number) { return Math.max(0, Math.ceil((until - now) / 1000)); }
