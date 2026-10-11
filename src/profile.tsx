// Your own profile: name and avatar, QR code, local profiles and backup.
import { useEffect, useState } from "react";
import { bluetoothStatus, describe, fingerprint, shell, shortID, type Card, type LocalProfile, type Request, type Snapshot } from "./core";
import { IconPanel } from "./icons";
import { Avatar, CopyRow, Modal } from "./ui";

export type Section = "me" | "qr" | "profiles" | "backup";

const sections: { id: Section; label: string }[] = [
  { id: "me", label: "Мой профиль" },
  { id: "qr", label: "Мой QR-код" },
  { id: "profiles", label: "Профили" },
  { id: "backup", label: "Резервная копия" },
];

export function ProfileNav(props: { section: Section; onSelect: (section: Section) => void; onCollapse: () => void }) {
  return (
    <aside className="list">
      <header className="list-header">
        <h1>Профиль</h1>
        <button className="icon-button" title="Свернуть список" onClick={props.onCollapse}>
          <IconPanel />
        </button>
      </header>
      <ul className="rows nav">
        {sections.map((s) => (
          <li key={s.id}>
            <button className={`nav-item${s.id === props.section ? " selected" : ""}`} onClick={() => props.onSelect(s.id)}>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function ProfilePage(props: {
  section: Section;
  snapshot: Snapshot;
  act: (request: Request) => Promise<void>;
  notify: (text: string) => void;
  onSwitched: () => void;
  onCreate: () => void;
  onRestore: () => void;
}) {
  switch (props.section) {
    case "me":
      return <Me {...props} />;
    case "qr":
      return <Qr />;
    case "profiles":
      return <Profiles {...props} />;
    case "backup":
      return <Backup {...props} />;
  }
}

function Me(props: { snapshot: Snapshot; act: (request: Request) => Promise<void>; notify: (text: string) => void }) {
  const { snapshot } = props;
  const id = snapshot.profile.ownerId;
  const [name, setName] = useState(snapshot.card.name);
  useEffect(() => setName(snapshot.card.name), [snapshot.card.name]);
  const network = snapshot.card.nostrKey ?? "";
  const bluetooth = bluetoothStatus(snapshot);
  const owner = snapshot.owner === "desktop" ? "приложение" : snapshot.owner === "browser" ? "браузер" : "служба CLI";

  const saveName = () => {
    const value = name.trim();
    if (value && value !== snapshot.card.name) props.act({ command: "profile", name: value, bio: null, seed: null });
  };

  return (
    <div className="page">
      <div className="page-column">
        <h2 className="page-title">Мой профиль</h2>
        <div className="me">
          <div className="me-avatar">
            <Avatar card={snapshot.card} id={id} size={88} />
            <button
              className="button small"
              onClick={async () => {
                try {
                  const seed = await shell<string>("new_avatar_seed");
                  await shell("set_avatar", { seed });
                } catch (error) {
                  props.notify(describe(error));
                }
              }}
            >
              Другой вариант
            </button>
          </div>
          <div className="me-name">
            <label className="field-label">Имя</label>
            <input
              className="field"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <p className="muted small">Сохраняется само, когда вы выходите из поля.</p>
          </div>
        </div>
        <section className="panel">
          <CopyRow label="Shum ID" value={id} shown={shortID(id)} />
          {network && <CopyRow label="Сетевой ID" value={network} shown={`${network.slice(0, 8)}…${network.slice(-4)}`} />}
          <div className="info-row">
            <span className="info-label">Отпечаток</span>
            <span className="info-value">{fingerprint(id)}</span>
          </div>
        </section>
        <section className="panel">
          <h3>Состояние сети</h3>
          <div className="info-row">
            <span className="info-label">
              <span className={`dot${snapshot.relays.length ? " on" : ""}`} /> Релеи
            </span>
            <span className="info-value">{snapshot.relays.length ? `${snapshot.relays.length} подключено` : "нет связи"}</span>
          </div>
          <div className="info-row">
            <span className="info-label">
              <span className={`dot${bluetooth.on ? " on" : ""}`} /> Рядом
            </span>
            <span className="info-value">{bluetooth.text}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Профиль ведёт</span>
            <span className="info-value">
              {owner}
              {snapshot.version ? ` ${snapshot.version}` : ""} · протокол v1
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function Qr() {
  const [invitation, setInvitation] = useState<{ link: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    shell<{ link: string; qr: string }>("own_invitation").then(setInvitation, (e) => setError(describe(e)));
  }, []);
  return (
    <div className="page">
      <div className="page-column">
        <h2 className="page-title">Мой QR-код</h2>
        <p className="muted">Покажите код или отправьте ссылку: человек добавит вас в контакты и сможет пригласить в чат.</p>
        {error && <p className="muted">{error}</p>}
        {invitation?.qr && <div className="qr" dangerouslySetInnerHTML={{ __html: invitation.qr }} />}
        {invitation && (
          <section className="panel">
            <CopyRow label="Ссылка" value={invitation.link} shown={`${invitation.link.slice(0, 24)}…`} />
          </section>
        )}
      </div>
    </div>
  );
}

function Profiles(props: {
  snapshot: Snapshot;
  notify: (text: string) => void;
  onSwitched: () => void;
  onCreate: () => void;
  onRestore: () => void;
}) {
  const [list, setList] = useState<{ selected: string | null; profiles: LocalProfile[] } | null>(null);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [deleting, setDeleting] = useState<LocalProfile | null>(null);
  const load = async () => {
    try {
      const loaded = await shell<{ selected: string | null; profiles: LocalProfile[] }>("profiles");
      setList(loaded);
      // Each profile shows its own avatar, read without opening it here.
      for (const p of loaded.profiles) {
        shell<{ card?: Card } | null>("profile_preview", { id: p.id })
          .then((preview) => preview?.card && setCards((all) => ({ ...all, [p.id]: preview.card! })))
          .catch(() => {});
      }
    } catch (e) {
      props.notify(describe(e));
    }
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line
  return (
    <div className="page">
      <div className="page-column">
        <h2 className="page-title">Профили</h2>
        <p className="muted">У каждого профиля свои ключи, контакты и переписка. Открыт один профиль за раз.</p>
        <div className="row-actions">
          <button className="button primary small" onClick={props.onCreate}>
            Новый профиль
          </button>
          <button className="button small" onClick={props.onRestore}>
            Восстановить из копии
          </button>
        </div>
        {list?.profiles.map((p) => {
          const open = p.id === list.selected;
          const card = open ? props.snapshot.card : cards[p.id] ?? { name: p.name, bio: "" };
          return (
            <div key={p.id} className={`profile-row${open ? " open" : ""}`}>
              <Avatar card={card} id={p.ownerId} size={40} />
              <div className="profile-text">
                <strong>{card.name || p.name}</strong>
                <span className="muted small">Shum ID: {p.ownerId.slice(0, 4)}…{p.ownerId.slice(-4)}</span>
              </div>
              {open ? (
                <span className="accent-text">Открыт</span>
              ) : (
                <button
                  className="button small"
                  onClick={async () => {
                    try {
                      await shell("switch_profile", { id: p.id });
                      await load();
                      props.onSwitched();
                    } catch (error) {
                      props.notify(describe(error));
                    }
                  }}
                >
                  Переключиться
                </button>
              )}
              <button className="link-button danger" onClick={() => setDeleting(p)}>
                Удалить
              </button>
            </div>
          );
        })}
      </div>
      {deleting && (
        <DeleteProfile
          profile={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            const wasOpen = deleting.id === list?.selected;
            setDeleting(null);
            await load();
            if (wasOpen) props.onSwitched();
          }}
        />
      )}
    </div>
  );
}

/** Deleting a profile asks for its name, as the mockup and the CLI do. */
function DeleteProfile(props: { profile: LocalProfile; onClose: () => void; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = props.profile.name;
  return (
    <Modal title={`Удалить профиль «${name}»?`} onClose={props.onClose}>
      <p className="modal-text">
        Ключи, контакты и переписка этого профиля удалятся с компьютера безвозвратно. Если профиль понадобится, сначала сохраните резервную
        копию.
      </p>
      <label className="field-label">Введите имя профиля для подтверждения</label>
      <input className="field" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} />
      {error && <p className="danger-text small">{error}</p>}
      <div className="actions">
        <button className="button" onClick={props.onClose}>
          Отмена
        </button>
        <button
          className="button danger"
          disabled={typed.trim() !== name || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await shell("delete_profile", { id: props.profile.id, confirm: typed });
              props.onDeleted();
            } catch (e) {
              setError(describe(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "Удаляю…" : "Удалить"}
        </button>
      </div>
    </Modal>
  );
}

function Backup(props: { notify: (text: string) => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const long = [...new Intl.Segmenter().segment(password)].length >= 10;
  const ready = long && password === repeat && !saving;
  return (
    <div className="page">
      <div className="page-column">
        <h2 className="page-title">Резервная копия</h2>
        <p className="muted">
          Копия хранит ключи, контакты и переписку этого профиля. Из неё можно восстановить профиль на новом компьютере или в CLI. Файл защищён
          паролем: без пароля его не открыть, и восстановить пароль нельзя.
        </p>
        <label className="field-label">Пароль, не короче 10 символов</label>
        <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="field-label">Пароль ещё раз</label>
        <input className="field" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        {repeat && password !== repeat && <p className="danger-text small">Пароли не совпадают</p>}
        <button
          className="button primary wide"
          disabled={!ready}
          onClick={async () => {
            setSaving(true);
            try {
              setSaved(await shell<string>("save_backup", { password }));
              setPassword("");
              setRepeat("");
            } catch (error) {
              props.notify(describe(error));
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Сохраняю…" : "Сохранить копию в «Загрузки»"}
        </button>
        {saved && (
          <p className="panel">
            Копия сохранена: {saved}
            <br />
            Храните файл и пароль отдельно.
          </p>
        )}
      </div>
    </div>
  );
}
