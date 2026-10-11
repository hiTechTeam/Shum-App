// The site's pixel animation (Shum-Site components/PixelField.tsx), shaped
// for the app's entry screen.
import { useEffect, useRef } from "react";

// `burst` pixels are the splash under the cursor: they fly straight out and fade.
type Pixel = { x: number; y: number; dx: number; dy: number; life: number; age: number; o: number; burst?: boolean };

const TICK_MS = 140;
const POINTER_MS = 60;
const REACH_CELLS = 6;
const LEVELS = [0.1, 0.16, 0.24, 0.36];

/**
 * Where pixels may live, 0..1, as in the entry mockup: dense in the top right
 * corner and down the right edge, a thin band along the bottom on the left,
 * empty under the text and the card.
 */
function mask(x: number, y: number, w: number, h: number) {
  const u = x / w;
  const v = y / h;
  const corner = Math.max(0, 1 - Math.hypot((1 - u) / 0.42, v / 0.7));
  const right = u > 0.9 ? (u - 0.9) / 0.1 : 0;
  const bottom = y > h - 48 ? (1 - (h - y) / 48) * Math.max(0, 1 - u * 1.8) : 0;
  return Math.min(1, Math.max(corner, right * 0.9, bottom * 0.8));
}

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Pixel noise that drifts at the screen edges, cell by cell, as on the site. */
export function PixelField({ seed = 11 }: { seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !parent || !ctx) return;

    const rnd = random(seed);
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let cell = 12;
    let pixels: Pixel[] = [];
    let color = "#30d158";
    let timer: number | undefined;
    let visible = true;

    const readColor = () => {
      color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || color;
    };

    const target = () => Math.round(((width * height) / (cell * cell)) * 0.075);

    const spawn = (): Pixel | null => {
      // Rejection sampling against the mask keeps pixels in their zones.
      for (let tries = 0; tries < 24; tries++) {
        const x = Math.floor(rnd() * (width / cell));
        const y = Math.floor(rnd() * (height / cell));
        if (rnd() < mask(x * cell, y * cell, width, height)) {
          const sideways = rnd() < 0.25;
          return {
            x,
            y,
            dx: sideways ? 0 : -1,
            dy: sideways ? (rnd() < 0.5 ? -1 : 1) : 0,
            life: 6 + Math.floor(rnd() * 22),
            age: 0,
            o: LEVELS[Math.floor(rnd() * LEVELS.length)],
          };
        }
      }
      return null;
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.ceil(rect.width);
      height = Math.ceil(rect.height);
      cell = width < 768 ? 8 : 12;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pixels = [];
      const n = target();
      for (let i = 0; i < n; i++) {
        const p = spawn();
        if (p) {
          p.age = Math.floor(rnd() * p.life);
          pixels.push(p);
        }
      }
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const p of pixels) {
        const px = p.x * cell;
        const py = p.y * cell;
        // Fade in and out at the ends of a pixel's life, and with the mask.
        const edgeFade = Math.min(1, p.age / 2, (p.life - p.age) / 3);
        const alpha = p.burst
          ? p.o * Math.min(1, (p.life - p.age) / 3)
          : p.o * edgeFade * (0.35 + 0.65 * mask(px, py, width, height));
        if (alpha <= 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillRect(px, py, cell, cell);
      }
      ctx.globalAlpha = 1;
    };

    const step = () => {
      for (const p of pixels) {
        p.age++;
        if (p.burst) {
          p.x += p.dx;
          p.y += p.dy;
          continue;
        }
        if (rnd() < 0.7) {
          p.x += p.dx;
          p.y += p.dy;
        }
        if (rnd() < 0.08) {
          // Occasional turn, so the drift reads as noise rather than a conveyor.
          const sideways = p.dx !== 0;
          p.dx = sideways ? 0 : -1;
          p.dy = sideways ? (rnd() < 0.5 ? -1 : 1) : 0;
        }
      }
      pixels = pixels.filter(
        (p) => p.age < p.life && p.x >= 0 && p.y >= 0 && p.x * cell < width && p.y * cell < height,
      );
      const n = target();
      while (pixels.filter((p) => !p.burst).length < n) {
        const p = spawn();
        if (!p) break;
        pixels.push(p);
      }
      draw();
    };

    const run = () => {
      stop();
      if (still.matches || !visible || document.hidden) return;
      timer = window.setInterval(step, TICK_MS);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };

    // The cursor pushes nearby pixels away and splashes new ones that fly out.
    let lastPointer = 0;
    const onPointer = (event: PointerEvent) => {
      if (still.matches) return;
      const now = performance.now();
      if (now - lastPointer < POINTER_MS) return;
      lastPointer = now;
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor((event.clientX - rect.left) / cell);
      const cy = Math.floor((event.clientY - rect.top) / cell);
      for (const p of pixels) {
        if (p.burst) continue;
        const ox = p.x - cx;
        const oy = p.y - cy;
        if (Math.abs(ox) > REACH_CELLS || Math.abs(oy) > REACH_CELLS) continue;
        if (Math.hypot(ox, oy) > REACH_CELLS) continue;
        const horizontal = Math.abs(ox) >= Math.abs(oy);
        p.dx = horizontal ? Math.sign(ox) || 1 : 0;
        p.dy = horizontal ? 0 : Math.sign(oy) || 1;
        p.x += p.dx;
        p.y += p.dy;
        p.age = Math.min(p.age, p.life - 6);
      }
      const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (let i = 0; i < 6; i++) {
        const [dx, dy] = directions[Math.floor(rnd() * directions.length)];
        pixels.push({ x: cx + dx, y: cy + dy, dx, dy, life: 6 + Math.floor(rnd() * 6), age: 0, o: 0.4 + rnd() * 0.4, burst: true });
      }
      draw();
    };

    readColor();
    resize();
    run();
    parent.addEventListener("pointermove", onPointer);

    const onResize = new ResizeObserver(resize);
    onResize.observe(parent);
    const onView = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      run();
    });
    onView.observe(parent);
    document.addEventListener("visibilitychange", run);
    still.addEventListener("change", run);

    return () => {
      stop();
      onResize.disconnect();
      onView.disconnect();
      document.removeEventListener("visibilitychange", run);
      parent.removeEventListener("pointermove", onPointer);
      still.removeEventListener("change", run);
    };
  }, [seed]);

  return <canvas ref={ref} className="noise" aria-hidden />;
}
