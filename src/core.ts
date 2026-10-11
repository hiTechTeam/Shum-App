// The interface's only way to Shum-Core: requests to the profile owner and
// pixel avatars. In the desktop app the Rust side answers; in the browser
// version Shum-Core runs in the page (src/web).
import { invoke } from "@tauri-apps/api/core";

export type Phase = "ready" | "outgoingPending" | "incomingPending" | "accepted" | "declinedByPeer" | "declinedLocally";

export type Card = { name: string; bio: string; avatarSeed?: string; nostrKey?: string };

export type Contact = {
  id: string;
  card: Card;
  phase: Phase;
  unread: number;
  nearby: boolean;
  distance?: number | null;
  typing: boolean;
  online: boolean;
};

export type Message = {
  id: string;
  contactID: string;
  timestamp: number;
  text: string;
  outgoing: boolean;
  status: "delivered" | "read" | "queued" | "forwarding" | "expired" | "cancelled";
};

export type TimelineEvent = { id: string; contactID: string; timestamp: number; kind: string };

export type ReactionKind = "heart" | "like" | "dislike" | "laugh" | "fire" | "coffin" | "hundred" | "horror";

export type Reaction = { messageID: string; personID: string; mark: { reaction?: ReactionKind | null } };

export type Snapshot = {
  profile: { id: string; name: string; ownerId: string };
  card: Card;
  contacts: Contact[];
  messages: Message[];
  events: TimelineEvent[];
  reactions: Reaction[];
  blocked?: { id: string; card: Card }[];
  relays: string[];
  bluetooth?: { enabled?: boolean | null; scan?: string; advertise?: string; error?: string };
  owner?: string;
  version?: string;
  error?: string | null;
};

export type Failure = { kind: "text"; text: string } | { kind: "phase"; phase: string };

export type Request =
  | { command: "snapshot" }
  | { command: "send"; contact: string; text: string }
  | { command: "read"; contact: string }
  | { command: "focus"; contact: string | null }
  | { command: "typing"; contact: string; active: boolean }
  | { command: "presence"; contact: string; online: boolean }
  | { command: "accept"; contact: string }
  | { command: "decline"; contact: string }
  | { command: "invite"; contact: string }
  | { command: "reaction"; message: string; reaction: ReactionKind }
  | { command: "add"; link: string }
  | { command: "clear"; contact: string }
  | { command: "block"; contact: string; blocked: boolean }
  | { command: "profile"; name: string | null; bio: string | null; seed: null }
  | { command: "backup"; password: string; created_at: string };

export type LocalProfile = { id: string; name: string; ownerId: string };

export const inApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The browser version, loaded only there. Its errors become failures. */
async function browser<T>(use: (web: typeof import("./web/backend")) => Promise<T>): Promise<T> {
  const web = await import("./web/backend");
  try {
    return await use(web);
  } catch (error) {
    throw error instanceof Error ? { kind: "text", text: error.message } : error;
  }
}

/** Commands of the shell: the desktop app's Rust side or the browser version. */
export function shell<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inApp) return invoke<T>(command, args);
  return browser((web) => web.browserShell<T>(command, args));
}

export function call<T = unknown>(request: Request): Promise<T> {
  return inApp ? invoke<T>("request", { request }) : browser((web) => web.browserCall<T>(request));
}

const avatars = new Map<string, Promise<Uint8ClampedArray<ArrayBuffer>>>();

/** 36x36 RGBA pixels of the v1 avatar, drawn by Shum-Core. */
export function avatarPixels(seed: string): Promise<Uint8ClampedArray<ArrayBuffer>> {
  let pixels = avatars.get(seed);
  if (!pixels) {
    pixels = shell<number[]>("avatar", { seed }).then((bytes) => new Uint8ClampedArray(bytes));
    avatars.set(seed, pixels);
  }
  return pixels;
}

const reactionPictures = new Map<ReactionKind, Promise<Uint8ClampedArray<ArrayBuffer>>>();

