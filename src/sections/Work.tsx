import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "../lib/motion";
import { projects, type Project } from "../data/cv";
import { GlyphField } from "../ascii/GlyphField";

const featured = projects.slice(0, 2);
const rest = projects.slice(2);

function FeaturedCard({ p, className = "" }: { p: Project; className?: string }) {
  return (
    <a
      href={p.href}
      target="_blank"
      rel="noreferrer"
      data-cursor="open"
      data-cursor-color="#ff5a1f"
      className={`work-card group block [perspective:1200px] ${className}`}
    >
      <article className="work-inner flex h-full flex-col border border-line bg-surface transition-colors duration-500 group-hover:border-bone/30">
        <div className="relative aspect-[16/10] overflow-hidden border-b border-line">
          <canvas
            data-pattern={p.pattern}
            data-seed={p.seed}
            aria-hidden
            className="absolute inset-0 h-full w-full transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]"
          />
        </div>
        <div className="flex flex-col gap-5 p-6 md:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="text-[clamp(1.6rem,2.6vw,2.6rem)] font-medium leading-none tracking-[-0.035em]">{p.name}</h3>
              <p className="mt-2 font-mono text-[12px] text-muted">
                {p.kind}
                {p.year ? `, ${p.year}` : ""}
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line transition-all duration-500 group-hover:rotate-45 group-hover:border-signal group-hover:bg-signal group-hover:text-ink">
              <ArrowUpRight size={18} weight="bold" />
            </span>
          </div>
          <p className="max-w-[54ch] text-[15px] leading-relaxed text-bone/75">{p.blurb}</p>
          <ul className="flex flex-wrap gap-2">
            {p.tags.map((t) => (
              <li key={t} className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-bone/70">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </article>
    </a>
  );
}

export function Work() {
  const root = useRef<HTMLElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const previewField = useRef<GlyphField | null>(null);

  // glyph visuals: featured cards + the floating index preview, animated only while on screen
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const canvases = Array.from(root.current!.querySelectorAll<HTMLCanvasElement>(".work-card canvas[data-pattern]"));
    const fields = canvases.map((c) => new GlyphField(c, c.dataset.pattern as Project["pattern"], Number(c.dataset.seed)));
    const hot = canvases.map(() => 0);
    const hovered = canvases.map(() => false);
    const offs = canvases.map((c, i) => {
      const card = c.closest<HTMLElement>(".work-card")!;
      const enter = () => (hovered[i] = true);
      const leave = () => (hovered[i] = false);
      card.addEventListener("pointerenter", enter);
      card.addEventListener("pointerleave", leave);
      return () => {
        card.removeEventListener("pointerenter", enter);
        card.removeEventListener("pointerleave", leave);
      };
    });
    const pf = new GlyphField(previewCanvas.current!, rest[0].pattern, rest[0].seed);
    previewField.current = pf;

    let raf = 0,
      last = 0,
      t = 1.2;
    const onScreen = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      fields.forEach((f, i) => {
        hot[i] += ((hovered[i] ? 1 : 0) - hot[i]) * 0.12;
        if (onScreen(canvases[i])) f.draw(t * (1 + hot[i] * 1.5), hot[i]);
      });
      if (activeRef.current !== null) pf.draw(t * 1.6, 0.6);
    };
    fields.forEach((f) => f.draw(t, 0));
    const st = ScrollTrigger.create({
      trigger: root.current,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => {
        cancelAnimationFrame(raf);
        if (self.isActive && !reduce) raf = requestAnimationFrame(frame);
      },
    });
    const ro = new ResizeObserver(() => {
      fields.forEach((f) => (f.resize(), f.draw(t, 0)));
      pf.resize();
    });
    canvases.forEach((c) => ro.observe(c));
    ro.observe(previewCanvas.current!);

    // pointer tilt on featured cards
    const tilts = gsap.utils.toArray<HTMLElement>(".work-card", root.current).map((card) => {
      if (reduce || !window.matchMedia("(pointer: fine)").matches) return () => {};
      const inner = card.querySelector<HTMLElement>(".work-inner")!;
      const rx = gsap.quickTo(inner, "rotationX", { duration: 0.8, ease: "expo.out" });
      const ry = gsap.quickTo(inner, "rotationY", { duration: 0.8, ease: "expo.out" });
      const move = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 6);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 6);
      };
      const leave = () => (rx(0), ry(0));
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerleave", leave);
      return () => {
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerleave", leave);
      };
    });

    return () => {
      cancelAnimationFrame(raf);
      st.kill();
      ro.disconnect();
      offs.forEach((off) => off());
      tilts.forEach((off) => off());
    };
  }, []);

  // floating preview follows the pointer across the index
  useEffect(() => {
    if (prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const list = root.current!.querySelector<HTMLElement>(".work-index")!;
    const el = preview.current!;
    const xTo = gsap.quickTo(el, "x", { duration: 0.7, ease: "expo.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.7, ease: "expo.out" });
    const rTo = gsap.quickTo(el, "rotation", { duration: 0.9, ease: "expo.out" });
    let lastX = 0;
    const move = (e: PointerEvent) => {
      const r = list.getBoundingClientRect();
      // sit to the right of the pointer, but never past the column edge
      xTo(Math.min(e.clientX - r.left + 48, r.width - 340));
      yTo(e.clientY - r.top);
      // lean into the direction of travel
      rTo(Math.max(-8, Math.min(8, (e.clientX - lastX) * 0.4)));
      lastX = e.clientX;
    };
    list.addEventListener("pointermove", move);
    return () => list.removeEventListener("pointermove", move);
  }, []);

  // reveals
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".work-card", {
        y: 80,
        opacity: 0,
        duration: 1.3,
        stagger: 0.15,
        ease: "expo.out",
        scrollTrigger: { trigger: ".work-featured", start: "top 80%" },
      });
      gsap.from(".work-row", {
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.07,
        ease: "expo.out",
        scrollTrigger: { trigger: ".work-index", start: "top 85%" },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const show = (i: number | null) => {
    activeRef.current = i;
    setActive(i);
    if (i !== null) previewField.current?.setPattern(rest[i].pattern, rest[i].seed);
  };

  return (
    <section ref={root} id="work" className="relative bg-ink px-5 py-28 md:px-10 md:py-40">
      <div className="mx-auto max-w-[1600px]">
        <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.16em] text-muted">Selected work</p>
        <h2 className="max-w-[14ch] text-[clamp(3rem,7vw,7.5rem)] font-medium leading-[0.88] tracking-[-0.05em]">
          Things I build <span className="text-stroke">after hours</span>
        </h2>
        <p className="mt-8 max-w-[40ch] text-bone/70">Two theses and a pile of tools I wrote because I wanted them to exist.</p>

        <div className="work-featured mt-16 grid gap-6 md:mt-24 md:grid-cols-12 md:gap-8">
          <FeaturedCard p={featured[0]} className="md:col-span-7" />
          <FeaturedCard p={featured[1]} className="md:col-span-5 md:mt-40" />
        </div>

        <div className="mt-24 md:mt-32">
          <h3 className="mb-8 text-[clamp(1.6rem,2.6vw,2.4rem)] font-medium tracking-[-0.03em]">Tools, automation and mods</h3>
          <div className="work-index relative" onPointerLeave={() => show(null)}>
            <ul className="border-t border-line">
              {rest.map((p, i) => (
                <li key={p.name} className="work-row border-b border-line">
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    data-cursor="open"
                    onPointerEnter={() => show(i)}
                    onFocus={() => show(i)}
                    onBlur={() => show(null)}
                    className="group grid grid-cols-1 gap-3 py-7 md:grid-cols-12 md:items-baseline md:gap-6 md:py-9"
                  >
                    <span
                      className={`text-[clamp(2rem,4.4vw,4.2rem)] font-medium leading-none tracking-[-0.045em] transition-all duration-500 ease-out-expo md:col-span-5 ${
                        active === null || active === i ? "text-bone" : "text-bone/30"
                      } group-hover:translate-x-3`}
                    >
                      {p.name}
                    </span>
                    <span className="font-mono text-[12px] text-muted md:col-span-2">{p.kind}</span>
                    <span className="max-w-[46ch] text-[15px] leading-relaxed text-bone/65 md:col-span-4">{p.blurb}</span>
                    <span className="hidden justify-self-end md:col-span-1 md:flex">
                      <span className="grid size-11 place-items-center rounded-full border border-line transition-all duration-500 group-hover:rotate-45 group-hover:border-signal group-hover:bg-signal group-hover:text-ink">
                        <ArrowUpRight size={18} weight="bold" />
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div
              ref={preview}
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 hidden md:block"
              style={{ zIndex: 1 }}
            >
              <div
                className={`-translate-y-1/2 border border-line bg-surface transition-[opacity,scale] duration-500 ease-out-expo ${
                  active === null ? "scale-75 opacity-0" : "scale-100 opacity-100"
                }`}
              >
                <canvas ref={previewCanvas} className="block h-[220px] w-[340px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
