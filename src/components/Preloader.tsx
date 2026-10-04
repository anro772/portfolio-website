import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion, stopScroll } from "../lib/motion";

/** Counts to 100 while fonts settle, then lifts away like a curtain. */
export function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    stopScroll(true);
    const state = { v: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        stopScroll(false);
        root.current?.remove();
      },
    });
    tl.to(state, {
      v: 100,
      duration: reduce ? 0.2 : 1.7,
      ease: "power2.inOut",
      onUpdate: () => {
        if (count.current) count.current.textContent = String(Math.round(state.v)).padStart(3, "0");
        if (bar.current) bar.current.style.transform = `scaleX(${state.v / 100})`;
      },
    });
    // hold until fonts are ready so the hero never reflows
    tl.add(() => {
      tl.pause();
      document.fonts.ready.then(() => tl.resume());
    });
    tl.add(onDone, reduce ? 0.2 : "+=0.05");
    tl.to(root.current, {
      clipPath: "inset(0 0 100% 0)",
      duration: reduce ? 0.01 : 1.1,
      ease: "expo.inOut",
    }, "<");
    return () => {
      tl.kill();
      stopScroll(false);
    };
  }, [onDone]);

  return (
    <div
      ref={root}
      className="fixed inset-0 flex flex-col justify-between bg-ink p-5 md:p-10"
      style={{ zIndex: "var(--z-loader)", clipPath: "inset(0 0 0 0)" }}
    >
      <div className="font-mono text-xs text-muted">Andrei Stefan</div>
      <div className="flex items-end justify-between gap-6">
        <div className="font-mono text-xs text-muted">Compiling portfolio</div>
        <span ref={count} className="font-mono text-[18vw] leading-[0.8] font-light tracking-tighter text-bone md:text-[11vw]">
          000
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-px bg-line">
        <div ref={bar} className="h-full origin-left scale-x-0 bg-signal" />
      </div>
    </div>
  );
}
