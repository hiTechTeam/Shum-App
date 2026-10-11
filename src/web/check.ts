// Development check of browser storage, in a separate database: ?step=create
// makes a profile and saves a change, ?step=reopen (after a real reload) opens
// it again and compares. ?step=relays connects to the default relays with a
// throwaway inbox, shows what arrives and publishes each event back. The
// result is in window.shumCheck.
import init, { WebKeys, WebProfile, defaultRelays } from "./core/shum_web.js";
import { RelayPool } from "./relays";
import { createProfile, listProfiles, openProfile, save, selectedProfile, useDatabase } from "./store";

declare global {
  interface Window {
    shumCheck?: { ok: boolean; details: unknown };
    shumRelays?: RelayPool;
  }
}

const log = (line: string) => {
  document.getElementById("log")!.textContent += line + "\n";
};

async function relays() {
  await init();
  const inbox = WebProfile.create(WebKeys.prepare(), "Проверка", undefined).inbox();
  const received: { relay: string; id: string; republished?: string }[] = [];
  window.shumCheck = { ok: false, details: { inbox, connected: [], received } };
  log(`ящик ${inbox}`);
  const pool = new RelayPool(defaultRelays(), inbox, (update) => {
    if (update.type !== "event") {
      log(`${update.type} ${update.relay}`);
    } else if (!received.some((r) => r.id === update.event.id)) {
      const entry: (typeof received)[number] = { relay: update.relay, id: update.event.id };
      received.push(entry);
      log(`событие ${update.event.id.slice(0, 12)}… от ${update.relay}`);
      pool.publish(update.event).then(
        () => ((entry.republished = "принято"), log("опубликовано обратно: принято")),
        (error) => ((entry.republished = String(error)), log(`опубликовано обратно: ${error}`)),
      );
    }
    window.shumCheck = { ok: received.length > 0, details: { inbox, connected: pool.connected(), received } };
  });
  window.shumRelays = pool;
}

async function run() {
  useDatabase("shum-check");
  const step = new URLSearchParams(location.search).get("step") ?? "create";
  if (step === "relays") {
    await relays();
  } else if (step === "create") {
    await new Promise((resolve) => {
      const r = indexedDB.deleteDatabase("shum-check");
      r.onsuccess = r.onerror = r.onblocked = resolve;
    });
    const { id, profile } = await createProfile(WebKeys.prepare(), "Проверка", "42");
    log(`создан профиль ${id.slice(0, 8)}…`);
    const state = JSON.parse(profile.state());
    state.conversations = [{ id: "c1", title: "Аня" }];
    const saved = await save(id, profile, state);
    log(`изменение сохранено: ${saved}`);
    sessionStorage.setItem("shum-check-expected", profile.state());
    window.shumCheck = { ok: saved, details: { id, persisted: await navigator.storage?.persisted?.() } };
  } else {
    const id = await selectedProfile();
    const list = await listProfiles();
    const profile = await openProfile(id!);
    const state = profile.state();
    const expected = sessionStorage.getItem("shum-check-expected");
    const card = JSON.parse(state).ownProfileCard;
    const ok = state === expected && card.name === "Проверка" && card.avatarSeed === 42;
    log(`открыт после перезагрузки: ${ok ? "совпадает" : "НЕ совпадает"}; профилей ${list.length}`);
    window.shumCheck = { ok, details: { id, profiles: list.length, conversations: JSON.parse(state).conversations } };
  }
}

run().catch((error) => {
  log(`ошибка: ${error}`);
  window.shumCheck = { ok: false, details: String(error) };
});
