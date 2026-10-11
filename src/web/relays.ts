// Nostr relay connections in the browser. Shum-Core (WebRelays) decides what
// to connect, send and close, and checks everything that arrives, as it does
// in native clients; this module only keeps the WebSockets and the clock.
import { WebRelays } from "./core/shum_web.js";

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
};
export type RelayUpdate =
  | { type: "connected"; relay: string }
  | { type: "disconnected"; relay: string }
  | { type: "event"; relay: string; event: NostrEvent }
  | { type: "eose"; relay: string };

type Effect =
  | { type: "connect"; relay: number; attempt: number }
  | { type: "send"; relay: number; text: string }
  | { type: "close"; relay: number }
  | { type: "connected" | "disconnected" | "eose"; url: string }
  | { type: "event"; url: string; event: NostrEvent }
  | { type: "published"; ticket: number; accepted: boolean };

export class RelayPool {
  private machine: WebRelays;
  private sockets = new Map<number, WebSocket>();
  private waiting = new Map<number, (accepted: boolean) => void>();
  private timer: number;
  private closed = false;
  private online = () => this.step((m) => m.tick(Date.now()));

  /** Connects to `urls` and receives gift wraps for `inbox`. */
  constructor(urls: string[], inbox: string, private update: (u: RelayUpdate) => void) {
    this.machine = new WebRelays(urls, inbox, Date.now());
    this.timer = window.setInterval(this.online, 1000);
    window.addEventListener("online", this.online);
    this.online();
  }

  connected(): string[] {
    return this.machine.connected();
  }

  /** Resolves once a relay accepted the event. This is never a recipient ACK. */
  publish(event: NostrEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.step((m) => {
        const ticket = m.publish(JSON.stringify(event), true, Date.now())!;
        this.waiting.set(ticket, (accepted) =>
          accepted ? resolve() : reject(new Error("Ни один релей не принял сообщение")),
        );
      });
    });
  }

  /** Contact lookup publishes without waiting, as the native core does. */
  publishUnconfirmed(event: NostrEvent) {
    this.step((m) => m.publish(JSON.stringify(event), false, Date.now()));
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    window.removeEventListener("online", this.online);
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
    this.machine.free();
  }

  /** Feeds the machine, then carries out what it decided. */
  private step(input: (machine: WebRelays) => void) {
    // Sockets still report closing after the pool is gone.
    if (this.closed) return;
    try {
      input(this.machine);
    } finally {
      const effects: Effect[] = JSON.parse(this.machine.effects());
      for (const effect of effects) this.carry(effect);
    }
  }

  private carry(effect: Effect) {
    switch (effect.type) {
      case "connect": {
        const { relay, attempt } = effect;
        this.sockets.get(relay)?.close();
        let socket: WebSocket;
        try {
          socket = new WebSocket(this.machine.url(relay)!);
        } catch {
          this.step((m) => m.closed(relay, attempt, Date.now()));
          return;
        }
        this.sockets.set(relay, socket);
        socket.onopen = () => this.step((m) => m.opened(relay, attempt, Date.now()));
        socket.onmessage = (message) => {
          if (typeof message.data === "string") this.step((m) => m.received(relay, attempt, message.data, Date.now()));
        };
        socket.onclose = () => {
          if (this.sockets.get(relay) === socket) this.sockets.delete(relay);
          this.step((m) => m.closed(relay, attempt, Date.now()));
        };
        break;
      }
      case "send":
        this.sockets.get(effect.relay)?.send(effect.text);
        break;
      case "close":
        this.sockets.get(effect.relay)?.close();
        this.sockets.delete(effect.relay);
        break;
      case "published":
        this.waiting.get(effect.ticket)?.(effect.accepted);
        this.waiting.delete(effect.ticket);
        break;
      case "event":
        this.update({ type: "event", relay: effect.url, event: effect.event });
        break;
      default:
        this.update({ type: effect.type, relay: effect.url });
    }
  }
}