/** 12x12 RGBA pixels of a reaction, drawn by Shum-Core. */
export function reactionPixels(kind: ReactionKind): Promise<Uint8ClampedArray<ArrayBuffer>> {
  let pixels = reactionPictures.get(kind);
  if (!pixels) {
    pixels = shell<number[]>("reaction", { kind }).then((bytes) => new Uint8ClampedArray(bytes));
    reactionPictures.set(kind, pixels);
  }
  return pixels;
}

const phaseHints: Record<string, string> = {
  incomingPending: "Сначала ответьте на приглашение.",
  outgoingPending: "Приглашение отправлено. Дождитесь ответа.",
  declinedLocally: "Вы отклонили приглашение. Его можно принять, если передумали.",
  declinedByPeer: "Собеседник отклонил приглашение.",
  accepted: "Чат уже доступен.",
  ready: "Сначала пригласите собеседника в чат.",
};

/** A failure in words for the person. */
export function describe(error: unknown): string {
  const failure = error as Failure;
  if (failure?.kind === "phase") return phaseHints[failure.phase] ?? "Действие сейчас недоступно.";
  if (failure?.kind === "text") return failure.text;
  return String(error);
}

/** Picker order, as in the CLI and iOS. */
export const reactionKinds: ReactionKind[] = ["heart", "like", "dislike", "laugh", "fire", "coffin", "hundred", "horror"];

export const reactionNames: Record<ReactionKind, string> = {
  heart: "Сердце",
  like: "Нравится",
  dislike: "Не нравится",
  laugh: "Смешно",
  fire: "Огонь",
  coffin: "Гроб",
  hundred: "100",
  horror: "Кошмар",
};

export const eventLabels: Record<string, string> = {
  invitationSent: "Приглашение отправлено. Дождитесь ответа.",
  invitationReceived: "Получено приглашение в чат.",
  invitationAccepted: "Собеседник принял приглашение. Можно общаться.",
  invitationAcceptedLocally: "Вы приняли приглашение. Можно общаться.",
  invitationDeclined: "Собеседник отклонил приглашение.",
  invitationDeclinedLocally: "Вы отклонили приглашение.",
  chatAvailable: "Чат доступен.",
};

/** Shum ID in groups of four, as the mockups show it. */
export function shortID(id: string, groups = 4) {
  return (id.match(/.{1,4}/g) ?? []).slice(0, groups).join(" ");
}

/** The fingerprint people compare in person, as the CLI and iOS show it. */
export function fingerprint(id: string) {
  return shortID(id.toUpperCase(), 3);
}

/** Bluetooth state in plain words, as the CLI says it. */
export function bluetoothStatus(snapshot: Snapshot): { text: string; on: boolean } {
  const b = snapshot.bluetooth ?? {};
  const scan = b.scan ?? "";
  const advertise = b.advertise ?? "";
  if (!inApp) return { text: "Недоступно в браузере", on: false };
  if (scan === "other_profile") return { text: "Bluetooth работает для другого выбранного профиля", on: false };
  if (scan === "disabled" || b.enabled === false) return { text: "Bluetooth отключён в настройках Shum", on: false };
  if ([scan, advertise].some((s) => /unauthorized|permission/i.test(s)))
    return { text: "Разрешите Shum: Настройки macOS → Конфиденциальность → Bluetooth", on: false };
  if (scan === "poweredOff" || advertise === "poweredOff") return { text: "Bluetooth выключен на компьютере", on: false };
  if (scan.includes("adapter not found") || advertise === "unsupported")
    return { text: "Bluetooth-адаптер не найден, переписка идёт через релей", on: false };
  if ((scan === "starting" && advertise === "starting") || (!scan && !advertise))
    return { text: "Запускается поиск устройств рядом…", on: false };
  return { text: "Поиск устройств рядом включён", on: true };
}

export function distanceLabel(contact: Contact) {
  return contact.distance != null ? `Рядом · ~${contact.distance} м` : "Рядом · расстояние неизвестно";
}
