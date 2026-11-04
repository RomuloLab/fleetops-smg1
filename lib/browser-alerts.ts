export type AlertSettings = {
  enabled: boolean;
  sound: "off" | "ready" | "blocked" | "unavailable";
  notification: NotificationPermission | "unavailable";
};
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type AlertPlatform = {
  readEnabled: () => boolean;
  writeEnabled: (enabled: boolean) => void;
  createAudio: () => AudioContext;
  permission: () => AlertSettings["notification"];
  requestPermission: () => Promise<AlertSettings["notification"]>;
  notify: (title: string, options: NotificationOptions) => Notification;
};
export function browserAlertPlatform(scope: string): AlertPlatform {
  const preferenceKey = `dispo:alerts:v1:${scope}`;
  const permission = () => "Notification" in window && window.isSecureContext
    ? Notification.permission === "default" && window.top !== window.self ? "unavailable" : Notification.permission
    : "unavailable" as const;
  return {
    readEnabled() { try { const saved = localStorage.getItem(preferenceKey); return saved === "1" || (saved === null && permission() === "granted"); } catch { return permission() === "granted"; } },
    writeEnabled(enabled) { try { localStorage.setItem(preferenceKey, enabled ? "1" : "0"); } catch { /* Optional preference storage. */ } },
    createAudio: () => new AudioContext(),
    permission,
    requestPermission: () => permission() === "default" && window.top === window.self ? Notification.requestPermission() : Promise.resolve(permission()),
    notify: (title, options) => new Notification(title, options),
  };
}

// Audio and desktop notices have separate permission paths: a blocked audio
// context must never prevent an already permitted desktop notification.
export class BrowserAlerts {
  settings: AlertSettings = { enabled: false, sound: "off", notification: "unavailable" };
  private audio: AudioContext | null = null;
  private pendingChime = false;
  private disposed = false;
  private notices = new Map<ReturnType<typeof setTimeout>, Notification>();
  private platform: AlertPlatform;
  private changed: (settings: AlertSettings) => void;
  constructor(platform: AlertPlatform, changed: (settings: AlertSettings) => void) { this.platform = platform; this.changed = changed; }
  private publish(values: Partial<AlertSettings>) {
    if (this.disposed) return;
    this.settings = { ...this.settings, ...values }; this.changed(this.settings);
  }
  start() {
    this.publish({ enabled: this.platform.readEnabled(), notification: this.platform.permission() });
    if (this.settings.enabled) void this.recover();
  }
  private context() {
    if (!this.audio || this.audio.state === "closed") {
      this.audio = this.platform.createAudio();
      this.audio.onstatechange = () => {
        if (!this.settings.enabled || this.disposed) return;
        this.publish({ sound: this.audio?.state === "running" ? "ready" : "blocked" });
        this.flushChime();
      };
    }
    return this.audio;
  }
  private async resume() {
    if (!this.settings.enabled || this.disposed) return;
    try {
      const context = this.context();
      if (context.state !== "running") {
        this.publish({ sound: "blocked" });
        // A browser can leave resume() pending until another trusted gesture.
        // Bound only our wait; a later click can always call resume() again.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([context.resume(), new Promise<void>(resolve => { timer = setTimeout(resolve, 1200); })]); }
        finally { clearTimeout(timer); }
      }
      if (this.disposed || !this.settings.enabled) return;
      this.publish({ sound: context.state === "running" ? "ready" : "blocked" });
      this.flushChime();
    } catch { this.publish({ sound: this.settings.enabled ? "unavailable" : "off" }); }
  }
  async enable() {
    this.platform.writeEnabled(true);
    this.publish({ enabled: true, notification: this.platform.permission() });
    // Both calls begin in the click handler, before the first await.
    const sound = this.resume();
    let requested: Promise<AlertSettings["notification"]>;
    try { requested = this.platform.requestPermission(); } catch { requested = Promise.resolve(this.platform.permission()); }
    void requested.then(notification => this.publish({ notification })).catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const [, result] = await Promise.allSettled([sound, Promise.race([requested, new Promise<AlertSettings["notification"]>(resolve => { timer = setTimeout(() => resolve(this.platform.permission()), 3000); })])]);
      if (!this.disposed) this.publish({ notification: result.status === "fulfilled" ? result.value : this.platform.permission() });
    } finally { clearTimeout(timer); }
    return this.settings;
  }
  pause() {
    this.platform.writeEnabled(false); this.pendingChime = false;
    this.publish({ enabled: false, sound: "off" });
    void this.audio?.suspend().catch(() => undefined);
  }
  recover() {
    if (this.disposed) return Promise.resolve();
    this.publish({ notification: this.platform.permission() });
    return this.settings.enabled ? this.resume() : Promise.resolve();
  }
  play() {
    if (!this.settings.enabled || this.disposed) return;
    this.pendingChime = true;
    if (this.audio?.state === "running") this.flushChime(); else void this.resume();
  }
  private flushChime() {
    const context = this.audio;
    if (!this.pendingChime || !this.settings.enabled || this.disposed || context?.state !== "running") return;
    this.pendingChime = false;
    try {
      const start = context.currentTime;
      for (const [index, frequency] of [830.61, 1108.73].entries()) {
        const oscillator = context.createOscillator(); const gain = context.createGain(); const at = start + index * 0.16;
        oscillator.type = "sine"; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.14, at + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.34);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    } catch { this.publish({ sound: "blocked" }); }
  }
  show(title: string, options: NotificationOptions, onOpen: () => void) {
    if (!this.settings.enabled || this.disposed) return false;
    this.publish({ notification: this.platform.permission() });
    if (this.settings.notification !== "granted") return false;
    try {
      const notice = this.platform.notify(title, options);
      notice.onclick = () => { onOpen(); notice.close(); };
      const timer = setTimeout(() => { notice.close(); this.notices.delete(timer); }, 15000);
      this.notices.set(timer, notice);
      return true;
    } catch { return false; }
  }
  dispose() {
    this.disposed = true; this.pendingChime = false;
    for (const [timer, notice] of this.notices) { clearTimeout(timer); notice.close(); }
    this.notices.clear();
    if (this.audio) { this.audio.onstatechange = null; void this.audio.close().catch(() => undefined); this.audio = null; }
  }
}

type Checkpoint = { cursor: number; at: number };
export function readAlertCursor(storage: StorageLike, scope: string, now = Date.now()) {
  try {
    const saved: Checkpoint = JSON.parse(storage.getItem(`dispo:alert-cursor:v1:${scope}`) ?? "null");
    return saved && Number.isSafeInteger(saved.cursor) && saved.cursor >= 0 && Number.isFinite(saved.at) && now >= saved.at && now - saved.at < 86400000 ? saved.cursor : null;
  } catch { return null; }
}
export function saveAlertCursor(storage: StorageLike, scope: string, cursor: number, now = Date.now()) {
  try { storage.setItem(`dispo:alert-cursor:v1:${scope}`, JSON.stringify({ cursor, at: now })); } catch { /* Feed remains active without browser storage. */ }
}
