// Test profile for the browser preview, shaped like a Shum-Core snapshot.
import type { Contact, Message, Reaction, Request, Snapshot, TimelineEvent } from "./core";

const me = "own";
const minute = 60_000;
const today = new Date();
today.setHours(0, 0, 0, 0);
const at = (hours: number, minutes: number, daysAgo = 0) =>
  today.getTime() - daysAgo * 24 * 60 * minute + (hours * 60 + minutes) * minute;

const contact = (id: string, name: string, phase: Contact["phase"], extra: Partial<Contact> = {}): Contact => ({
  id,
  card: { name, bio: "" },
  phase,
  unread: 0,
  nearby: false,
  typing: false,
  online: false,
  ...extra,
});

let serial = 0;
const message = (contactID: string, outgoing: boolean, text: string, timestamp: number, status: Message["status"] = "read"): Message => ({
  id: `m${++serial}`,
  contactID,
  outgoing,
  text,
  timestamp,
  status: outgoing ? status : "read",
});

const state: Snapshot = {
  profile: { id: "test", name: "Руслан", ownerId: me },
  card: { name: "Руслан", bio: "" },
  contacts: [
    contact("manta", "намочил манту", "accepted"),
    contact("anya", "Аня", "accepted", { online: true, nearby: true, distance: 4 }),
    contact("stranger", "Соня", "ready", { nearby: true }),
    contact("gogi", "Гоги", "incomingPending", { unread: 1 }),
    contact("igor", "Игорь", "accepted", { unread: 1 }),
    contact("liza", "Лиза", "accepted"),
    contact("mark", "Марк", "accepted"),
  ],
  messages: [
    message("manta", false, "В воскресенье на озеро?", at(9, 12)),
    message("anya", false, "Привет! Ты была на фестивале?", at(17, 58)),
    message("anya", true, "Да, у сцены с синтезаторами", at(18, 1)),
    message("anya", true, "Шум показал, что ты рядом", at(18, 1)),
    message("anya", false, "Ахах, я тоже тебя видела", at(18, 3)),
    message("anya", false, "Классный был сет", at(18, 3)),
    message("anya", true, "Ты часто туда ходишь?", at(18, 10)),
    message("anya", false, "Почти каждые выходные", at(18, 12)),
    message("anya", false, "Ты завтра у фонтана будешь?", at(18, 31)),
    message("anya", true, "Да, к шести подойду", at(18, 33)),
    message("anya", false, "Супер, я с подругой", at(18, 40)),
    message("anya", false, "Тогда в субботу у фонтана?", at(18, 42)),
    message("igor", false, "Скинул тебе ключ, сверь при встрече", at(21, 4, 1)),
    message("liza", false, "ахах да", at(20, 15, 1)),
    message("mark", true, "Ок", at(12, 30, 3)),
  ],
  events: [{ id: "invitation:gogi:1", contactID: "gogi", timestamp: at(18, 20), kind: "invitationReceived" }],
  reactions: [
    { messageID: "m10", personID: "anya", mark: { reaction: "fire" } },
    { messageID: "m12", personID: me, mark: { reaction: "like" } },
    { messageID: "m12", personID: "anya", mark: { reaction: "like" } },
  ],
  blocked: [{ id: "7e09aa31", card: { name: "Спамер", bio: "" } }],
  relays: ["wss://relay.example"],
  owner: "preview",
};

const copy = (): Snapshot => JSON.parse(JSON.stringify(state));
const find = (id: string) => state.contacts.find((c) => c.id === id);
const event = (contactID: string, kind: string): TimelineEvent => ({
  id: `invitation:${contactID}:${++serial}`,
  contactID,
  timestamp: Date.now(),
  kind,
});

export async function fakeCall<T>(request: Request): Promise<T> {
  switch (request.command) {
    case "send":
      state.messages.push(message(request.contact, true, request.text, Date.now(), "delivered"));
      break;
    case "read": {
      const c = find(request.contact);
      if (c && c.phase !== "incomingPending") c.unread = 0;
      break;
    }
    case "accept":
    case "decline": {
      const c = find(request.contact);
      if (!c || c.phase !== "incomingPending") throw { kind: "phase", phase: c?.phase ?? "ready" };
      const accepted = request.command === "accept";
      c.phase = accepted ? "accepted" : "declinedLocally";
      c.unread = 0;
      state.events.push(event(c.id, accepted ? "invitationAcceptedLocally" : "invitationDeclinedLocally"));
      break;
    }
    case "clear":
      state.messages = state.messages.filter((m) => m.contactID !== request.contact);
      state.events = state.events.filter((e) => e.contactID !== request.contact);
      break;
    case "block": {
      if (request.blocked) {
        const c = find(request.contact);
        if (c) {
          state.contacts = state.contacts.filter((x) => x !== c);
          state.blocked = [...(state.blocked ?? []), { id: c.id, card: c.card }];
        }
      } else {
        const b = state.blocked?.find((x) => x.id === request.contact);
        if (b) {
          state.blocked = state.blocked?.filter((x) => x !== b);
          state.contacts.push(contact(b.id, b.card.name, "ready"));
        }
      }
      break;
    }
    case "profile":
      if (request.name) state.card.name = request.name;
      break;
    case "add":
      throw { kind: "text", text: "Добавление по ссылке работает в приложении" };
    case "invite": {
      const c = find(request.contact);
      if (!c) throw { kind: "text", text: "Контакт не найден. Добавьте карточку или пригласите по полному сетевому ID." };
      c.phase = "outgoingPending";
      state.events.push(event(c.id, "invitationSent"));
      break;
    }
    case "reaction": {
      const index = state.reactions.findIndex((r) => r.messageID === request.message && r.personID === me);
      const same = index >= 0 && state.reactions[index].mark.reaction === request.reaction;
      if (index >= 0) state.reactions.splice(index, 1);
      if (!same) state.reactions.push({ messageID: request.message, personID: me, mark: { reaction: request.reaction } } as Reaction);
      break;
    }
  }
  return copy() as T;
}

export async function fakeShell<T>(command: string, _args: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "profiles":
      return { selected: "test", profiles: [{ id: "test", name: state.card.name, ownerId: me }] } as T;
    case "own_invitation":
      return { link: "shum://c4/preview", qr: "" } as T;
    default:
      throw { kind: "text", text: "Это работает только в приложении" };
  }
}
