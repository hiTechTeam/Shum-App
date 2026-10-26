// First run and new profiles: the entry screen, name, avatar and the
// security check, plus restoring a profile from a backup file.
import { useEffect, useState } from "react";
import { describe, inApp, shell } from "./core";
import { IconKey } from "./icons";
import { PixelField } from "./pixel-field";
import { Avatar, Modal } from "./ui";

type Step = "entry" | "name" | "avatar" | "security";

const securitySteps = ["Криптографические ключи", "Шифрование", "Защищённое хранилище", "Проверка"];
/** How long each security check stays in view. */
const STEP_MS = 650;

/**
 * The whole first-run flow, in the order of every Shum client: keys are made
 * and checked first, then the name and the avatar, which starts from the
 * keys. With `onCancel` it is opened from Profiles and starts with the keys;
 * without it this is the first screen of the app.
 */
export function Welcome(props: { onDone: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState<Step>(props.onCancel ? "security" : "entry");
  const [name, setName] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Prepared keys live only until the profile is created or the flow ends.
  useEffect(() => () => void shell("forget_keys").catch(() => {}), []);

  const nextSeed = async () => {
    try {
      setSeed(await shell<string>("new_avatar_seed"));
    } catch (e) {
      setError(describe(e));
    }
  };

  // Keys are made and checked in Shum-Core. The four checks light up one by
  // one at a readable pace even when Shum-Core is done at once, and the last
  // one only after it really is.
  useEffect(() => {
    if (step !== "security") return;
    let alive = true;
    let ready = false;
    let lit = 0;
    setDone(0);
    setError(null);
    const timer = setInterval(() => {
      if (lit < 3 || ready) lit += 1;
      setDone(lit);
      if (lit === 4) {
        clearInterval(timer);
        setTimeout(() => alive && setStep("name"), 700);
      }
    }, STEP_MS);
    shell<string>("prepare_keys").then(
      (initial) => {
        if (!alive) return;
        setSeed(initial);
        ready = true;
      },
      (e) => {
        clearInterval(timer);
        if (alive) setError(describe(e));
      },
    );
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [step, attempt]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await shell("create_profile", { name: name.trim(), seed });
      props.onDone();
    } catch (e) {
      setError(describe(e));
      setSaving(false);
    }
  };

  const nameOk = name.trim().length > 0 && new TextEncoder().encode(name.trim()).length <= 64;
  const dots = (active: number) => (
    <div className="dots">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i === active ? "on" : ""} />
      ))}
    </div>
  );

  return (
    <div className="welcome">
      {props.onCancel && !saving && (
        <button className="button small welcome-cancel" onClick={props.onCancel}>
          Отмена
        </button>
      )}

      {step === "entry" && <PixelField />}
      {step === "entry" && (
        <div className="entry">
          <div className="entry-text">
            <PixelTitle />
            <p>Создайте профиль и переписывайтесь со знакомыми. Номер телефона не нужен.</p>
          </div>
          <div className="entry-card">
            <h2>
              <IconKey /> Новый профиль
            </h2>
            <p>Придумайте имя и выберите аватар. Больше ничего не нужно.</p>
            <p className="muted small">Профиль хранится на этом компьютере. Ключи не покидают устройство.</p>
            <button className="button primary" onClick={() => setStep("security")}>
              Создать профиль
            </button>
            <button className="link-button" onClick={() => setRestoring(true)}>
              Восстановить из резервной копии
            </button>
          </div>
        </div>
      )}

      {step === "name" && (
        <div className="step">
          {dots(1)}
          <h1>Ваше имя?</h1>
          <p className="muted">Имя видят ваши контакты. Его можно поменять в профиле.</p>
          <label className="field-label">Имя</label>
          <input
            className="field"
            autoFocus
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameOk && setStep("avatar")}
          />
          <button className="button primary" disabled={!nameOk} onClick={() => setStep("avatar")}>
            Дальше
          </button>
        </div>
      )}

      {step === "avatar" && (
        <div className="step">
          {dots(2)}
          <h1>Ваш аватар</h1>
          <p className="muted">Пиксельный, его видят все.</p>
          <div className="avatar-ring">{seed && <Avatar card={{ name, bio: "", avatarSeed: seed }} id={seed} size={88} />}</div>
          <strong>{name.trim()}</strong>
          <div className="actions">
            <button className="button" disabled={saving} onClick={nextSeed}>
              Другой вариант
            </button>
            <button className="button primary" disabled={!seed || saving} onClick={create}>
              {saving ? "Сохраняю…" : "Готово"}
            </button>
          </div>
          {error && <p className="danger-text">{error}</p>}
          <button className="link-button" disabled={saving} onClick={() => setStep("name")}>
            Изменить имя
          </button>
        </div>
      )}

      {step === "security" && (
        <div className="step">
          {dots(0)}
          <h1>Создаём вашу защиту</h1>
          <p className="muted">Создаём ключи и проверяем шифрование. Это займёт пару секунд.</p>
          <div className="checks">
            {securitySteps.map((label, i) => (
              <div key={label} className={`check${i < done ? " done" : i === done ? " current" : ""}`}>
                <span className="check-mark">{i < done ? "✓" : ""}</span>
                {label}
              </div>
            ))}
            <div className="progress">
              <span style={{ width: `${(done / 4) * 100}%` }} />
            </div>
          </div>
          {error ? (
            <>
              <p className="danger-text">{error}</p>
              <button className="button" onClick={() => setAttempt((n) => n + 1)}>
                Попробовать ещё раз
              </button>
            </>
          ) : (
            <p className="muted small">Закрытые ключи не покидают устройство.</p>
          )}
        </div>
      )}

      {restoring && (
        <Restore
          onClose={() => setRestoring(false)}
          onDone={() => {
            setRestoring(false);
            props.onDone();
          }}
        />
      )}
    </div>
  );
}

