// Nostr relay connections in the browser, with its own WebSocket. Shum-Core
// (shum-web) builds every message that is sent and checks every message that
// arrives; this module only keeps the connections, like RelayPool in the
// native core: one per relay, reconnecting with growing pauses, and a
// publication counts once any relay confirms it.
import { relayPublication, relayRead, relaySubscription, validateRelays } from "./core/shum_web.js";

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

type Read =
  | { type: "event"; event: NostrEvent }
  | { type: "ok"; id: string; accepted: boolean }
  | { type: "eose" }
  | { type: "closed" };
type Waiter = (accepted: boolean) => void;

const CONNECT_TIMEOUT = 8_000;
const ACK_TIMEOUT = 10_000;
/** Publications kept per relay while it is offline, as the native queue. */
const QUEUE = 64;

class Connection {
  private socket: WebSocket | null = null;
  private open = false;
  private backoff = 1;
  private retry = 0;
  private queue: { wire: string; id: string; waiter?: Waiter }[] = [];
  private waiters = new Map<string, Waiter[]>();
  private stopped = false;

  constructor(
    readonly url: string,
    private inbox: string,
    private update: (u: RelayUpdate) => void,
  ) {
    this.connect();
  }

  get connected() {
    return this.open;
  }

  /** Sends now or when the relay is back; false when the queue is full. */
  send(wire: string, id: string, waiter?: Waiter): boolean {
    if (this.open && this.socket) {
      this.transmit(wire, id, waiter);
      return true;
    }
    if (this.queue.length >= QUEUE) return false;
    this.queue.push({ wire, id, waiter });
    return true;
  }

  /** Reconnects at once, for example when the device is back online. */
  wake() {
    if (this.stopped || this.socket) return;
    clearTimeout(this.retry);
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.socket?.close();
    this.drop();
  }

  private connect() {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.closed(false);
      return;
    }
    this.socket = socket;
    const timeout = setTimeout(() => socket.close(), CONNECT_TIMEOUT);
    socket.onopen = () => {
      clearTimeout(timeout);
      socket.send(relaySubscription(this.inbox, Date.now() / 1000));
      this.open = true;
      this.backoff = 1;
      this.update({ type: "connected", relay: this.url });
      for (const { wire, id, waiter } of this.queue.splice(0)) this.transmit(wire, id, waiter);
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== "string") return;
      const json = relayRead(message.data, this.inbox);
      if (!json) return;
      const read: Read = JSON.parse(json);
      if (read.type === "event") this.update({ type: "event", relay: this.url, event: read.event });
      else if (read.type === "eose") this.update({ type: "eose", relay: this.url });
      else if (read.type === "ok") {
        const waiting = this.waiters.get(read.id);
        this.waiters.delete(read.id);
        for (const waiter of waiting ?? []) waiter(read.accepted);
      } else socket.close();
    };
    socket.onclose = () => {
      clearTimeout(timeout);
      if (this.socket !== socket) return;
      this.closed(this.open);
    };
  }

  private transmit(wire: string, id: string, waiter?: Waiter) {
    this.socket!.send(wire);
    if (!waiter) return;
    const list = this.waiters.get(id) ?? [];
    list.push(waiter);
    this.waiters.set(id, list);
  }

  private closed(wasOpen: boolean) {
    this.socket = null;
    this.drop();
    this.update({ type: "disconnected", relay: this.url });
    if (this.stopped) return;
    // After a working connection try again soon; after a failed attempt wait
    // twice as long each time, up to a minute.
    const pause = wasOpen ? 1 : this.backoff;
    if (!wasOpen) this.backoff = Math.min(this.backoff * 2, 60);
    this.retry = window.setTimeout(() => this.connect(), pause * 1000);
  }

  /** Publications waiting for this relay's answer count as refused. */
  private drop() {
    this.open = false;
    for (const waiting of this.waiters.values()) for (const waiter of waiting) waiter(false);
    this.waiters.clear();
  }
}

export class RelayPool {
  private connections: Connection[];
  private online = () => this.connections.forEach((c) => c.wake());

  /** Connects to `urls` and receives gift wraps for `inbox`. */
  constructor(urls: string[], inbox: string, update: (u: RelayUpdate) => void) {
    validateRelays(urls);
    this.connections = urls.map((url) => new Connection(url, inbox, update));
    window.addEventListener("online", this.online);
  }

  connected(): string[] {
    return this.connections.filter((c) => c.connected).map((c) => c.url).sort();
  }

  /** Resolves once a relay accepted the event. This is never a recipient ACK. */
  publish(event: NostrEvent): Promise<void> {
    const wire = relayPublication(JSON.stringify(event));
    return new Promise((resolve, reject) => {
      let waiting = 0;
      let done = false;
      const finish = (accepted: boolean) => {
        if (done) return;
        if (accepted) {
          done = true;
          clearTimeout(timer);
          resolve();
        } else if (--waiting === 0) {
          done = true;
          clearTimeout(timer);
          reject(new Error("Ни один релей не принял сообщение"));
        }
      };
      for (const connection of this.connections) {
        let answered = false;
        const once = (accepted: boolean) => {
          if (answered) return;
          answered = true;
          finish(accepted);
        };
        if (connection.send(wire, event.id, once)) waiting++;
      }
      if (waiting === 0) {
        done = true;
        reject(new Error("Очередь релеев заполнена"));
        return;
      }
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Релеи не ответили"));
      }, ACK_TIMEOUT);
    });
  }

  /** Contact lookup publishes without waiting, as the native core does. */
  publishUnconfirmed(event: NostrEvent) {
    const wire = relayPublication(JSON.stringify(event));
    const sent = this.connections.filter((c) => c.send(wire, event.id)).length;
    if (sent === 0) throw new Error("Очередь релеев заполнена");
  }

  close() {
    window.removeEventListener("online", this.online);
    for (const connection of this.connections) connection.stop();
  }
}
