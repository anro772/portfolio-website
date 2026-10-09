import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";
import { profile } from "../data/cv";
import { registerStreamPart } from "../lib/stream";

export function About() {
  const root = useRef<HTMLElement>(null);
  const portrait = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const floater = useRef<HTMLDivElement>(null);
  const tilter = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const inst = useRef<{
    setTilt: (x: number, y: number) => void;
    setTrueColor: (on: boolean) => void;
    toggle: () => void;
  } | null>(null);
  const [trueColor, setTrueColor] = useState(true);

  useEffect(() => {
    let p: { dispose: () => void } | null = null;
    let cancelled = false;
    import("../ascii/AsciiPortrait").then(({ AsciiPortrait }) => {
      if (cancelled || !portrait.current) return;
      const ap = new AsciiPortrait(portrait.current, "/me.jpeg", prefersReducedMotion());
      ap.onToggle = setTrueColor;
      p = inst.current = ap;
      registerStreamPart("portrait", ap);
    });
    return () => {
      cancelled = true;
      registerStreamPart("portrait", null);
      p?.dispose();
      inst.current = null;
    };
  }, []);

  // floating in space: a slow idle bob and sway, plus a few degrees of tilt toward the pointer
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const idle = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } });
      idle
        .to(floater.current, { y: -18, rotationY: 2.5, rotationX: -1.5, duration: 3.2 })
        .to(shadow.current, { scaleX: 0.82, opacity: 0.35, duration: 3.2 }, 0)
        .to(glow.current, { scale: 1.08, opacity: 0.9, duration: 3.2 }, 0);
    }, root);

    if (!window.matchMedia("(pointer: fine)").matches) return () => ctx.revert();
    const el = stage.current!;
    const rx = gsap.quickTo(tilter.current, "rotationX", { duration: 0.9, ease: "expo.out" });
    const ry = gsap.quickTo(tilter.current, "rotationY", { duration: 0.9, ease: "expo.out" });
    const gx = gsap.quickTo(glow.current, "x", { duration: 1.2, ease: "expo.out" });
    const gy = gsap.quickTo(glow.current, "y", { duration: 1.2, ease: "expo.out" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      ry(nx * 9);
      rx(-ny * 7);
      gx(-nx * 40);
      gy(-ny * 30);
      inst.current?.setTilt(nx, ny);
    };
    const leave = () => {
      rx(0);
      ry(0);
      gx(0);
      gy(0);
      inst.current?.setTilt(0, 0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".about-word",
        { opacity: 0.14 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: "none",
          scrollTrigger: { trigger: ".about-copy", start: "top 75%", end: "bottom 45%", scrub: true },
        },
      );
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="about" className="relative bg-ink px-5 py-28 md:px-10 md:py-40">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-14 md:grid-cols-12 md:gap-10">
        <figure className="md:col-span-5 md:self-start">
          <div
            ref={stage}
            onClick={() => inst.current?.toggle()}
            data-cursor={trueColor ? "duotone" : "colourise"}
            className="relative [perspective:1100px]"
          >
            <div
              ref={glow}
              aria-hidden
              className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgba(255,90,31,0.22),rgba(255,90,31,0.06)_55%,transparent)] opacity-70 blur-2xl"
            />
            <div ref={floater} className="[transform-style:preserve-3d]">
              <div ref={tilter} className="[transform-style:preserve-3d]">
                <div ref={portrait} className="w-full select-none" />
              </div>
            </div>
            <div
              ref={shadow}
              aria-hidden
              className="pointer-events-none mx-auto mt-6 h-6 w-3/5 rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,90,31,0.28),transparent)] opacity-50 blur-sm"
            />
          </div>
          <figcaption className="mt-5 flex items-center justify-between gap-4">
            <span className="font-mono text-[12px] text-muted">Click the portrait to switch</span>
            <div role="group" aria-label="Portrait colour" className="relative flex rounded-full border border-line p-1">
              <span
                aria-hidden
                className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-bone transition-transform duration-500 ease-out-expo ${
                  trueColor ? "" : "translate-x-full"
                }`}
              />
              {[
                { label: "Colour", on: true },
                { label: "Duotone", on: false },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={trueColor === o.on}
                  onClick={() => inst.current?.setTrueColor(o.on)}
                  className={`relative z-10 w-24 rounded-full py-1.5 font-mono text-[12px] transition-colors duration-300 ${
                    trueColor === o.on ? "text-ink" : "text-bone/70 hover:text-bone"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </figcaption>
        </figure>
        <div className="md:col-span-6 md:col-start-7 md:pt-24">
          <h2 className="mb-10 text-[clamp(2.4rem,5vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
            From junior developer to the one who <em className="font-light text-signal">keeps it running</em>.
          </h2>
          <p className="about-copy text-[clamp(1.25rem,2vw,1.75rem)] leading-[1.35] tracking-[-0.01em] text-bone">
            {profile.summary.split(" ").map((w, i) => (
              <span key={i} className="about-word">
                {w}{" "}
              </span>
            ))}
          </p>
          <dl className="mt-14 grid grid-cols-2 gap-8 border-t border-line pt-8 text-sm">
            <div>
              <dt className="text-muted">Based in</dt>
              <dd className="mt-1 text-bone">{profile.location}</dd>
            </div>
            <div>
              <dt className="text-muted">Languages</dt>
              <dd className="mt-1 text-bone">English (C1), Romanian (native)</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
