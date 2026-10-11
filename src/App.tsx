import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddContact, ContactCard, ContactList } from "./contacts";
import { ProfileNav, ProfilePage, type Section } from "./profile";
import { Avatar, Chip, Confirm, ReactionArt } from "./ui";
import {
  bluetoothStatus,
  call,
  describe,
  distanceLabel,
  eventLabels,
  reactionKinds,
  reactionNames,
  type Contact,
  type Message,
  type ReactionKind,
  type Request,
  type Snapshot,
  type TimelineEvent,
} from "./core";
import {
  IconArrow,
  IconChats,
  IconContacts,
  IconGlobe,
  IconLock,
  IconMore,
  IconPanel,
  IconSearch,
  IconSmile,
  IconTicks,
} from "./icons";

type Filter = "all" | "nearby" | "invitations" | "unread";
type Tab = "chats" | "contacts" | "profile";

type Chat = {
  contact: Contact;
  last: { text: string; timestamp: number; outgoing: boolean; read: boolean } | null;
  badge: number;
  /** Has a conversation or invitation; people only nearby are not listed in "All". */
  listed: boolean;
};

// The CLI asks its service four times a second; the window does the same.
const REFRESH_MS = 250;

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function clock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function listTime(timestamp: number) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / DAY);
  if (days <= 0) return clock(timestamp);
  if (days === 1) return "вчера";
  if (days < 7) return new Date(timestamp).toLocaleDateString("ru-RU", { weekday: "short" });
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function dayLabel(timestamp: number) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(timestamp)) / DAY);
  if (days <= 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function contactStatus(contact: Contact) {
  if (contact.typing) return "печатает…";
  if (contact.online) return "в сети";
  if (contact.nearby) return "рядом";
  switch (contact.phase) {
    case "incomingPending":
      return "приглашение в чат";
    case "outgoingPending":
      return "приглашение отправлено";
    case "declinedByPeer":
    case "declinedLocally":
      return "приглашение отклонено";
    default:
      return "";
  }
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Tab>("chats");
  const [person, setPerson] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("me");
  const [adding, setAdding] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setSnapshot(await call<Snapshot>({ command: "snapshot" }));
      setProblem(null);
    } catch (error) {
      setProblem(describe(error));
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const act = useCallback(
    async (request: Request) => {
      try {
        await call(request);
        await refresh();
      } catch (error) {
        setNotice(describe(error));
      }
    },
    [refresh],
  );

  const chats = useMemo<Chat[]>(() => {
    if (!snapshot) return [];
    return snapshot.contacts
      .map((contact) => {
        const messages = snapshot.messages.filter((m) => m.contactID === contact.id);
        const last = messages[messages.length - 1];
        const events = snapshot.events.filter((e) => e.contactID === contact.id);
        const lastEvent = events[events.length - 1];
        let summary: Chat["last"] = null;
        if (last && (!lastEvent || last.timestamp >= lastEvent.timestamp)) {
          summary = { text: last.text, timestamp: last.timestamp, outgoing: last.outgoing, read: last.status === "read" };
        } else if (lastEvent) {
          const text = contact.phase === "incomingPending" ? "Приглашение в чат" : eventLabels[lastEvent.kind] ?? "";
          summary = { text, timestamp: lastEvent.timestamp, outgoing: false, read: false };
        }
        const badge = contact.unread || (contact.phase === "incomingPending" ? 1 : 0);
        return { contact, last: summary, badge, listed: !!summary || contact.phase !== "ready" };
      })
      .filter((chat) => chat.listed || chat.contact.nearby)
      .sort((a, b) => (b.last?.timestamp ?? 0) - (a.last?.timestamp ?? 0));
  }, [snapshot]);

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("ru");
    return chats.filter((chat) => {
      if (filter === "nearby" ? !chat.contact.nearby : !chat.listed) return false;
      if (filter === "invitations" && chat.contact.phase !== "incomingPending") return false;
      if (filter === "unread" && chat.badge === 0) return false;
      return !text || chat.contact.card.name.toLocaleLowerCase("ru").includes(text);
    });
  }, [chats, filter, query]);

  const chat = chats.find((c) => c.contact.id === selected) ?? null;
  const unreadChats = chats.filter((c) => c.badge > 0).length;
  const invitations = chats.filter((c) => c.contact.phase === "incomingPending").length;

  // Opening a chat marks it read and tells the contact which chat is in front.
  const shown = tab === "chats" ? selected : null;
  useEffect(() => {
    if (!shown) return;
    call({ command: "focus", contact: shown }).catch(() => {});
    return () => {
      call({ command: "focus", contact: null }).catch(() => {});
    };
  }, [shown]);
  useEffect(() => {
    if (shown && chat && chat.contact.unread > 0 && chat.contact.phase !== "incomingPending") {
      act({ command: "read", contact: chat.contact.id });
    }
  }, [shown, chat?.contact.id, chat?.contact.unread]);

  const openChat = (id: string) => {
    setSelected(id);
    setTab("chats");
  };
  const openContact = (id: string) => {
    setPerson(id);
    setTab("contacts");
  };

  if (!snapshot) {
    return (
      <div className="app">
        <div className="problem">
          <p>{problem ?? "Открываю профиль…"}</p>
        </div>
      </div>
    );
  }

  const ownerID = snapshot.profile.ownerId;
  const names = new Map(snapshot.contacts.map((c) => [c.id, c.card.name]));
  const nearby = snapshot.contacts.filter((c) => c.nearby).length;
  const expand = () => setCollapsed(false);
  const collapse = () => setCollapsed(true);

  return (
    <div className="app">
      <nav className="rail">
        <RailItem active={tab === "contacts"} label="Контакты" onClick={() => setTab("contacts")}>
          <IconContacts />
        </RailItem>
        <RailItem active={tab === "chats"} label="Чаты" badge={unreadChats} onClick={() => setTab("chats")}>
          <IconChats />
        </RailItem>
        <div className="rail-spacer" />
        <RailItem active={tab === "profile"} label="Профиль" avatar onClick={() => setTab("profile")}>
          <Avatar card={snapshot.card} id={ownerID} size={36} />
        </RailItem>
      </nav>

      {!collapsed && tab === "contacts" && (
        <ContactList snapshot={snapshot} selected={person} onSelect={setPerson} onCollapse={collapse} onAdd={() => setAdding(true)} />
      )}
      {!collapsed && tab === "profile" && <ProfileNav section={section} onSelect={setSection} onCollapse={collapse} />}
      {!collapsed && tab === "chats" && (
        <aside className="list">
          <header className="list-header">
            <h1>Чаты</h1>
            <button className="icon-button" title="Свернуть список" onClick={() => setCollapsed(true)}>
              <IconPanel />
            </button>
          </header>
          <label className="search">
            <IconSearch />
            <input placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="chips">
            <Chip active={filter === "all"} onClick={() => setFilter("all")} label="Все" count={chats.filter((c) => c.listed).length} />
            <Chip active={filter === "nearby"} onClick={() => setFilter("nearby")} label="Рядом" count={nearby} />
            <Chip active={filter === "invitations"} onClick={() => setFilter("invitations")} label="Приглашения" count={invitations} />
            <Chip active={filter === "unread"} onClick={() => setFilter("unread")} label="Непрочитанные" count={unreadChats} />
          </div>
          <ul className="rows">
            {visible.map(({ contact, last, badge }) => (
              <li key={contact.id}>
                <button className={`row${contact.id === selected ? " selected" : ""}`} onClick={() => setSelected(contact.id)}>
                  <Avatar card={contact.card} id={contact.id} size={48} />
                  <span className="row-text">
                    <span className="row-top">
                      <strong>{contact.card.name}</strong>
                      {last && <time>{listTime(last.timestamp)}</time>}
                    </span>
                    <span className="row-bottom">
                      <span className="preview">
                        {last?.outgoing && <IconTicks read={last.read} />}
                        {last ? last.text : distanceLabel(contact)}
                      </span>
                      {badge > 0 && <span className="count">{badge}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="list-empty">
                {filter === "nearby" ? `Рядом пока никого. ${bluetoothStatus(snapshot).text}` : "Чатов пока нет"}
              </li>
            )}
          </ul>
          <footer className={`relay${snapshot.relays.length ? "" : " off"}`}>
            <IconGlobe />
            {problem
              ? "Нет связи с профилем"
              : snapshot.relays.length === 0
                ? "Нет связи с релеями"
                : snapshot.relays.length === 1
                  ? "Релей подключён"
                  : `Релеев подключено: ${snapshot.relays.length}`}
          </footer>
        </aside>
      )}

      <main className="chat">
        {collapsed && tab !== "chats" && (
          <button className="icon-button floating" title="Показать список" onClick={expand}>
            <IconPanel />
          </button>
        )}
        {tab === "contacts" &&
          (person ? <ContactCard snapshot={snapshot} id={person} onWrite={openChat} act={act} /> : <div className="empty">Выберите контакт</div>)}
        {tab === "profile" && (
          <ProfilePage
            section={section}
            snapshot={snapshot}
            act={act}
            notify={setNotice}
            onSwitched={() => {
              setSelected(null);
              setPerson(null);
              setSnapshot(null);
            }}
          />
        )}
        {tab === "chats" && (chat ? (
          <Conversation
            key={chat.contact.id}
            contact={chat.contact}
            messages={snapshot.messages.filter((m) => m.contactID === chat.contact.id)}
            events={snapshot.events.filter((e) => e.contactID === chat.contact.id)}
            reactions={snapshot.reactions}
            ownerID={ownerID}
            names={names}
            collapsed={collapsed}
            onExpand={expand}
            onOpenContact={openContact}
            act={act}
          />
        ) : (
          <div className="empty">
            {collapsed && (
              <button className="icon-button floating" title="Показать список" onClick={expand}>
                <IconPanel />
              </button>
            )}
            <p>Выберите чат</p>
          </div>
        ))}
        {notice && (
          <div className="notice" onClick={() => setNotice(null)}>
            {notice}
          </div>
        )}
      </main>
      {adding && <AddContact act={act} onClose={() => setAdding(false)} />}
    </div>
  );
}

function RailItem(props: { active: boolean; label: string; badge?: number; avatar?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rail-item${props.active ? " active" : ""}`} onClick={props.onClick}>
      <span className={props.avatar ? "rail-avatar" : "rail-icon"}>
        {props.children}
        {!!props.badge && <span className="badge">{props.badge}</span>}
      </span>
      <span>{props.label}</span>
    </button>
  );
}

type Item = { kind: "message"; message: Message } | { kind: "event"; event: TimelineEvent } | { kind: "day"; label: string; key: string };

function Conversation(props: {
  contact: Contact;
  messages: Message[];
  events: TimelineEvent[];
  reactions: Snapshot["reactions"];
  ownerID: string;
  names: Map<string, string>;
  collapsed: boolean;
  onExpand: () => void;
  onOpenContact: (id: string) => void;
  act: (request: Request) => Promise<void>;
}) {
  const { contact, act } = props;
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [find, setFind] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "block" | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const writable = contact.phase === "accepted";

  const items = useMemo(() => {
    const needle = find.trim().toLocaleLowerCase("ru");
    const rows: Item[] = needle
      ? props.messages.filter((m) => m.text.toLocaleLowerCase("ru").includes(needle)).map((message) => ({ kind: "message" as const, message }))
      : [
          ...props.messages.map((message) => ({ kind: "message" as const, message })),
          ...props.events.map((event) => ({ kind: "event" as const, event })),
        ];
    const time = (item: Item) => (item.kind === "message" ? item.message.timestamp : item.kind === "event" ? item.event.timestamp : 0);
    rows.sort((a, b) => time(a) - time(b));
    const result: Item[] = [];
    let day = -1;
    for (const row of rows) {
      const start = startOfDay(time(row));
      if (start !== day) {
        day = start;
        result.push({ kind: "day", label: dayLabel(time(row)), key: `day-${start}` });
      }
      result.push(row);
    }
    return result;
  }, [props.messages, props.events, find]);

  // One badge per reaction kind, with everyone who chose it, as in the CLI.
  const reactions = useMemo(() => {
    const byMessage = new Map<string, { kind: ReactionKind; names: string[] }[]>();
    for (const r of props.reactions) {
      const kind = r.mark?.reaction;
      if (!kind) continue;
      const name = r.personID === props.ownerID ? "Вы" : props.names.get(r.personID) ?? "";
      const groups = byMessage.get(r.messageID) ?? [];
      const group = groups.find((g) => g.kind === kind);
      if (group) group.names.push(name);
      else groups.push({ kind, names: [name] });
      byMessage.set(r.messageID, groups);
    }
    return byMessage;
  }, [props.reactions, props.ownerID, props.names]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !writable) return;
    setDraft("");
    act({ command: "send", contact: contact.id, text });
  };

  const placeholder =
    contact.phase === "accepted"
      ? "Сообщение"
      : contact.phase === "incomingPending"
        ? "Ответьте на приглашение, чтобы писать"
        : contact.phase === "outgoingPending"
          ? "Дождитесь ответа на приглашение"
          : "Пригласите собеседника, чтобы писать";

  return (
    <>
      <header className="chat-header">
        {props.collapsed && (
          <button className="icon-button" title="Показать список" onClick={props.onExpand}>
            <IconPanel />
          </button>
        )}
        <div className="column chat-title">
          <Avatar card={contact.card} id={contact.id} size={36} />
          <div>
            <strong>{contact.card.name}</strong>
            <span className={contact.online || contact.typing ? "status live" : "status"}>{contactStatus(contact)}</span>
          </div>
        </div>
        <button
          className={`icon-button${searching ? " accent" : ""}`}
          title="Поиск в чате"
          onClick={() => {
            setSearching(!searching);
            setFind("");
          }}
        >
          <IconSearch />
        </button>
        <div className="menu-anchor">
          <button className="icon-button" title="Ещё" onClick={() => setMenu(!menu)}>
            <IconMore />
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => props.onOpenContact(contact.id)}>Карточка контакта</button>
              <button
                onClick={() => {
                  setMenu(false);
                  setConfirm("clear");
                }}
              >
                Очистить чат здесь
              </button>
              <button
                className="danger-text"
                onClick={() => {
                  setMenu(false);
                  setConfirm("block");
                }}
              >
                Заблокировать
              </button>
            </div>
          )}
        </div>
      </header>
      {searching && (
        <div className="chat-search">
          <div className="column">
            <label className="search">
              <IconSearch />
              <input autoFocus placeholder="Поиск по переписке" value={find} onChange={(e) => setFind(e.target.value)} />
            </label>
          </div>
        </div>
      )}
      {confirm === "clear" && (
        <Confirm
          title={`Очистить чат с ${contact.card.name}?`}
          text="Переписка удалится только на этом устройстве. У собеседника она останется."
          action="Очистить"
          danger
          onConfirm={() => act({ command: "clear", contact: contact.id })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "block" && (
        <Confirm
          title={`Заблокировать ${contact.card.name}?`}
          text="Сообщения и приглашения от этого человека перестанут приходить. Разблокировать можно в Контактах, в разделе «Заблокированные»."
          action="Заблокировать"
          danger
          onConfirm={() => act({ command: "block", contact: contact.id, blocked: true })}
          onClose={() => setConfirm(null)}
        />
      )}

      <div className="messages" onClick={() => setPicker(null)}>
        <div className="column">
          <span className="pill">
            <IconLock /> Сквозное шифрование
          </span>
          {items.map((item, index) => {
            if (item.kind === "day") {
              return (
                <span key={item.key} className="pill">
                  {item.label}
                </span>
              );
            }
            if (item.kind === "event") {
              return (
                <p key={item.event.id} className="note">
                  {eventLabels[item.event.kind] ?? "Чат доступен."} {clock(item.event.timestamp)}
                </p>
              );
            }
            const m = item.message;
            const next = items[index + 1];
            const last = !next || next.kind !== "message" || next.message.outgoing !== m.outgoing;
            const marks = reactions.get(m.id);
            const failed = m.status === "expired" || m.status === "cancelled";
            return (
              <div key={m.id} className={`message ${m.outgoing ? "out" : "in"}${last ? " last" : ""}`}>
                <div className="bubble-line">
                  <div className="bubble">
                    <span>{m.text}</span>
                    <time>
                      {clock(m.timestamp)}
                      {m.outgoing && !failed && <IconTicks read={m.status === "read"} />}
                    </time>
                  </div>
                  {writable && (
                    <button
                      className="react-button"
                      title="Реакция"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPicker(picker === m.id ? null : m.id);
                      }}
                    >
                      <IconSmile />
                    </button>
                  )}
                  {picker === m.id && (
                    <div className="picker" onClick={(e) => e.stopPropagation()}>
                      {reactionKinds.map((kind) => (
                        <button
                          key={kind}
                          title={reactionNames[kind]}
                          onClick={() => {
                            setPicker(null);
                            act({ command: "reaction", message: m.id, reaction: kind });
                          }}
                        >
                          <ReactionArt kind={kind} size={28} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {failed && <span className="failed">{m.status === "expired" ? "Не доставлено" : "Отправка отменена"}</span>}
                {marks && (
                  <div className="reactions">
                    {marks.map((mark) => (
                      <span key={mark.kind} className="reaction" title={reactionNames[mark.kind]}>
                        <ReactionArt kind={mark.kind} size={16} /> {mark.names.join(", ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {contact.phase === "incomingPending" && (
            <div className="invitation">
              <Avatar card={contact.card} id={contact.id} size={72} />
              <h2>{contact.card.name} хочет начать общение</h2>
              <p className="id">
                Shum ID: {contact.id.slice(0, 4)}…{contact.id.slice(-4)}
              </p>
              <p className="hint">Пока вы не ответите, {contact.card.name} не видит, прочитано ли приглашение.</p>
              <div className="actions">
                <button className="button" onClick={() => act({ command: "decline", contact: contact.id })}>
                  Отклонить
                </button>
                <button className="button primary" onClick={() => act({ command: "accept", contact: contact.id })}>
                  Принять
                </button>
              </div>
            </div>
          )}
          {contact.phase === "ready" && (
            <div className="invitation">
              <Avatar card={contact.card} id={contact.id} size={72} />
              <h2>Пригласите {contact.card.name} в чат</h2>
              <p className="hint">Писать можно, когда собеседник примет приглашение.</p>
              <div className="actions">
                <button className="button primary" onClick={() => act({ command: "invite", contact: contact.id })}>
                  Пригласить
                </button>
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
      </div>

      <footer className="composer">
        <div className="column composer-row">
          <input
            placeholder={placeholder}
            disabled={!writable}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button className="send" disabled={!writable || !draft.trim()} onClick={submit} title="Отправить">
            <IconArrow />
          </button>
        </div>
      </footer>
    </>
  );
}
