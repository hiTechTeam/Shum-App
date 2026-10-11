// Browser storage for Shum profiles. Shum-Core (WebAssembly, shum-web) keeps
// a profile in memory and says what to store; this module stores it on the
// device in IndexedDB:
//   profiles  one entry per profile: its key bundle sealed with a
//             non-extractable WebCrypto key that is stored next to it
//   records   the profile's encrypted records (protocol section 09), the same
//             layout native clients keep in SQLite
//   meta      which profile is open
// Every save is one IndexedDB transaction; Shum-Core takes the new state only
// after it completed.
import init, { WebKeys, WebProfile } from "./core/shum_web.js";

export { WebKeys, WebProfile };

type Entry = {
  id: string;
  name: string;
  ownerId: string;
  key: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  sealed: ArrayBuffer;
  created: number;
};
type StoredRecord = { profile: string; bucket: string; id: string; position: number; payload: string };
export type Plan = { write: Omit<StoredRecord, "profile">[]; delete: [string, string][] };

let database = "shum";
let opened: Promise<IDBDatabase> | null = null;
let loaded: Promise<unknown> | null = null;

/** Use another database, for checks that must not touch real profiles. */
export function useDatabase(name: string) {
  database = name;
  opened = null;
}

export function ready() {
  loaded ??= init();
  return loaded;
}

function db(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore("profiles", { keyPath: "id" });
      d.createObjectStore("records", { keyPath: ["profile", "bucket", "id"] }).createIndex("profile", "profile");
      d.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const d = request.result;
      // A newer version elsewhere must not wait on this tab forever.
      d.onversionchange = () => d.close();
      resolve(d);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Shum открыт в другой вкладке. Закройте её и обновите эту страницу."));
  });
  opened.catch(() => (opened = null));
  return opened;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

const encoder = new TextEncoder();

/** The profile ID binds the sealed bundle to its entry. */
function sealParams(iv: Uint8Array<ArrayBuffer>, id: string): AesGcmParams {
  return { name: "AES-GCM", iv, additionalData: encoder.encode(id) };
}

/** Creates a profile from prepared keys and stores it before returning it. */
export async function createProfile(
  keys: WebKeys,
  name: string,
  avatarSeed?: string,
): Promise<{ id: string; profile: WebProfile }> {
  await ready();
  const profile = WebProfile.create(keys, name, avatarSeed);
  return { id: await add(profile, name), profile };
}

/** Restores a backup file as a new selected profile. With `replace` a
 *  profile of the same identity is removed first; without it that is an error. */
export async function restoreProfile(file: Uint8Array, password: string, replace: boolean): Promise<string> {
  await ready();
  const profile = WebProfile.restore(file, password);
  try {
    const id = profile.ownerId();
    if ((await listProfiles()).some((p) => p.id === id)) {
      if (!replace) throw new Error("Этот профиль уже есть на компьютере");
      await deleteProfile(id);
    }
    return await add(profile, JSON.parse(profile.card()).name);
  } finally {
    profile.free();
  }
}

/** Stores a new profile and selects it. */
async function add(profile: WebProfile, name: string): Promise<string> {
  const id = profile.ownerId();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // wasm-bindgen copies a returned Vec<u8> into a fresh ArrayBuffer.
  const bundle = profile.keyBundle() as Uint8Array<ArrayBuffer>;
  const sealed = await crypto.subtle.encrypt(sealParams(iv, id), key, bundle);
  bundle.fill(0);
  const records: Omit<StoredRecord, "profile">[] = JSON.parse(profile.records());
  const d = await db();
  const tx = d.transaction(["profiles", "records", "meta"], "readwrite");
  const entry: Entry = { id, name: name.trim(), ownerId: id, key, iv, sealed, created: Date.now() };
  tx.objectStore("profiles").put(entry);
  for (const record of records) tx.objectStore("records").put({ ...record, profile: id });
  tx.objectStore("meta").put({ key: "selected", value: id });
  await finished(tx);
  // Ask the browser not to clear the profile under storage pressure.
  await navigator.storage?.persist?.().catch(() => false);
  return id;
}

