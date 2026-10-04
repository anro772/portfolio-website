import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, scrollToTarget } from "../lib/motion";
import { scramble } from "../lib/scramble";

const LINKS = [
  { label: "Work", href: "#work" },
  { label: "Experience", href: "#experience" },
  { label: "Stack", href: "#stack" },
];

export function Nav() {
  const bar = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const progress = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`;
      },
    });
    // hide on scroll down, reveal on scroll up
    const hide = ScrollTrigger.create({
      start: 120,
      end: "max",
      onUpdate: (self) => {
        gsap.to(nav.current, { yPercent: self.direction === 1 ? -110 : 0, duration: 0.5, ease: "expo.out", overwrite: true });
      },
      onLeaveBack: () => gsap.to(nav.current, { yPercent: 0, duration: 0.5, ease: "expo.out", overwrite: true }),
    });
    return () => {
      progress.kill();
      hide.kill();
    };
  }, []);

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToTarget(href);
  };

  return (
    <header ref={nav} className="fixed inset-x-0 top-0" style={{ zIndex: "var(--z-nav)" }}>
      <nav className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-5 mix-blend-difference md:px-10">
        <a href="#top" onClick={go("#top")} className="flex items-center gap-3 text-bone">
          <span className="grid size-8 place-items-center rounded-full bg-bone font-mono text-[13px] font-semibold text-ink">
            as
          </span>
          <span className="hidden text-sm font-medium tracking-tight sm:inline">Andrei Stefan</span>
        </a>
        <div className="flex items-center gap-1 md:gap-2">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={go(l.href)}
              onPointerEnter={(e) => scramble(e.currentTarget.querySelector("span")!, l.label, 420)}
              className="hidden rounded-full px-4 py-2 font-mono text-[12px] uppercase tracking-[0.12em] text-bone/80 transition-colors hover:text-bone md:inline-block"
            >
              <span>{l.label}</span>
            </a>
          ))}
          <a
            href="#contact"
            onClick={go("#contact")}
            className="ml-2 rounded-full bg-bone px-5 py-2.5 text-[13px] font-medium text-ink transition-transform active:scale-[0.97]"
          >
            Get in touch
          </a>
        </div>
      </nav>
      <div className="absolute inset-x-0 bottom-0 h-px">
        <div ref={bar} className="h-full origin-left scale-x-0 bg-signal" />
      </div>
    </header>
  );
}
