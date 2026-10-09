import { useEffect, useRef, useState } from "react";
import { ArrowDownRight } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion, scrollToTarget } from "../lib/motion";
import { SplitText } from "../components/SplitText";
import { MagneticButton } from "../components/MagneticButton";

const SHAPE_LABELS = ["Controller", "Code", "D20", "WASD", "CPU"];

type Morph = { zoom: number; dispose: () => void; goTo: (i: number) => void };

export function Hero({ ready }: { ready: boolean }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const objRef = useRef<Morph | null>(null);
  const [shape, setShape] = useState(0);
  // mouse users get the decode lens as their cursor over the object; touch keeps the drag label
  const [fineLens] = useState(() => window.matchMedia("(pointer: fine)").matches && !prefersReducedMotion());

  // WebGL is a progressive layer: only created if WebGL2 is really available
  useEffect(() => {
    let cancelled = false;
    import("../webgl/AsciiMorph").then(({ AsciiMorph }) => {
      if (cancelled || !stage.current || !AsciiMorph.supported()) return;
      const obj = new AsciiMorph(stage.current, prefersReducedMotion());
      obj.onShape = setShape;
      objRef.current = obj;
      stage.current.dataset.live = "true";
    });
    return () => {
      cancelled = true;
      objRef.current?.dispose();
      objRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const chars = gsap.utils.toArray<HTMLElement>(".hero-name .split-char");
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from(chars, { yPercent: 115, rotate: 8, duration: reduce ? 0 : 1.4, stagger: 0.045 })
        .from(".hero-fade", { y: 24, opacity: 0, duration: reduce ? 0 : 1.1, stagger: 0.08 }, "-=1.0");

      if (!reduce) {
        gsap.to(content.current, {
          yPercent: -18,
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
        const state = { z: 0 };
        gsap.to(state, {
          z: 1.6,
          ease: "none",
          onUpdate: () => {
            if (objRef.current) objRef.current.zoom = state.z;
          },
          scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
        });
      }
    }, root);
    return () => ctx.revert();
  }, [ready]);

  return (
    <section id="top" ref={root} className="relative min-h-[100dvh] overflow-hidden bg-ink">
      <div
        ref={stage}
        aria-hidden
        data-cursor={fineLens ? "lens" : "drag"}
        className="absolute inset-0 cursor-grab data-[grabbing]:cursor-grabbing bg-[radial-gradient(60%_60%_at_68%_45%,#1c1c1f_0%,#0c0c0d_70%)]"
      />
      <div
        ref={content}
        className="pointer-events-none relative mx-auto flex min-h-[100dvh] max-w-[1600px] flex-col justify-end px-5 pb-10 pt-24 md:px-10 md:pb-14"
      >
        <div className="hero-fade pointer-events-auto absolute right-5 top-24 hidden flex-col items-end gap-3 md:right-10 md:flex">
          <div role="group" aria-label="Hero object shape" className="flex gap-1 font-mono text-[12px]">
            {SHAPE_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={shape === i}
                onClick={() => objRef.current?.goTo(i)}
                className={`rounded-full px-3 py-1.5 transition-colors duration-300 ${
                  shape === i ? "bg-bone text-ink" : "text-bone/55 hover:text-bone"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="font-mono text-[12px] text-muted">Drag to spin. Hold to charge. Click to morph.</p>
        </div>
        <p className="hero-fade mb-6 max-w-xs font-mono text-[12px] uppercase tracking-[0.16em] text-muted">
          Application developer at IBM
        </p>
        <h1 className="hero-name kinetic-name text-[clamp(4rem,15vw,15.5rem)] font-medium leading-[0.86] tracking-[-0.055em] text-bone">
          <SplitText text="Andrei" className="block" />
          <SplitText text="Stefan" className="block pl-[0.6em] md:pl-[1.4em]" />
        </h1>
        <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <p className="hero-fade max-w-[34ch] text-lg leading-snug text-bone/75 md:text-xl">
            .NET developer keeping a regulated pharma platform shipping, on schedule and without rollbacks.
          </p>
          <div className="hero-fade pointer-events-auto flex flex-wrap gap-3">
            <MagneticButton onClick={() => scrollToTarget("#work")} href="#work" cursor="view">
              View work <ArrowDownRight size={18} weight="bold" />
            </MagneticButton>
            <MagneticButton onClick={() => scrollToTarget("#contact")} href="#contact" variant="ghost">
              Get in touch
            </MagneticButton>
          </div>
        </div>
      </div>
    </section>
  );
}
