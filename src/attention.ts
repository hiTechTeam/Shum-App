// Draws attention to new messages: a short sound when one arrives outside
// the chat in front, and in the browser the unread count in the tab title and
// on the tab icon.
import { useEffect, useRef } from "react";
import { inApp, type Snapshot } from "./core";

let audio: AudioContext | null = null;

/** The page's audio, resumed when possible. Browsers allow sound only after
 * the person clicked or typed on the page. */
function sound(): AudioContext | null {
  try {
    audio ??= new AudioContext();
  } catch {
    return null;
  }
  if (audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}

// Every click or key press tries to start the sound until it runs.
if (typeof window !== "undefined") {
  const unlock = () => {
    if (sound()?.state !== "running") return;
    for (const event of ["pointerdown", "keydown", "touchstart"]) window.removeEventListener(event, unlock, true);
  };
  for (const event of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(event, unlock, true);
}

/** Two soft rising tones, made in the page: no sound file to load. */
function chime() {
  const context = sound();
  if (!context) return;
  const play = () => {
    const now = context.currentTime;
    [660, 990].forEach((frequency, i) => {
      const tone = context.createOscillator();
      const gain = context.createGain();
      const at = now + i * 0.11;
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      tone.connect(gain).connect(context.destination);
      tone.start(at);
      tone.stop(at + 0.2);
    });
  };
  if (context.state === "running") play();
  else context.resume().then(play).catch(() => {});
}

const iconLink = () => document.querySelector<HTMLLinkElement>('link[rel="icon"]');
const plainIcon = typeof document !== "undefined" ? iconLink()?.href ?? "/icon.png" : "";
let iconImage: HTMLImageElement | null = null;

/** The tab icon with a red count in its corner, or the plain icon at zero. */
function drawIcon(count: number) {
  const link = iconLink();
  if (!link) return;
  if (count === 0) {
    link.href = plainIcon;
    return;
  }
  const draw = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context || !iconImage) return;
    context.drawImage(iconImage, 0, 0, 64, 64);
    const label = count > 9 ? "9+" : String(count);
    context.fillStyle = "#ff3b30";
    context.beginPath();
    context.arc(44, 20, 20, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `bold ${label.length > 1 ? 22 : 28}px -apple-system, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 44, 22);
    link.href = canvas.toDataURL("image/png");
  };
  if (iconImage?.complete) return draw();
  iconImage = new Image();
  iconImage.onload = draw;
  iconImage.src = plainIcon;
}

/**
 * `shown` is the chat on screen (null when the window is hidden or another
 * tab of the app is open). Messages that were there when the profile opened
 * make no sound.
 */
export function useAttention(snapshot: Snapshot | null, shown: string | null) {
  const seen = useRef<{ owner: string; ids: Set<string> } | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    const owner = snapshot.profile.ownerId;
    const incoming = snapshot.messages.filter((m) => !m.outgoing);
    const invitations = snapshot.contacts.filter((c) => c.phase === "incomingPending").map((c) => `invite:${c.id}`);
    const ids = new Set([...incoming.map((m) => m.id), ...invitations]);
    if (seen.current?.owner === owner) {
      // A window behind another app still counts as visible, so only a
      // focused window means the person sees the chat.
      const looking = document.visibilityState === "visible" && document.hasFocus() ? shown : null;
      const fresh =
        incoming.some((m) => !seen.current!.ids.has(m.id) && m.contactID !== looking) ||
        invitations.some((id) => !seen.current!.ids.has(id));
      if (fresh) chime();
    }
    seen.current = { owner, ids };
  }, [snapshot, shown]);

  const unread = snapshot
    ? snapshot.contacts.reduce((sum, c) => sum + (c.unread || (c.phase === "incomingPending" ? 1 : 0)), 0)
    : 0;
  useEffect(() => {
    if (inApp) return;
    document.title = unread > 0 ? `(${unread}) Shum - Web` : "Shum - Web";
    drawIcon(unread);
  }, [unread]);
}
