// The open profile's session in the browser. Shum-Core (WebSession) runs the
// same session as native clients and decides everything; this module keeps
// the WebSockets, the clock and IndexedDB, and carries out Shum-Core's
// effects strictly in order: what Shum-Core stored is written before anything
// it sends, and a request is answered once its state is stored.
import type { Request, Snapshot } from "../core";
import { WebSession } from "./core/shum_web.js";
import { persist, renameProfile, type Plan, type WebProfile } from "./store";

type Answer = { ok?: unknown; error?: unknown };
type Effect =
  | ({ type: "store" } & Plan)
  | { type: "renamed"; name: string }
  | { type: "connect"; relay: number; attempt: number }
  | { type: "send"; relay: number; text: string }
  | { type: "close"; relay: number }
  | ({ type: "reply"; id: number } & Answer)
  | { type: "connected" | "disconnected" | "eose"; url: string }
  | { type: "event" | "published" }
  | { type: "push"; event: string; path: string; headers: Record<string, string>; body: string };

/** Wakes the contact's iPhone when a message waits for it (protocol section 08). */
const PUSH_SERVICE = "https://push.getshum.tech";

const STORE_FAILED = { kind: "text", text: "Не удалось сохранить данные в браузере. Перезагрузите страницу." };

export class BrowserSession {
  private core: WebSession;
  private sockets = new Map<number, WebSocket>();
  private waiting = new Map<number, (answer: Answer) => void>();
  private next = 0;
  /** Effects are carried out one batch after another. */
  private chain: Promise<void> = Promise.resolve();
  private failed = false;
  private timer: number;
  private tick = () => this.step((s) => s.tick(Date.now()));
  /** Back online or on the tab again: relays reconnect at once. */
  private wake = () => {
    if (document.visibilityState === "visible") this.step((s) => s.wake(Date.now()));
  };

  constructor(
    readonly id: string,
    profile: WebProfile,
    name: string,
    relays: string[],
  ) {
    this.core = new WebSession(profile, id, name, relays, true, Date.now());
    this.timer = window.setInterval(this.tick, 1000);
    window.addEventListener("online", this.wake);
    document.addEventListener("visibilitychange", this.wake);
    this.tick();
  }

  snapshot(): Snapshot {
    return JSON.parse(this.core.snapshot());
  }

  invitation(): string {
    return this.core.invitation();
  }

  /** Answers once the state the request changed is stored. */
  async request<T>(request: Request | string): Promise<T> {
    if (this.failed) throw STORE_FAILED;
    const id = ++this.next;
    const json = typeof request === "string" ? request : JSON.stringify(request);
    let immediate: string | undefined;
    const done = this.step((s) => (immediate = s.request(id, json, Date.now())));
    const answer: Answer = immediate
      ? JSON.parse(immediate)
      : await new Promise<Answer>((resolve) => this.waiting.set(id, resolve));
    await done;
    if (this.failed) throw STORE_FAILED;
    if ("error" in answer) throw answer.error;
    return answer.ok as T;
  }

  close() {
    clearInterval(this.timer);
    window.removeEventListener("online", this.wake);
    document.removeEventListener("visibilitychange", this.wake);
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
    // Shum-Core is freed after the last batch of effects.
    this.chain.finally(() => this.core.free());
    this.failed = true;
  }

  /** Feeds Shum-Core, then queues what it decided after earlier batches. */
  private step(input: (session: WebSession) => void): Promise<void> {
    if (this.failed) return this.chain;
    try {
      input(this.core);
    } finally {
      const effects: Effect[] = JSON.parse(this.core.effects());
      if (effects.length) this.chain = this.chain.then(() => this.carry(effects));
    }
    return this.chain;
  }

  private async carry(effects: Effect[]) {
    for (const effect of effects) {
      if (this.failed && effect.type !== "reply") return;
      switch (effect.type) {
        case "store":
          try {
            await persist(this.id, effect);
          } catch {
            // Memory is ahead of storage now; stop before anything is sent.
            this.fail();
            return;
          }
          break;
        case "renamed":
          await renameProfile(this.id, effect.name).catch(() => {});
          break;
        case "connect":
          this.connect(effect.relay, effect.attempt);
          break;
        case "send":
          this.sockets.get(effect.relay)?.send(effect.text);
          break;
        case "close":
          this.sockets.get(effect.relay)?.close();
          this.sockets.delete(effect.relay);
          break;
        case "reply":
          this.waiting.get(effect.id)?.(effect);
          this.waiting.delete(effect.id);
          break;
        case "push":
          // Not awaited: a slow push service must not hold up later effects.
          this.push(effect);
          break;
      }
    }
  }

  private push(effect: Extract<Effect, { type: "push" }>) {
    const body = Uint8Array.from(atob(effect.body), (c) => c.charCodeAt(0));
    fetch(PUSH_SERVICE + effect.path, { method: "POST", headers: effect.headers, body })
      .then((response) => (response.ok ? undefined : `push API returned HTTP ${response.status}`))
      .catch((error: unknown) => String(error))
      .then((error) => this.step((s) => s.pushed(effect.event, error)));
  }

  private connect(relay: number, attempt: number) {
    this.sockets.get(relay)?.close();
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.core.url(relay)!);
    } catch {
      this.step((s) => s.closed(relay, attempt, Date.now()));
      return;
    }
    this.sockets.set(relay, socket);
    socket.onopen = () => this.step((s) => s.opened(relay, attempt, Date.now()));
    socket.onmessage = (message) => {
      if (typeof message.data === "string") this.step((s) => s.received(relay, attempt, message.data, Date.now()));
    };
    socket.onclose = () => {
      if (this.sockets.get(relay) === socket) this.sockets.delete(relay);
      this.step((s) => s.closed(relay, attempt, Date.now()));
    };
  }

  private fail() {
    this.failed = true;
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
    for (const waiter of this.waiting.values()) waiter({ error: STORE_FAILED });
    this.waiting.clear();
  }
}
