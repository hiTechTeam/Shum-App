// The desktop app downloads updates in the background (src-tauri/src/updates.rs)
// and offers to restart into the new version.
import { useEffect, useState } from "react";
import { inApp, shell } from "./core";

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    if (!inApp) return;
    let stop: (() => void) | undefined;
    shell<string | null>("update_ready").then(setVersion).catch(() => {});
    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<string>("update-ready", (event) => setVersion(event.payload)).then((unlisten) => (stop = unlisten)),
    );
    return () => stop?.();
  }, []);
  if (!version) return null;
  return (
    <div className="update">
      <span>Скачана новая версия Shum {version}</span>
      <button
        className="button primary"
        disabled={installing}
        onClick={() => {
          setInstalling(true);
          shell("install_update").catch(() => setInstalling(false));
        }}
      >
        {installing ? "Устанавливаю…" : "Перезапустить"}
      </button>
    </div>
  );
}
