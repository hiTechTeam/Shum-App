// Building blocks shared by every screen.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { avatarPixels, reactionPixels, stickerSetPixels, type Card } from "./core";

export function Chip(props: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={props.active ? "chip active" : "chip"} onClick={props.onClick}>
      {props.label} <span>{props.count}</span>
    </button>
  );
}

/** A sticker or reaction picture from Shum-Core, crisp at any size. */
export function ReactionArt(props: { kind: string; size: number; set?: boolean; title?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [side, setSide] = useState(0);

  useEffect(() => {
    const pixels = props.set ? stickerSetPixels(props.kind) : reactionPixels(props.kind);
    let alive = true;
    pixels.then((data) => {
      const size = Math.round(Math.sqrt(data.length / 4));
      const element = canvas.current;
      if (!alive || !element || size === 0) return;
      element.width = size;
      element.height = size;
      element.getContext("2d")?.putImageData(new ImageData(data, size, size), 0, 0);
      setSide(size);
    });
    return () => {
      alive = false;
    };
  }, [props.kind, props.set]);

  return (
    <span className="reaction-art" title={props.title} style={{ width: props.size, height: props.size }}>
      <canvas ref={canvas} hidden={side === 0} />
    </span>
  );
}

/** The pixel avatar from Shum-Core. */
export function Avatar(props: { card: Card; id: string; size: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const seed = props.card.avatarSeed;

  useEffect(() => {
    setDrawn(false);
    const pixels = seed ? avatarPixels(seed) : null;
    if (!pixels) return;
    let alive = true;
    pixels.then((data) => {
      const context = canvas.current?.getContext("2d");
      if (!alive || !context) return;
      context.putImageData(new ImageData(data, 36, 36), 0, 0);
      setDrawn(true);
    });
    return () => {
      alive = false;
    };
  }, [seed]);

  return (
    <span
      className="avatar"
      style={{
        width: props.size,
        height: props.size,
        background: drawn ? undefined : "var(--field)",
      }}
    >
      <canvas ref={canvas} width={36} height={36} hidden={!drawn} />
    </span>
  );
}

/** A dialog over the window; Escape or the backdrop closes it. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.onClose]);
  return (
    <div className="backdrop" onClick={props.onClose}>
      <div className="modal" role="dialog" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{props.title}</h2>
          <button className="icon-button" title="Закрыть" onClick={props.onClose}>
            ✕
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}

/** Asks before an action that cannot be undone. */
export function Confirm(props: { title: string; text: string; action: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <p className="modal-text">{props.text}</p>
      <div className="actions">
        <button className="button" onClick={props.onClose}>
          Отмена
        </button>
        <button
          className={props.danger ? "button danger" : "button primary"}
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
        >
          {props.action}
        </button>
      </div>
    </Modal>
  );
}

/** A labelled value with a copy button. */
export function CopyRow(props: { label: string; value: string; shown?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="info-row">
      <span className="info-label">{props.label}</span>
      <span className="info-value">{props.shown ?? props.value}</span>
      <button
        className="link-button"
        onClick={async () => {
          await navigator.clipboard.writeText(props.value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Скопировано" : "Скопировать"}
      </button>
    </div>
  );
}
