import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "../lib/motion";
import { scramble } from "../lib/scramble";
import { numbers } from "../data/cv";
import { Numbers } from "./Numbers";
import type { Tier, ZeroRollbacks as Renderer } from "../webgpu/ZeroRollbacks";

const STAGES = [
  { figure: "", text: "Every regulated system starts as noise." },
  { figure: "30+", text: "production incidents diagnosed and closed through Azure Application Insights." },
  { figure: "100+", text: "changes merged across five major releases, including 30+ Snyk vulnerability fixes." },
  { figure: "0", text: "rollbacks. Every release dry-run first, every IQ protocol accepted without findings." },
];

type Mode = "pending" | "gpu" | "fallback";

const forcedOff = () =>
  typeof window !== "undefined" && import.meta.env.DEV && new URLSearchParams(window.location.search).has("nogpu");

/** Scroll progress (0..1) to story position (0..3), holding briefly on each figure so it can be read. */
function storyPosition(progress: number) {
  const q = progress * 3.4;
  const n = Math.floor(q);
  if (n >= 3) return 3;
  const f = q - n;
  const t = Math.min(1, Math.max(0, (f - 0.3) / 0.7));
  return n + t * t * (3 - 2 * t);
}

export function ZeroRollbacks() {
  const [mode, setMode] = useState<Mode>(() =>
    prefersReducedMotion() || forcedOff() || !("gpu" in navigator) ? "fallback" : "pending",
  );
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const figureRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const renderer = useRef<Renderer | null>(null);
  const [stage, setStage] = useState(0);

  // WebGPU is a progressive layer: the classic numbers band stays the fallback
  const initialMode = useRef(mode);
  useEffect(() => {
    if (initialMode.current !== "pending") return;
    let cancelled = false;
    let current: Renderer | null = null;

    const boot = async (tier: Tier) => {
      const { ZeroRollbacks: R } = await import("../webgpu/ZeroRollbacks");
      if (cancelled || !canvas.current) return;
      const r = await R.create(canvas.current, tier);
      if (cancelled) {
        r.dispose();
        return;
      }
      current = r;
      if (import.meta.env.DEV) (window as unknown as { __zr?: Renderer }).__zr = r;
      renderer.current = r;
      // slow devices downgrade inside the renderer; only a real failure swaps in the static band
      r.onFail = () => !cancelled && setMode("fallback");
      setMode("gpu");
      ScrollTrigger.refresh();
    };

    boot(window.innerWidth < 768 ? "low" : "high").catch(() => !cancelled && setMode("fallback"));
    return () => {
      cancelled = true;
      current?.dispose();
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  // pin + scrub the story, run the GPU loop only while the section is on screen
  useEffect(() => {
    if (mode !== "gpu") return;
    const small = window.innerWidth < 768;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.current,
        start: "top top",
        end: small ? "+=120%" : "+=160%",
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => {
          const p = storyPosition(self.progress);
          renderer.current?.setProgress(p);
          setStage(p < 0.55 ? 0 : p < 1.5 ? 1 : p < 2.5 ? 2 : 3);
          bars.current.forEach((b, i) => {
            if (b) b.style.transform = `scaleX(${Math.min(1, Math.max(0, p - i))})`;
          });
        },
      });
      // The pin spacer spans the whole pinned distance; the section itself does not (it is fixed
      // while pinned), so anything measured on it would stop the loop halfway through the story.
      const spacer = root.current!.parentElement!;
      // the 0 dims as Experience scrolls over it
      ScrollTrigger.create({
        trigger: spacer,
        start: "bottom 85%",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => renderer.current?.setFade(1 - self.progress * 0.85),
      });
    }, root);
    const spacer = root.current!.parentElement!;
    const io = new IntersectionObserver(([e]) => renderer.current?.setActive(e.isIntersecting));
    io.observe(spacer);
    return () => {
      io.disconnect();
      ctx.revert();
      renderer.current?.stop();
    };
  }, [mode]);

  // decode the copy whenever the figure changes
  useEffect(() => {
    if (mode !== "gpu") return;
    const s = STAGES[stage];
    const cancels = [
      figureRef.current && scramble(figureRef.current, s.figure, 420),
      textRef.current && scramble(textRef.current, s.text, 700),
    ];
    return () => cancels.forEach((c) => c && c());
  }, [stage, mode]);

  if (mode === "fallback") return <Numbers />;

  const move = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    renderer.current?.setPointer(e.clientX - r.left, e.clientY - r.top);
  };

  return (
    <section
      ref={root}
      aria-label="Track record"
      data-cursor="stir"
      onPointerMove={move}
      onPointerLeave={() => renderer.current?.setPointer(null, null)}
      className="relative h-[100dvh] overflow-hidden bg-ink"
    >
      <canvas ref={canvas} aria-hidden className="absolute inset-0 block h-full w-full touch-pan-y" />

      <dl className="sr-only">
        {numbers.map((n) => (
          <div key={n.label}>
            <dt>{n.label}</dt>
            <dd>
              {n.value}
              {n.suffix}
            </dd>
          </div>
        ))}
      </dl>

      <div className="pointer-events-none relative mx-auto flex h-full max-w-[1600px] flex-col justify-between px-5 pb-10 pt-24 md:px-10 md:pb-14 md:pt-28">
        <h2 className="max-w-[16ch] text-[clamp(2rem,4vw,3.5rem)] font-medium leading-[1] tracking-[-0.04em]">
          Two and a half years on a GxP-regulated system.
        </h2>

        <div aria-hidden className="max-w-[30rem]">
          <div className="mb-6 flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="relative h-px w-14 overflow-hidden bg-bone/20">
                <span
                  ref={(el) => {
                    bars.current[i] = el;
                  }}
                  className="absolute inset-0 origin-left scale-x-0 bg-signal"
                />
              </span>
            ))}
          </div>
          <p className="min-h-[5.5rem] text-[clamp(1.1rem,1.6vw,1.4rem)] leading-snug text-bone/80">
            <span ref={figureRef} className="mr-2 font-mono font-medium text-signal" />
            <span ref={textRef}>{STAGES[0].text}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
