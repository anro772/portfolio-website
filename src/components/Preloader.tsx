import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion, stopScroll } from "../lib/motion";

type Line = { text: string; tone?: "muted" | "signal" | "bone"; indent?: boolean };

const SESSION_KEY = "as-booted";

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
/** hh:mm:ss.ff, the way msbuild prints Time Elapsed */
const elapsed = (ms: number) => `${pad(ms / 3600000)}:${pad((ms / 60000) % 60)}:${pad((ms / 1000) % 60)}.${pad((ms % 1000) / 10)}`;

const seenThisSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Boot as a .NET build log. Every timing on screen is measured (navigation to fonts ready, and total
 * elapsed), never invented. Click or any key skips. "dotnet run" tears the screen open onto the hero.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const seam = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const quick = prefersReducedMotion() || seenThisSession();
    let cancelled = false;
    let skip = false;
    let tl: gsap.core.Timeline | null = null;
    stopScroll(true);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        if (skip) return resolve();
        const id = window.setTimeout(resolve, ms);
        skipWaiters.push(() => {
          window.clearTimeout(id);
          resolve();
        });
      });
    const skipWaiters: (() => void)[] = [];
    const onSkip = () => {
      skip = true;
      skipWaiters.splice(0).forEach((f) => f());
    };

    const push = (line: Line) => !cancelled && setLines((l) => [...l, line]);

    const finish = () => {
      if (cancelled) return;
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* storage blocked: the full boot simply plays again next time */
      }
      const done = () => {
        stopScroll(false);
        setGone(true);
      };
      if (quick) {
        onDone();
        tl = gsap.timeline({ onComplete: done }).to(root.current, { opacity: 0, duration: 0.25, ease: "power1.out" });
        return;
      }
      tl = gsap.timeline({ onComplete: done });
      tl.to(log.current, { opacity: 0, duration: 0.18, ease: "power1.in" })
        .fromTo(seam.current, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.32, ease: "expo.out" }, "<")
        .add(onDone)
        .to(top.current, { yPercent: -100, duration: 0.9, ease: "expo.inOut" }, "+=0.02")
        .to(bottom.current, { yPercent: 100, duration: 0.9, ease: "expo.inOut" }, "<")
        .to(seam.current, { opacity: 0, duration: 0.3 }, "<0.1");
    };

    const run = async () => {
      if (quick) {
        await document.fonts.ready;
        finish();
        return;
      }
      window.addEventListener("pointerdown", onSkip);
      window.addEventListener("keydown", onSkip);
      // a fresh log per run (StrictMode mounts effects twice in development)
      setLines([]);
      push({ text: "$ dotnet build anro.site", tone: "bone" });
      await wait(140);
      push({ text: "Determining projects to restore...", indent: true });
      await document.fonts.ready;
      if (cancelled) return;
      push({ text: `Restored Portfolio.csproj (in ${Math.round(performance.now())} ms).`, indent: true });
      for (const file of ["Hero.cs", "Portrait.cs", "ZeroRollbacks.wgsl", "Experience.cs", "Contact.cs"]) {
        await wait(95);
        push({ text: `Portfolio -> ${file}`, indent: true });
      }
      await wait(160);
      push({ text: "Build succeeded.", tone: "bone" });
      await wait(60);
      push({ text: "    0 Warning(s)" });
      push({ text: "    0 Error(s)", tone: "signal" });
      await wait(90);
      push({ text: `Time Elapsed ${elapsed(performance.now())}` });
      await wait(260);
      push({ text: "$ dotnet run", tone: "bone" });
      await wait(320);
      window.removeEventListener("pointerdown", onSkip);
      window.removeEventListener("keydown", onSkip);
      finish();
    };
    run();

    return () => {
      cancelled = true;
      onSkip();
      window.removeEventListener("pointerdown", onSkip);
      window.removeEventListener("keydown", onSkip);
      tl?.kill();
      stopScroll(false);
    };
  }, [onDone]);

  if (gone) return null;

  const tone = (t?: Line["tone"]) => (t === "signal" ? "text-signal" : t === "bone" ? "text-bone" : "text-muted");

  return (
    <div ref={root} className="fixed inset-0" style={{ zIndex: "var(--z-loader)" }} aria-hidden>
      <div ref={top} className="absolute inset-x-0 top-0 h-1/2 bg-ink" />
      <div ref={bottom} className="absolute inset-x-0 bottom-0 h-1/2 bg-ink" />
      <div ref={seam} className="absolute inset-x-0 top-1/2 h-px origin-center scale-x-0 bg-signal" />
      <div ref={log} className="absolute inset-0 flex flex-col justify-end p-5 font-mono text-[12px] leading-[1.7] md:p-10 md:text-[13px]">
        {lines.map((l, i) => (
          <div key={i} className={`${tone(l.tone)} ${l.indent ? "pl-[2ch]" : ""} whitespace-pre`}>
            {l.text}
            {i === lines.length - 1 ? <span className="boot-caret ml-1 inline-block h-[1.05em] w-[0.6em] translate-y-[0.18em] bg-bone" /> : null}
          </div>
        ))}
        <div className="mt-6 text-muted/70">Click or press any key to skip</div>
      </div>
    </div>
  );
}
