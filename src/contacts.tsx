// Contacts: the list with blocked people apart, and one contact's card.
import { useMemo, useState } from "react";
import { call, describe, fingerprint, shortID, type Card, type Request, type Snapshot } from "./core";
import { IconPanel, IconPlus, IconSearch } from "./icons";
import { Avatar, Confirm, CopyRow, Modal } from "./ui";

type Person = { id: string; card: Card; blocked: boolean };

export function ContactList(props: {
  snapshot: Snapshot;
  selected: string | null;
  onSelect: (id: string) => void;
  onCollapse: () => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const text = query.trim().toLocaleLowerCase("ru");
  const match = (p: { card: Card }) => !text || p.card.name.toLocaleLowerCase("ru").includes(text);
  const contacts = props.snapshot.contacts.filter(match);
  const blocked = (props.snapshot.blocked ?? []).filter(match);

  const row = (p: { id: string; card: Card }, isBlocked: boolean) => (
    <li key={p.id}>
      <button className={`row${p.id === props.selected ? " selected" : ""}${isBlocked ? " dim" : ""}`} onClick={() => props.onSelect(p.id)}>
        <Avatar card={p.card} id={p.id} size={40} />
        <span className="row-text">
          <span className="row-top">
            <strong>{p.card.name}</strong>
          </span>
          <span className="row-bottom">
            <span className="preview">
              {isBlocked ? "Заблокирован · " : ""}Shum ID: {p.id.slice(0, 4)}…{p.id.slice(-4)}
            </span>
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <aside className="list">
      <header className="list-header">
        <h1>Контакты</h1>
        <button className="icon-button" title="Свернуть список" onClick={props.onCollapse}>
          <IconPanel />
        </button>
        <button className="icon-button accent" title="Добавить контакт" onClick={props.onAdd}>
          <IconPlus />
        </button>
      </header>
      <label className="search">
        <IconSearch />
        <input placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className="rows spaced">
        {contacts.map((c) => row(c, false))}
        {contacts.length === 0 && <li className="list-empty">Контактов пока нет</li>}
        {blocked.length > 0 && <li className="section-title">Заблокированные</li>}
        {blocked.map((b) => row(b, true))}
      </ul>
    </aside>
  );
}

export function ContactCard(props: {
  snapshot: Snapshot;
  id: string;
  onWrite: (id: string) => void;
  act: (request: Request) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"clear" | "block" | null>(null);
  const person = useMemo<Person | null>(() => {
    const contact = props.snapshot.contacts.find((c) => c.id === props.id);
    if (contact) return { id: contact.id, card: contact.card, blocked: false };
    const blocked = props.snapshot.blocked?.find((b) => b.id === props.id);
    return blocked ? { id: blocked.id, card: blocked.card, blocked: true } : null;
  }, [props.snapshot, props.id]);

  if (!person) return <div className="empty">Контакт не найден</div>;
  const name = person.card.name;
  const network = person.card.nostrKey ?? "";

  return (
    <div className="page">
      <div className="page-column">
        <div className="person">
          <Avatar card={person.card} id={person.id} size={72} />
          <h2>{name}</h2>
        </div>
        {!person.blocked && (
          <button className="button primary wide" onClick={() => props.onWrite(person.id)}>
            Написать
          </button>
        )}
        <section className="panel">
          <CopyRow label="Shum ID" value={person.id} shown={shortID(person.id)} />
          {network && <CopyRow label="Сетевой ID" value={network} shown={`${network.slice(0, 8)}…${network.slice(-4)}`} />}
        </section>
        <section className="panel">
          <h3>Сверка ключей</h3>
          <p className="muted">
            Сравните отпечаток при встрече: у {name} он в Профиль → Мой профиль. Если цифры совпали, переписку никто не подменил.
          </p>
          <p className="fingerprint">{fingerprint(person.id)}</p>
        </section>
        <div className="text-actions">
          {!person.blocked && (
            <button className="link-button muted" onClick={() => setConfirm("clear")}>
              Очистить чат здесь
            </button>
          )}
          {person.blocked ? (
            <button className="link-button" onClick={() => props.act({ command: "block", contact: person.id, blocked: false })}>
              Разблокировать
            </button>
          ) : (
            <button className="link-button danger" onClick={() => setConfirm("block")}>
              Заблокировать
            </button>
          )}
        </div>
      </div>
      {confirm === "clear" && (
        <Confirm
          title={`Очистить чат с ${name}?`}
          text="Переписка удалится только на этом устройстве. У собеседника она останется."
          action="Очистить"
          danger
          onConfirm={() => props.act({ command: "clear", contact: person.id })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "block" && (
        <Confirm
          title={`Заблокировать ${name}?`}
          text="Сообщения и приглашения от этого человека перестанут приходить. Разблокировать можно здесь же, в разделе «Заблокированные»."
          action="Заблокировать"
          danger
          onConfirm={() => props.act({ command: "block", contact: person.id, blocked: true })}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/**
 * Adds a person by their invitation link, or finds them by network ID and
 * invites them. Over the internet a person is found only by network ID:
 * relays deliver to it, while a Shum ID is a fingerprint of the keys.
 */
type Found = { card: Card; link: string; contactID: string };

export function AddContact(props: { contacts: string[]; act: (request: Request) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = value.trim();
  const link = /^shum:\/\//i.test(text) || text.includes("/");
  const known = !link && text.length >= 8 && text.length < 64;
  const added = found ? props.contacts.includes(found.contactID) : false;
  // Nothing is added until the person is seen: a network ID waits for them to answer.
  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      setFound(await call<Found>({ command: "find", contact: text }));
    } catch (e) {
      setError(describe(e));
    }
    setBusy(false);
  };
  const add = async (invite: boolean) => {
    if (!found) return;
    setBusy(true);
    await props.act({ command: "add", link: found.link });
    if (invite) await props.act({ command: "invite", contact: found.contactID });
    setBusy(false);
    props.onClose();
  };
  return (
    <Modal title="Добавить контакт" onClose={props.onClose}>
      {found ? (
        <div className="found">
          <Avatar card={found.card} id={found.contactID} size={72} />
          <h2>{found.card.name}</h2>
          {found.card.bio && <p className="muted">{found.card.bio}</p>}
          <p className="muted small">Shum ID: {shortID(found.contactID)}</p>
          {added ? (
            <>
              <p className="muted small">Уже в ваших контактах.</p>
              <div className="actions">
                <button className="button primary" onClick={props.onClose}>
                  Готово
                </button>
              </div>
            </>
          ) : (
            <div className="actions">
              <button className="button" disabled={busy} onClick={() => add(false)}>
                Только добавить
              </button>
              <button className="button primary" disabled={busy} onClick={() => add(true)}>
                Пригласить в чат
              </button>
            </div>
          )}
          <button className="link-button muted" onClick={() => setFound(null)}>
            Искать другого
          </button>
        </div>
      ) : (
        <>
          <label className="field-label">Ссылка или сетевой ID</label>
          <form
            className="field-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (text && !busy) search();
            }}
          >
            <input className="field" autoFocus placeholder="shum://… или 64 символа" value={value} onChange={(e) => setValue(e.target.value)} />
            <button className="button primary" disabled={!text || busy}>
              {busy ? "Ищу…" : "Найти"}
            </button>
          </form>
          {error && <p className="danger-text small">{error}</p>}
          <p className="muted small">
            {known
              ? "Короткий Shum ID для поиска не подходит: нужна ссылка или сетевой ID из 64 символов."
              : "Сетевой ID есть у собеседника в разделе «Профиль → Мой профиль». Shum ID для поиска не подходит. Человек должен быть в сети: если он не ответит за 20 секунд, попросите ссылку или QR-код."}
          </p>
        </>
      )}
    </Modal>
  );
}
