import { useEffect, useRef } from "react";
import { ScrollTrigger, prefersReducedMotion } from "../lib/motion";
import { onStreamParts, streamParts } from "../lib/stream";
import type { GlyphStream } from "../webgpu/GlyphStream";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const forcedOff = () => import.meta.env.DEV && new URLSearchParams(window.location.search).has("nogpu");

/**
 * Scroll from the hero into About and the hero object sheds its characters; they pour down the page
 * and land on their cells, assembling the portrait. Desktop + WebGPU only; everywhere else the
 * portrait simply types itself in as before.
 */
export function GlyphStreamLayer() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || forcedOff() || !("gpu" in navigator) || window.innerWidth < 768) return;
    let cancelled = false;
    let starting = false;
    let stream: GlyphStream | null = null;
    let trigger: ScrollTrigger | null = null;
    const el = canvas.current!;

    const aim = () => {
      const { hero, portrait } = streamParts();
      if (!stream || !hero || !portrait?.isReady) return;
      const { cells, cellW, cellH } = portrait.getCells();
      const region = hero.getObjectRegion();
      stream.aim(cells, cellW, cellH, {
        x: region.x + window.scrollX,
        y: region.y + window.scrollY,
        radius: region.radius,
      });
    };

    // scroll sets the target; the stream plays toward it at its own eased, capped pace
    const apply = (p: number) => stream?.setTarget(p);
    const show = (p: number) => {
      const { hero, portrait } = streamParts();
      hero?.setDissolve(smooth(0.03, 0.6, p));
      portrait?.setVisibility(smooth(0.84, 0.98, p));
      el.style.visibility = p > 0 && p < 1 ? "visible" : "hidden";
    };

    const giveUp = () => {
      const { hero, portrait } = streamParts();
      trigger?.kill();
      trigger = null;
      hero?.setDissolve(0);
      portrait?.setStreamMode(false);
      el.style.visibility = "hidden";
      stream?.dispose();
      stream = null;
    };

    const tryStart = async () => {
      const { hero, portrait } = streamParts();
      // the portrait image may still be loading: try again once it has laid out
      if (portrait && !portrait.isReady && !stream) portrait.onLayout = () => void tryStart();
      if (cancelled || starting || stream || !hero || !portrait?.isReady) return;
      starting = true;
      portrait.setStreamMode(true);
      try {
        const { GlyphStream: G } = await import("../webgpu/GlyphStream");
        const s = await G.create(el);
        if (cancelled) {
          s.dispose();
          return;
        }
        stream = s;
        s.onFail = giveUp;
        s.onShown = show;
      } catch {
        if (!cancelled) portrait.setStreamMode(false);
        return;
      } finally {
        starting = false;
      }
      portrait.onLayout = () => {
        aim();
        ScrollTrigger.refresh();
      };
      aim();
      trigger = ScrollTrigger.create({
        trigger: "#top",
        start: "5% top",
        endTrigger: "#about figure",
        end: "top 15%",
        onUpdate: (self) => apply(self.progress),
        // re-aim on the way in: the portrait colour mode may have changed since last time
        onToggle: (self) => self.isActive && aim(),
        onRefresh: (self) => {
          aim();
          apply(self.progress);
        },
      });
      apply(trigger.progress);
      if (import.meta.env.DEV) {
        (window as unknown as { __stream?: unknown }).__stream = { get stream() { return stream; }, apply, aim };
      }
    };

    const off = onStreamParts(() => void tryStart());
    void tryStart();
    return () => {
      cancelled = true;
      off();
      giveUp();
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: "var(--z-stream)", visibility: "hidden" }}
    />
  );
}
