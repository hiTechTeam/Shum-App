import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAttention } from "./attention";
import { UpdateBanner } from "./update";
import { AddContact, ContactCard, ContactList } from "./contacts";
import { ProfileNav, ProfilePage, type Section } from "./profile";
import { PresenceBadge, PresencePixels } from "./presence";
import { Avatar, Chip, Confirm, ReactionArt } from "./ui";
import { Restore, Welcome } from "./welcome";
import {
  bluetoothStatus,
  call,
  describe,
  inApp,
  shell,
  distanceLabel,
  eventLabels,
  quickReactions,
  reactionUsed,
  stickerSets,
  type Contact,
  type StickerSet,
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
  IconPhoto,
  IconSmile,
  IconTrash,
  DeliveryMark,
} from "./icons";

type Filter = "all" | "nearby" | "invitations" | "unread";
type Tab = "chats" | "contacts" | "profile";

type Chat = {
  contact: Contact;
  last: { text: string; timestamp: number; outgoing: boolean; status: string } | null;
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

/** The line under a contact's name, worded as in the iOS app. */
function contactStatus(contact: Contact) {
  switch (contact.phase) {
    case "incomingPending":
      return "приглашение в чат";
    case "outgoingPending":
      return contact.invitationWaiting ? "приглашение ждёт связи" : "приглашение отправлено";
    case "declinedByPeer":
    case "declinedLocally":
      return "приглашение отклонено";
  }
  // Someone typing has the chat open even before the presence mark arrives.
  const inChat = contact.online || contact.typing;
  const nearby = contact.nearby ? (contact.distance != null ? `рядом · ~${contact.distance} м` : "рядом") : "";
  if (inChat && nearby) return `в чате · ${nearby}`;
  if (inChat) return "в чате";
  if (nearby) return nearby;
  return "не в чате";
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
  const [noProfile, setNoProfile] = useState(false);
  const [onboarding, setOnboarding] = useState<"create" | "restore" | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setSnapshot(await call<Snapshot>({ command: "snapshot" }));
      setProblem(null);
      setNoProfile(false);
    } catch (error) {
      setProblem(describe(error));
      // With no profile at all the first screen offers to create one.
      const local = await shell<{ profiles: unknown[] }>("profiles").catch(() => null);
      setNoProfile(!!local && local.profiles.length === 0);
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
          summary = { text: last.text, timestamp: last.timestamp, outgoing: last.outgoing, status: last.status };
        } else if (lastEvent) {
          const text =
            contact.phase === "incomingPending"
              ? "Приглашение в чат"
              : contact.phase === "outgoingPending" && contact.invitationWaiting
                ? "Приглашение ждёт связи"
                : eventLabels[lastEvent.kind] ?? "";
          summary = { text, timestamp: lastEvent.timestamp, outgoing: false, status: "" };
        }
        const badge = contact.unread || (contact.phase === "incomingPending" ? 1 : 0);
        return { contact, last: summary, badge, listed: !!summary || contact.phase !== "ready" };
      })
      // Someone just opened from contacts stays in the list until invited.
      .filter((chat) => chat.listed || chat.contact.nearby || chat.contact.id === selected)
      .sort((a, b) => (b.last?.timestamp ?? 0) - (a.last?.timestamp ?? 0));
  }, [snapshot, selected]);

  const listed = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("ru");
    return chats.filter((chat) => {
      const shown = chat.listed || chat.contact.id === selected;
      if (filter === "nearby" ? !chat.contact.nearby : !shown) return false;
      if (filter === "invitations" && chat.contact.phase !== "incomingPending") return false;
      if (filter === "unread" && chat.badge === 0) return false;
      return !text || chat.contact.card.name.toLocaleLowerCase("ru").includes(text);
    });
  }, [chats, filter, query, selected]);

  const chat = chats.find((c) => c.contact.id === selected) ?? null;
  const unreadChats = chats.filter((c) => c.badge > 0).length;
  const invitations = chats.filter((c) => c.contact.phase === "incomingPending").length;

  // Opening a chat marks it read and tells the contact which chat is in front.
  const visible = useVisible();
  const shown = tab === "chats" && visible ? selected : null;
  useAttention(snapshot, shown);
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

  const restart = () => {
    setOnboarding(null);
    setSelected(null);
    setPerson(null);
    setSnapshot(null);
    setTab("chats");
    refresh();
  };
  if (onboarding === "create" || (!snapshot && noProfile)) {
    return (
      <div className="app">
        <Welcome onDone={restart} onCancel={onboarding ? () => setOnboarding(null) : undefined} />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="app">
        <div className="problem">
          {problem ? (
            <p>{problem}</p>
          ) : (
            <div>
              <p className="loading-title">Открываю Shum…</p>
              <p className="small">Это может занять несколько секунд.</p>
            </div>
          )}
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
            {/* The browser has no Bluetooth, so nobody is ever nearby there. */}
            {inApp && <Chip active={filter === "nearby"} onClick={() => setFilter("nearby")} label="Рядом" count={nearby} />}
            <Chip active={filter === "invitations"} onClick={() => setFilter("invitations")} label="Приглашения" count={invitations} />
            <Chip active={filter === "unread"} onClick={() => setFilter("unread")} label="Непрочитанные" count={unreadChats} />
          </div>
          <ul className="rows">
            {listed.map(({ contact, last, badge }) => (
              <li key={contact.id}>
                <button className={`row${contact.id === selected ? " selected" : ""}`} onClick={() => setSelected(contact.id)}>
                  <span className="avatar-wrap">
                    <Avatar card={contact.card} id={contact.id} size={48} />
                    {(contact.online || contact.typing) && <PresenceBadge seed={contact.id} typing={contact.typing} />}
                  </span>
                  <span className="row-text">
                    <span className="row-top">
                      <strong>{contact.card.name}</strong>
                      {last && <time>{listTime(last.timestamp)}</time>}
                    </span>
                    <span className="row-bottom">
                      <span className="preview">
                        {last?.outgoing && <DeliveryMark status={last.status} />}
                        {last ? last.text : contact.nearby ? distanceLabel(contact) : "Пригласите в чат, чтобы писать"}
                      </span>
                      {badge > 0 && <span className="count">{badge}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {listed.length === 0 && (
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
            onCreate={() => setOnboarding("create")}
            onRestore={() => setOnboarding("restore")}
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
        <UpdateBanner />
      </main>
      {adding && <AddContact contacts={snapshot.contacts.map((c) => c.id)} act={act} onClose={() => setAdding(false)} />}
      {onboarding === "restore" && (
        <Restore onClose={() => setOnboarding(null)} onDone={restart} />
      )}
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
  const draftRef = useRef("");
  draftRef.current = draft;
  const [picker, setPicker] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [find, setFind] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "block" | null>(null);
  /** Every reaction by its set in the picker, beyond the twenty at hand. */
  const [allReactions, setAllReactions] = useState(false);
  /** An own message asking where to delete it. */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [stickersOpen, setStickersOpen] = useState(false);
  const [sets, setSets] = useState<StickerSet[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    stickerSets().then(setSets).catch(() => {});
  }, []);
  /** A sticker's emoji and word, for titles and names. */
  const words = useMemo(
    () => new Map(sets.flatMap((set) => set.kinds.map((k) => [k.id, `${k.emoji} ${k.word}`] as const))),
    [sets],
  );
  const react = (message: string, kind: string) => {
    setPicker(null);
    setAllReactions(false);
    reactionUsed(kind);
    act({ command: "reaction", message, reaction: kind });
  };
  const attachPhoto = async (file: File) => {
    try {
      const photo = await preparePhoto(file);
      const caption = draftRef.current.trim();
      setDraft("");
      await act({
        command: "send_photo",
        contact: contact.id,
        photo: photo.base64,
        width: photo.width,
        height: photo.height,
        text: caption || "Фото",
        caption: caption.length > 0,
      });
    } catch {
      // The request's own failure shows; an unreadable file just stays out.
    }
  };
  const end = useRef<HTMLDivElement>(null);
  const writable = contact.phase === "accepted";
  const typedAt = useRef(0);
  const visible = useVisible();

  // While the chat is open and the window is not hidden, tell the contact
  // every 4 seconds that you are in this chat and whether you are typing, as
  // the CLI does. Without the heartbeat the contact sees neither.
  useEffect(() => {
    if (!visible || !writable) return;
    const beat = () => {
      const typing = draftRef.current.trim().length > 0 && Date.now() - typedAt.current < 5000;
      call({ command: "typing", contact: contact.id, active: typing }).catch(() => {});
      call({ command: "presence", contact: contact.id, online: true }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 4000);
    return () => clearInterval(timer);
  }, [contact.id, visible, writable]);

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

  // The field grows with the text, as on iPhone, up to six lines; longer
  // drafts scroll inside it.
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !writable) return;
    setDraft("");
    call({ command: "typing", contact: contact.id, active: false }).catch(() => {});
    act({ command: "send", contact: contact.id, text });
  };

  const placeholder =
    contact.phase === "accepted"
      ? "Сообщение"
      : contact.phase === "incomingPending"
        ? "Ответьте на приглашение, чтобы писать"
        : contact.phase === "outgoingPending"
          ? contact.invitationWaiting
            ? "Приглашение уйдёт, когда появится связь"
            : "Дождитесь ответа на приглашение"
          : contact.phase === "declinedLocally"
            ? "Примите приглашение, если передумали"
            : contact.phase === "declinedByPeer"
              ? "Собеседник отклонил приглашение"
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
            <span className="status">
              {(contact.online || contact.typing) && (
                <PresencePixels seed={contact.id} typing={contact.typing} cell={2} gap={1} off="rgba(142,142,147,0.3)" />
              )}
              {contactStatus(contact)}
            </span>
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

      <div
        className="messages"
        onClick={() => {
          setPicker(null);
          setAllReactions(false);
          setDeleting(null);
          setStickersOpen(false);
        }}
      >
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
              // Still on this device: it leaves by itself once there is a connection.
              if (item.event.kind === "invitationSent" && contact.phase === "outgoingPending" && contact.invitationWaiting) {
                return (
                  <p key={item.event.id} className="note">
                    Приглашение ждёт связи и уйдёт само, когда появится интернет. {clock(item.event.timestamp)}
                    {contact.invitationCancellable && (
                      <>
                        {" "}
                        <button className="link-button" onClick={() => act({ command: "cancel_invitation", contact: contact.id })}>
                          Отменить
                        </button>
                      </>
                    )}
                  </p>
                );
              }
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
                  {m.sticker ? (
                    <div className="sticker" title={m.text}>
                      <ReactionArt kind={m.sticker} size={140} />
                      <time>
                        {clock(m.timestamp)}
                        {m.outgoing && !failed && <DeliveryMark status={m.status} />}
                      </time>
                    </div>
                  ) : (
                    <div className={m.photo ? "bubble with-photo" : "bubble"}>
                      {m.photo && <PhotoView message={m} />}
                      {(!m.photo || m.photo.caption) && <span>{m.text}</span>}
                      <time>
                        {clock(m.timestamp)}
                        {m.outgoing && !failed && <DeliveryMark status={m.status} />}
                      </time>
                    </div>
                  )}
                  {m.outgoing && (
                    <button
                      className="react-button"
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(deleting === m.id ? null : m.id);
                      }}
                    >
                      <IconTrash />
                    </button>
                  )}
                  {deleting === m.id && (
                    <div className="picker choices" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="danger"
                        onClick={() => {
                          setDeleting(null);
                          act({ command: "delete", message: m.id, everyone: true });
                        }}
                      >
                        Удалить у меня и у {contact.card.name}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setDeleting(null);
                          act({ command: "delete", message: m.id, everyone: false });
                        }}
                      >
                        Удалить у меня
                      </button>
                    </div>
                  )}
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
                    <div className={allReactions ? "picker all" : "picker"} onClick={(e) => e.stopPropagation()}>
                      <div className="picker-row">
                        {quickReactions().map((kind) => (
                          <button key={kind} title={words.get(kind)} onClick={() => react(m.id, kind)}>
                            <ReactionArt kind={kind} size={26} />
                          </button>
                        ))}
                        <button className="more" title="Все реакции" onClick={() => setAllReactions(!allReactions)}>
                          {allReactions ? "▴" : "▾"}
                        </button>
                      </div>
                      {allReactions && (
                        <div className="picker-sets">
                          {sets
                            .filter((set) => set.reactions)
                            .map((set) => (
                              <section key={set.section}>
                                <h4>{set.title}</h4>
                                <div className="picker-grid">
                                  {set.kinds.map((k) => (
                                    <button key={k.id} title={`${k.emoji} ${k.word}`} onClick={() => react(m.id, k.id)}>
                                      <ReactionArt kind={k.id} size={26} />
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {failed && <span className="failed">{m.status === "expired" ? "Не доставлено" : "Отправка отменена"}</span>}
                {marks && (
                  <div className="reactions">
                    {marks.map((mark) => (
                      <span key={mark.kind} className="reaction" title={words.get(mark.kind)}>
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
          {contact.phase === "declinedLocally" && (
            <div className="invitation">
              <Avatar card={contact.card} id={contact.id} size={72} />
              <h2>Вы отклонили приглашение</h2>
              <p className="hint">Если передумали, примите его: {contact.card.name} получит ответ, и можно будет общаться.</p>
              <div className="actions">
                <button className="button primary" onClick={() => act({ command: "accept", contact: contact.id })}>
                  Принять приглашение
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
        {stickersOpen && writable && (
          <StickerPanel
            sets={sets}
            onSend={(sticker) => {
              act({ command: "send_sticker", contact: contact.id, sticker });
            }}
          />
        )}
        <div className="column composer-row">
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) attachPhoto(file);
            }}
          />
          <button className="icon-button" disabled={!writable} title="Фото" onClick={() => photoInput.current?.click()}>
            <IconPhoto />
          </button>
          <textarea
            ref={field}
            rows={1}
            placeholder={placeholder}
            disabled={!writable}
            value={draft}
            onChange={(e) => {
              const wasEmpty = !draft.trim();
              setDraft(e.target.value);
              typedAt.current = Date.now();
              // The first letter shows "typing…" at once, not at the next beat.
              if (wasEmpty && e.target.value.trim()) {
                call({ command: "typing", contact: contact.id, active: true }).catch(() => {});
              }
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line; IME input is left alone.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            className={stickersOpen ? "icon-button accent" : "icon-button"}
            disabled={!writable}
            title="Стикеры"
            onClick={() => setStickersOpen(!stickersOpen)}
          >
            <IconSmile />
          </button>
          <button className="send" disabled={!writable || !draft.trim()} onClick={submit} title="Отправить">
            <IconArrow />
          </button>
        </div>
      </footer>
    </>
  );
}

/** A message's photo: read from Shum-Core once every part is here. */
function PhotoView(props: { message: Message }) {
  const { message } = props;
  const photo = message.photo!;
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (photo.state !== "ready") return;
    let alive = true;
    call<{ photo: string }>({ command: "photo", message: message.id })
      .then((answer) => alive && setSource(`data:image/jpeg;base64,${answer.photo}`))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [message.id, photo.state]);
  const width = 260;
  const height = Math.round(Math.min(Math.max((width * photo.height) / Math.max(photo.width, 1), width * 0.5), width * 1.35));
  return (
    <div className="photo" style={{ width, height }}>
      {source ? (
        <img src={source} alt="Фото" onClick={() => window.open(source, "_blank")} />
      ) : (
        <span>{photo.state === "missing" ? "Фото не дошло" : "Фото загружается"}</span>
      )}
    </div>
  );
}

/** Shum's stickers above the field: the sets on top, the chosen set below. */
function StickerPanel(props: { sets: StickerSet[]; onSend: (sticker: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const set = props.sets.find((s) => s.section === selected) ?? props.sets[0];
  if (!set) return null;
  return (
    <div className="column sticker-panel" onClick={(e) => e.stopPropagation()}>
      <div className="sticker-tabs">
        {props.sets.map((s) => (
          <button key={s.section} className={s === set ? "active" : ""} title={s.title} onClick={() => setSelected(s.section)}>
            <ReactionArt kind={s.section} set size={30} />
          </button>
        ))}
      </div>
      <div className="sticker-head">
        <strong>{set.title}</strong>
        <span>Стикеров: {set.kinds.length}</span>
      </div>
      <div className="sticker-grid">
        {set.kinds.map((k) => (
          <button key={k.id} title={`${k.emoji} ${k.word}`} onClick={() => props.onSend(k.id)}>
            <ReactionArt kind={k.id} size={72} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A picked picture made what a message carries: at most 1280 pixels on the
 * long side, about 100 KB of JPEG, pixels only. */
async function preparePhoto(file: File): Promise<{ base64: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let side = 1280;
  while (side >= 320) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.8, 0.7, 0.6, 0.5, 0.42]) {
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
      if (blob && blob.size <= 110_000) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { base64: btoa(binary), width, height };
      }
    }
    side = Math.round(side * 0.8);
  }
  throw new Error("photo too large");
}

/** Whether the window is shown: not minimized or behind another space. */
function useVisible() {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
