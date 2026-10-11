// Your own profile: name and avatar, QR code, local profiles and backup.
import { useEffect, useState } from "react";
import { bluetoothStatus, describe, fingerprint, inApp, shell, shortID, type LocalProfile, type Request, type Snapshot } from "./core";
import { IconPanel } from "./icons";
import { Avatar, CopyRow } from "./ui";

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
  const owner = snapshot.owner === "desktop" ? "приложение" : snapshot.owner === "preview" ? "предпросмотр" : "служба CLI";

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

function Profiles(props: { snapshot: Snapshot; notify: (text: string) => void; onSwitched: () => void }) {
  const [list, setList] = useState<{ selected: string | null; profiles: LocalProfile[] } | null>(null);
  const load = () => shell<{ selected: string | null; profiles: LocalProfile[] }>("profiles").then(setList, (e) => props.notify(describe(e)));
  useEffect(() => {
    load();
  }, []); // eslint-disable-line
  return (
    <div className="page">
      <div className="page-column">
        <h2 className="page-title">Профили</h2>
        <p className="muted">У каждого профиля свои ключи, контакты и переписка. Новый профиль пока создаётся командой shum init.</p>
        {list?.profiles.map((p) => {
          const open = p.id === list.selected;
          return (
            <div key={p.id} className={`profile-row${open ? " open" : ""}`}>
              <Avatar card={open ? props.snapshot.card : { name: p.name, bio: "" }} id={p.ownerId} size={40} />
              <div className="profile-text">
                <strong>{p.name}</strong>
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
            </div>
          );
        })}
      </div>
    </div>
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
          disabled={!ready || !inApp}
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
