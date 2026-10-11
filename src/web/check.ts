// Development check of browser storage, in a separate database: ?step=create
// makes a profile and saves a change, ?step=reopen (after a real reload) opens
// it again and compares. The result is in window.shumCheck.
import { createProfile, listProfiles, openProfile, save, selectedProfile, useDatabase } from "./store";

declare global {
  interface Window {
    shumCheck?: { ok: boolean; details: unknown };
  }
}

const log = (line: string) => {
  document.getElementById("log")!.textContent += line + "\n";
};

async function run() {
  useDatabase("shum-check");
  const step = new URLSearchParams(location.search).get("step") ?? "create";
  if (step === "create") {
    await new Promise((resolve) => {
      const r = indexedDB.deleteDatabase("shum-check");
      r.onsuccess = r.onerror = r.onblocked = resolve;
    });
    const { id, profile } = await createProfile("Проверка", "42");
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
