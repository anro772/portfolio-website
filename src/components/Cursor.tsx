import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/motion";

/**
 * Dot + delayed ring. Fast movement sheds fading rings and dots.
 * Targets with data-cursor="view|open|drag|play" expand the ring into a label; data-cursor-color fills it.
 * Coarse pointers get a tap-positioned label pulse instead.
 */
const LABELS: Record<string, string> = { view: "View", open: "Open", drag: "Drag", play: "Play", copy: "Copy", pulse: "Pulse", colourise: "Colour", duotone: "Duotone", stir: "Stir" };

export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const tapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = prefersReducedMotion();
    const dot = dotRef.current!;
    const ring = ringRef.current!;
    const label = labelRef.current!;
    const trail = trailRef.current!;
    const tap = tapRef.current!;

    if (!fine) {
      // touch: label pulse at the tap point
      const onDown = (e: PointerEvent) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>("[data-cursor]");
        if (!t) return;
        const text = LABELS[t.dataset.cursor ?? ""] ?? "";
        tap.textContent = text;
        tap.style.left = `${e.clientX}px`;
        tap.style.top = `${e.clientY}px`;
        tap.style.background = t.dataset.cursorColor ?? "var(--color-signal)";
        tap.animate(
          [
            { transform: "translate(-50%,-50%) scale(0.4)", opacity: 0 },
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.3 },
            { transform: "translate(-50%,-50%) scale(1.15)", opacity: 0 },
          ],
          { duration: 700, easing: "cubic-bezier(0.16,1,0.3,1)" },
        );
      };
      window.addEventListener("pointerdown", onDown, { passive: true });
      return () => window.removeEventListener("pointerdown", onDown);
    }

    document.documentElement.classList.add("has-cursor");
    let mx = window.innerWidth / 2,
      my = window.innerHeight / 2,
      rx = mx,
      ry = my,
      lastX = mx,
      lastY = my,
      shown = false,
      raf = 0,
      lastSpawn = 0,
      spawnToggle = false;
    let scale = 1,
      targetScale = 1;

    // pool of trail particles
    const pool: HTMLDivElement[] = [];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement("div");
      p.className = "pointer-events-none absolute left-0 top-0 rounded-full";
      p.style.opacity = "0";
      trail.appendChild(p);
      pool.push(p);
    }
    let poolIdx = 0;

    const setVisible = (v: boolean) => {
      shown = v;
      ring.style.opacity = v && ring.dataset.state !== "lens" ? "1" : "0";
      dot.style.opacity = v && ring.dataset.state !== "label" ? "1" : "0";
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!shown) {
        rx = mx;
        ry = my;
        setVisible(true);
      }
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`;
    };

    const onOver = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      const t = el.closest<HTMLElement>("[data-cursor]");
      // over the hero object the decode lens is the cursor: keep only the precise dot
      if (t?.dataset.cursor === "lens") {
        ring.dataset.state = "lens";
        ring.style.opacity = "0";
        label.textContent = "";
        dot.style.opacity = shown ? "1" : "0";
        targetScale = 1;
        return;
      }
      ring.style.opacity = shown ? "1" : "0";
      if (t) {
        const text = LABELS[t.dataset.cursor ?? ""] ?? t.dataset.cursor ?? "";
        label.textContent = text;
        ring.dataset.state = "label";
        ring.style.background = t.dataset.cursorColor ?? "var(--color-bone)";
        ring.style.borderColor = "transparent";
        label.style.color = "var(--color-ink)";
        targetScale = 1;
        dot.style.opacity = "0";
        return;
      }
      ring.dataset.state = "";
      ring.style.background = "transparent";
      ring.style.borderColor = "";
      label.textContent = "";
      dot.style.opacity = shown ? "1" : "0";
      targetScale = el.closest("a, button, [role=button]") ? 1.7 : 1;
    };

    const onDown = () => (targetScale *= 0.8);
    const onUp = () => (targetScale /= 0.8);
    const onLeave = () => setVisible(false);
    // a click can change a target's label (e.g. a toggle), so re-read it after React updates
    const onClick = (e: MouseEvent) => requestAnimationFrame(() => onOver(e as PointerEvent));

    const spawn = (x: number, y: number, speed: number) => {
      const p = pool[poolIdx++ % pool.length];
      spawnToggle = !spawnToggle;
      const isRing = spawnToggle;
      const size = isRing ? 26 + Math.min(30, speed * 0.3) : 6;
      p.style.width = p.style.height = `${size}px`;
      p.style.border = isRing ? "1px solid rgba(236,234,228,0.5)" : "none";
      p.style.background = isRing ? "transparent" : "var(--color-signal)";
      p.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%,-50%) scale(1)`, opacity: 0.7 },
          { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%,-50%) scale(${isRing ? 1.8 : 0.2})`, opacity: 0 },
        ],
        { duration: isRing ? 700 : 500, easing: "cubic-bezier(0.16,1,0.3,1)" },
      );
    };

    const loop = (now: number) => {
      const k = reduce ? 1 : 0.16;
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      scale += (targetScale - scale) * 0.18;
      const isLabel = ring.dataset.state === "label";
      const size = isLabel ? 84 : 34;
      ring.style.width = ring.style.height = `${size}px`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${scale})`;

      const speed = Math.hypot(mx - lastX, my - lastY);
      if (!reduce && shown && speed > 22 && now - lastSpawn > 28) {
        spawn(mx, my, speed);
        lastSpawn = now;
      }
      lastX = mx;
      lastY = my;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("click", onClick);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("click", onClick);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      pool.forEach((p) => p.remove());
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: "var(--z-cursor)" }}>
      <div ref={trailRef} className="absolute inset-0" />
      <div
        ref={ringRef}
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border border-bone/60 opacity-0 transition-[background-color,border-color,width,height] duration-300 ease-out-expo"
      >
        <span ref={labelRef} className="font-mono text-[11px] font-medium uppercase tracking-[0.14em]" />
      </div>
      <div ref={dotRef} className="absolute left-0 top-0 size-[6px] rounded-full bg-signal opacity-0" />
      <div
        ref={tapRef}
        className="absolute left-0 top-0 rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink opacity-0"
      />
    </div>
  );
}