/** Local profiles, oldest first. */
export async function listProfiles(): Promise<{ id: string; name: string; ownerId: string }[]> {
  const d = await db();
  const entries: Entry[] = await result(d.transaction("profiles").objectStore("profiles").getAll());
  return entries.sort((a, b) => a.created - b.created).map(({ id, name, ownerId }) => ({ id, name, ownerId }));
}

export async function selectedProfile(): Promise<string | null> {
  const d = await db();
  const meta = await result(d.transaction("meta").objectStore("meta").get("selected"));
  return (meta as { value?: string } | undefined)?.value ?? null;
}

/** Makes `id` the profile that opens next time. */
export async function selectProfile(id: string) {
  const d = await db();
  const tx = d.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ key: "selected", value: id });
  await finished(tx);
}

/** Opens a stored profile: unseals its keys and checks every record. */
export async function openProfile(id: string): Promise<WebProfile> {
  await ready();
  const d = await db();
  // Both reads are queued before waiting: Safari may end a transaction
  // while a promise between its requests resolves.
  const tx = d.transaction(["profiles", "records"]);
  const [entry, records] = await Promise.all([
    result<Entry | undefined>(tx.objectStore("profiles").get(id)),
    result<StoredRecord[]>(tx.objectStore("records").index("profile").getAll(id)),
  ]);
  if (!entry) throw new Error("Профиль не найден");
  const bundle = new Uint8Array(await crypto.subtle.decrypt(sealParams(entry.iv, id), entry.key, entry.sealed));
  const stored = records.map(({ bucket, id: index, position, payload }) => ({ bucket, id: index, position, payload }));
  let profile: WebProfile;
  try {
    profile = WebProfile.open(bundle, JSON.stringify(stored));
  } finally {
    bundle.fill(0);
  }
  const pending = profile.pendingPlan();
  if (pending) {
    await persist(id, JSON.parse(pending));
    profile.applied();
  }
  return profile;
}

/** Saves a new state of an open profile. Returns false when nothing changed. */
export async function save(id: string, profile: WebProfile, state: unknown): Promise<boolean> {
  const plan = profile.plan(JSON.stringify(state));
  if (!plan) return false;
  await persist(id, JSON.parse(plan));
  profile.applied();
  return true;
}

/** Stores a plan of Shum-Core's records in one transaction. */
export async function persist(id: string, plan: Plan) {
  const d = await db();
  const tx = d.transaction("records", "readwrite");
  const records = tx.objectStore("records");
  for (const record of plan.write) records.put({ ...record, profile: id });
  for (const [bucket, index] of plan.delete) records.delete([id, bucket, index]);
  await finished(tx);
}

/** Keeps the local list's name in step with the profile's card. */
export async function renameProfile(id: string, name: string) {
  const d = await db();
  const tx = d.transaction("profiles", "readwrite");
  const profiles = tx.objectStore("profiles");
  // The write follows the read inside its event, so the transaction stays
  // active in every browser.
  const read = profiles.get(id);
  read.onsuccess = () => {
    const entry: Entry | undefined = read.result;
    if (entry) profiles.put({ ...entry, name });
  };
  await finished(tx);
}

/** Removes a profile and all its records from this browser. */
export async function deleteProfile(id: string) {
  const d = await db();
  const tx = d.transaction(["profiles", "records", "meta"], "readwrite");
  tx.objectStore("profiles").delete(id);
  // Deletes follow their reads inside the read events, so the transaction
  // stays active in every browser.
  const keys = tx.objectStore("records").index("profile").getAllKeys(id);
  keys.onsuccess = () => {
    for (const key of keys.result) tx.objectStore("records").delete(key);
  };
  const meta = tx.objectStore("meta").get("selected");
  meta.onsuccess = () => {
    if ((meta.result as { value?: string } | undefined)?.value === id) tx.objectStore("meta").delete("selected");
  };
  await finished(tx);
}
