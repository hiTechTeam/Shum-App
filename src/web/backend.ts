// The browser version's answers to the interface: the same requests and
// shell commands the desktop app sends to its Rust side, served by Shum-Core
// in WebAssembly with profiles in IndexedDB and relays over WebSocket.
import type { Request } from "../core";
import {
  WebKeys,
  avatarPixels,
  backupSummary,
  defaultRelays,
  newAvatarSeed,
  presencePattern,
  stickerPixels,
  stickerSetPixels,
  stickerSets,
  validateName,
} from "./core/shum_web.js";
import { BrowserSession } from "./session";
import { createProfile, deleteProfile, listProfiles, openProfile, ready, restoreProfile, selectProfile, selectedProfile } from "./store";

let open: Promise<BrowserSession | null> | null = null;
/** Keys of the profile being created: made first, before the name and avatar. */
let prepared: WebKeys | null = null;

function forget() {
  prepared?.free();
  prepared = null;
}

const failure = (text: string) => ({ kind: "text", text });
const SOON = failure("В браузерной версии это появится в следующем обновлении");

/** Releases the lock of the open profile, see `hold`. */
let release: (() => void) | null = null;

function close() {
  const closing = open;
  open = null;
  closing?.then((session) => {
    session?.close();
    release?.();
    release = null;
  });
}

/**
 * Takes the browser-wide lock of a profile, like the profile lock of native
 * clients: two tabs running one profile would write over each other's
 * records. Returns the release, or null while another tab holds it.
 */
function hold(id: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    navigator.locks
      .request(`shum-profile-${id}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        return new Promise<void>((done) => resolve(done));
      })
      .catch(() => resolve(null));
  });
}

/** The selected profile's session, started once. */
function current(): Promise<BrowserSession | null> {
  open ??= (async () => {
    await ready();
    const id = await selectedProfile();
    if (!id) return null;
    const entry = (await listProfiles()).find((p) => p.id === id);
    if (!entry) return null;
    const unlock = await hold(id);
    if (!unlock) throw failure("Shum уже открыт в другой вкладке. Продолжайте там или закройте ту вкладку: эта откроется сама.");
    try {
      const profile = await openProfile(id);
      const session = new BrowserSession(id, profile, entry.name, defaultRelays());
      release = unlock;
      return session;
    } catch (error) {
      unlock();
      throw error;
    }
  })();
  open.catch(() => (open = null));
  return open;
}

async function session(): Promise<BrowserSession> {
  const session = await current();
  if (!session) throw failure("Профиль не выбран");
  return session;
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export async function browserCall<T>(request: Request): Promise<T> {
  const s = await session();
  if (request.command === "snapshot") return s.snapshot() as T;
  return s.request<T>(request);
}

export async function browserShell<T>(command: string, args: Record<string, unknown>): Promise<T> {
  await ready();
  switch (command) {
    case "profiles":
      return { selected: await selectedProfile(), profiles: await listProfiles() } as T;
    case "prepare_keys": {
      forget();
      prepared = WebKeys.prepare();
      return prepared.initialSeed() as T;
    }
    case "forget_keys":
      forget();
      return undefined as T;
    case "create_profile": {
      const name = String(args.name ?? "").trim();
      validateName(name);
      if (!prepared) throw failure("Ключи не подготовлены, начните создание профиля заново");
      const keys = prepared;
      prepared = null;
      close();
      const { profile } = await createProfile(keys, name, args.seed ? String(args.seed) : undefined);
      profile.free();
      return undefined as T;
    }
    case "switch_profile":
      close();
      await selectProfile(String(args.id));
      return undefined as T;
    case "delete_profile": {
      const id = String(args.id);
      const list = await listProfiles();
      const entry = list.find((p) => p.id === id);
      if (!entry) throw failure("Профиль не найден");
      if (String(args.confirm ?? "").trim() !== entry.name) throw failure("Имя не совпало, удаление отменено");
      const wasSelected = (await selectedProfile()) === id;
      if (wasSelected) close();
      await deleteProfile(id);
      const next = list.find((p) => p.id !== id);
      if (wasSelected && next) await selectProfile(next.id);
      return undefined as T;
    }
    case "profile_preview": {
      const id = String(args.id);
      const open = await current();
      if (open?.id === id) return { card: open.snapshot().card } as T;
      const profile = await openProfile(id);
      try {
        return { card: JSON.parse(profile.card()) } as T;
      } finally {
        profile.free();
      }
    }
    case "own_invitation":
      return JSON.parse((await session()).invitation()) as T;
    case "set_avatar": {
      // Seeds are 64-bit: they go to Shum-Core as written, never as a JavaScript number.
      const seed = String(args.seed);
      if (!/^\d{1,20}$/.test(seed)) throw failure("Неверный аватар");
      await (await session()).request(`{"command":"profile","name":null,"bio":null,"seed":${seed}}`);
      return undefined as T;
    }
    case "save_backup": {
      const s = await session();
      // RFC 3339 UTC with whole seconds, as protocol section 13 asks.
      const createdAt = new Date().toISOString().slice(0, 19) + "Z";
      const reply = await s.request<{ file: string }>({ command: "backup", password: String(args.password), created_at: createdAt });
      const name = (s.snapshot().card.name || "profile").replace(/[^\p{L}\p{N}_-]/gu, "-");
      const fileName = `Shum-${name}-${createdAt.slice(0, 10)}.shumbackup`;
      const bytes = Uint8Array.from(atob(reply.file), (c) => c.charCodeAt(0));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      return fileName as T;
    }
    case "backup_summary":
      return JSON.parse(backupSummary(fromBase64(String(args.file)))) as T;
    case "restore_backup":
      close();
      await restoreProfile(fromBase64(String(args.file)), String(args.password), !!args.replace);
      return undefined as T;
    case "new_avatar_seed":
      return newAvatarSeed() as T;
    case "avatar":
      return Array.from(avatarPixels(String(args.seed))) as T;
    case "reaction":
      return Array.from(stickerPixels(String(args.kind))) as T;
    case "sticker_set":
      return Array.from(stickerSetPixels(String(args.set))) as T;
    case "sticker_sets":
      return stickerSets() as T;
    case "presence_pattern":
      return Array.from(presencePattern(String(args.seed)), Boolean) as T;
    default:
      throw SOON;
  }
}
