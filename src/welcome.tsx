// First run and new profiles: the entry screen, name, avatar and the
// security check, plus restoring a profile from a backup file.
import { useEffect, useState } from "react";
import { describe, shell } from "./core";
import { IconKey } from "./icons";
import { Avatar, Modal } from "./ui";

type Step = "entry" | "name" | "avatar" | "security";

const securitySteps = ["Криптографические ключи", "Шифрование", "Защищённое хранилище", "Проверка"];

/**
 * The whole first-run flow. With `onCancel` it is opened from Profiles and
 * starts at the name; without it this is the first screen of the app.
 */
export function Welcome(props: { onDone: () => void; onCancel?: () => void; restore?: boolean }) {
  const [step, setStep] = useState<Step>(props.onCancel ? "name" : "entry");
  const [name, setName] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(!!props.restore);

  const nextSeed = async () => {
    try {
      setSeed(await shell<string>("new_avatar_seed"));
    } catch (e) {
      setError(describe(e));
    }
  };

  useEffect(() => {
    if (step === "avatar" && !seed) nextSeed();
  }, [step]); // eslint-disable-line

  // Keys are prepared and checked in Shum-Core; the steps light up meanwhile.
  useEffect(() => {
    if (step !== "security" || !seed) return;
    setDone(0);
    setError(null);
    const timer = setInterval(() => setDone((n) => Math.min(n + 1, 3)), 350);
    shell("create_profile", { name: name.trim(), seed }).then(
      () => {
        clearInterval(timer);
        setDone(4);
        setTimeout(props.onDone, 500);
      },
      (e) => {
        clearInterval(timer);
        setError(describe(e));
      },
    );
    return () => clearInterval(timer);
  }, [step]); // eslint-disable-line

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
      {props.onCancel && step !== "security" && (
        <button className="button small welcome-cancel" onClick={props.onCancel}>
          Отмена
        </button>
      )}

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
            <button className="button primary" onClick={() => setStep("name")}>
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
          {dots(0)}
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
          {dots(1)}
          <h1>Ваш аватар</h1>
          <p className="muted">Пиксельный, его видят все.</p>
          <div className="avatar-ring">{seed && <Avatar card={{ name, bio: "", avatarSeed: seed }} id={seed} size={88} />}</div>
          <strong>{name.trim()}</strong>
          <div className="actions">
            <button className="button" onClick={nextSeed}>
              Другой вариант
            </button>
            <button className="button primary" disabled={!seed} onClick={() => setStep("security")}>
              Дальше
            </button>
          </div>
          <button className="link-button" onClick={() => setStep("name")}>
            Изменить имя
          </button>
        </div>
      )}

      {step === "security" && (
        <div className="step">
          {dots(2)}
          <h1>Создаём вашу защиту</h1>
          <p className="muted">Шифруем базу и проверяем ключи. Это займёт пару секунд.</p>
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
              <button className="button" onClick={() => setStep("avatar")}>
                Назад
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
};

function PixelTitle() {
  const cell = 8;
  const rects: JSX.Element[] = [];
  [..."Shum"].forEach((letter, index) =>
    glyphs[letter].forEach((row, y) =>
      [...row].forEach((dot, x) => {
        if (dot === "#") rects.push(<rect key={`${index}-${x}-${y}`} x={(index * 6 + x) * cell} y={y * cell} width={cell} height={cell} />);
      }),
    ),
  );
  return (
    <svg className="pixel-title" viewBox={`0 0 ${(4 * 6 - 1) * cell} ${7 * cell}`} role="img" aria-label="Shum">
      {rects}
    </svg>
  );
}
