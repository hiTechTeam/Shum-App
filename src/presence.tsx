// The "in chat" mark of the iOS app: a 3x3 pixel grid whose lit cells come
// from Shum-Core (shum_core::presence). While the contact types, the grid
// pulses at random; when typing stops, the lit pixels freeze where they are.
// The chat header and the chat list read one state, so they move together.
import { useEffect, useState, useSyncExternalStore } from "react";
import { shell } from "./core";

const STEP_MS = 180;
const patterns = new Map<string, Promise<boolean[]>>();

function pattern(seed: string): Promise<boolean[]> {
  let found = patterns.get(seed);
  if (!found) {
    found = shell<boolean[]>("presence_pattern", { seed });
    patterns.set(seed, found);
  }
  return found;
}

/** Brightness of the nine cells per typing contact; shared by every mark. */
const levels = new Map<string, number[]>();
const typing = new Set<string>();
const listeners = new Set<() => void>();
let timer: number | undefined;
let version = 0;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function notify() {
  version++;
  listeners.forEach((listener) => listener());
}

/** Each cell off or lit at a random brightness, at least one lit. */
function pulse(): number[] {
  const next = Array.from({ length: 9 }, () => (Math.random() < 0.5 ? 0.35 + Math.random() * 0.65 : 0));
  if (!next.some((v) => v > 0)) next[Math.floor(Math.random() * 9)] = 0.35 + Math.random() * 0.65;
  return next;
}

function setTyping(seed: string, active: boolean) {
  if (active === typing.has(seed)) return;
  if (active) {
    typing.add(seed);
  } else {
    typing.delete(seed);
    // Stop where it is, with the lit cells at full brightness.
    const current = levels.get(seed);
    if (current) levels.set(seed, current.map((v) => (v > 0 ? 1 : 0)));
    notify();
  }
  if (typing.size > 0 && timer === undefined && !still()) {
    timer = window.setInterval(() => {
      typing.forEach((s) => levels.set(s, pulse()));
      notify();
    }, STEP_MS);
  } else if (typing.size === 0 && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The mark for contact `seed`; `typing` makes it pulse. */
export function PresencePixels(props: {
  seed: string;
  typing: boolean;
  cell?: number;
  gap?: number;
  off?: string;
}) {
  const { seed, cell = 3, gap = 1, off = "transparent" } = props;
  const [base, setBase] = useState<number[] | null>(null);
  useSyncExternalStore(subscribe, () => version);

  useEffect(() => {
    let alive = true;
    pattern(seed).then((lit) => alive && setBase(lit.map((on) => (on ? 1 : 0))));
    return () => {
      alive = false;
    };
  }, [seed]);

  useEffect(() => {
    setTyping(seed, props.typing);
  }, [seed, props.typing]);
  useEffect(() => () => setTyping(seed, false), [seed]);

  const shown = levels.get(seed) ?? base;
  if (!shown) return null;
  return (
    <span
      className="presence"
      aria-hidden
      style={{ gridTemplateColumns: `repeat(3, ${cell}px)`, gridAutoRows: `${cell}px`, gap }}
    >
      {shown.map((level, i) => (
        <span key={i} style={{ background: off }}>
          <span style={{ opacity: level }} />
        </span>
      ))}
    </span>
  );
}

/** The mark on a translucent plate in the corner of an avatar, for the chat list. */
export function PresenceBadge(props: { seed: string; typing: boolean }) {
  return (
    <span className="presence-badge">
      <PresencePixels seed={props.seed} typing={props.typing} cell={3} gap={0.5} off="rgba(255,255,255,0.16)" />
    </span>
  );
}