/** Restores a profile from a .shumbackup file chosen by the person. */
export function Restore(props: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ profileName: string; createdAt: string } | null>(null);
  const [password, setPassword] = useState("");
  const [replace, setReplace] = useState(false);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (picked: File | undefined) => {
    setError(null);
    setSummary(null);
    if (!picked) return;
    const bytes = new Uint8Array(await picked.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const encoded = btoa(binary);
    try {
      setSummary(await shell("backup_summary", { file: encoded }));
      setFile(encoded);
    } catch (e) {
      setError(describe(e));
    }
  };

  return (
    <Modal title="Восстановить из резервной копии" onClose={props.onClose}>
      <p className="modal-text">
        Копия переносит профиль на этот компьютер. Пользоваться одним профилем на двух устройствах сразу так нельзя: переписка на них будет
        расходиться.
      </p>
      <label className="file-pick">
        <input type="file" accept=".shumbackup" onChange={(e) => choose(e.target.files?.[0])} />
        {summary ? `${summary.profileName} · ${new Date(summary.createdAt).toLocaleString("ru-RU")}` : "Выбрать файл копии"}
      </label>
      {summary && (
        <>
          <label className="field-label">Пароль копии</label>
          <input className="field" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </>
      )}
      {exists && (
        <label className="checkbox">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Заменить профиль на этом компьютере копией
        </label>
      )}
      {error && <p className="danger-text small">{error}</p>}
      <div className="actions">
        <button className="button" onClick={props.onClose}>
          Отмена
        </button>
        <button
          className="button primary"
          disabled={!file || !password || busy || (exists && !replace)}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await shell("restore_backup", { file, password, replace });
              props.onDone();
            } catch (e) {
              const text = describe(e);
              if (text === "Этот профиль уже есть на компьютере") setExists(true);
              setError(text);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Восстанавливаю…" : "Восстановить"}
        </button>
      </div>
    </Modal>
  );
}

// "Shum" in a 5x7 pixel face, as in the entry mockup.
const glyphs: Record<string, string[]> = {
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  h: ["#....", "#....", "#.##.", "##..#", "#...#", "#...#", "#...#"],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  "-": ["...", "...", "...", "###", "...", "...", "..."],
  " ": [".", ".", ".", ".", ".", ".", "."],
};

/** The name in the site's pixel letters; the browser version says so. */
function PixelTitle() {
  const text = inApp ? "Shum" : "Shum - Web";
  const cell = 8;
  const rects: JSX.Element[] = [];
  // Letters are as wide as their glyph, one empty column apart.
  let left = 0;
  [...text].forEach((letter, index) => {
    const glyph = glyphs[letter];
    glyph.forEach((row, y) =>
      [...row].forEach((dot, x) => {
        if (dot === "#") rects.push(<rect key={`${index}-${x}-${y}`} x={(left + x) * cell} y={y * cell} width={cell} height={cell} />);
      }),
    );
    left += glyph[0].length + 1;
  });
  const columns = left - 1;
  return (
    <svg
      className="pixel-title"
      style={{ width: `min(100%, ${columns * 9.6}px)` }}
      shapeRendering="crispEdges"
      viewBox={`0 0 ${columns * cell} ${7 * cell}`}
      role="img"
      aria-label={text}
    >
      {rects}
    </svg>
  );
}
