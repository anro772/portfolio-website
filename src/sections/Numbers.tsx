import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";
import { numbers } from "../data/cv";

// staggered placement on a 12-col grid so the band reads as a composition, not a stat row
const PLACE = [
  "md:col-span-4 md:col-start-1",
  "md:col-span-4 md:col-start-6 md:mt-24",
  "md:col-span-3 md:col-start-10 md:mt-8",
  "md:col-span-4 md:col-start-2 md:-mt-4",
  "md:col-span-5 md:col-start-7 md:mt-16",
];

export function Numbers() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".num").forEach((el) => {
        const target = Number(el.dataset.value);
        const state = { v: 0 };
        gsap.to(state, {
          v: target,
          duration: reduce ? 0 : 2,
          ease: "expo.out",
          onUpdate: () => (el.textContent = String(Math.round(state.v))),
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });
      if (!reduce) {
        gsap.utils.toArray<HTMLElement>(".num-item").forEach((el, i) => {
          gsap.from(el, {
            y: 80 + i * 10,
            opacity: 0,
            duration: 1.3,
            ease: "expo.out",
            scrollTrigger: { trigger: el, start: "top 90%" },
          });
        });
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} aria-label="Track record" className="relative overflow-hidden bg-ink px-5 py-28 md:px-10 md:py-36">
      <div className="mx-auto max-w-[1600px]">
        <h2 className="max-w-[18ch] text-[clamp(2rem,4vw,3.5rem)] font-medium leading-[1] tracking-[-0.04em]">
          Two and a half years on a GxP-regulated system.
        </h2>
        <div className="mt-20 grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-12 md:gap-y-10">
          {numbers.map((n, i) => (
            <div key={n.label} className={`num-item ${PLACE[i]} ${i === 4 ? "col-span-2" : ""}`}>
              <div className="flex items-start font-medium leading-[0.8] tracking-[-0.06em] text-bone">
                <span
                  className={`num tabular-nums ${i === 4 ? "text-signal" : ""} text-[clamp(5rem,13vw,13rem)]`}
                  data-value={n.value}
                >
                  {n.value}
                </span>
                {n.suffix ? (
                  <span className="mt-[0.1em] text-[clamp(2rem,5vw,5rem)] text-signal">{n.suffix}</span>
                ) : null}
              </div>
              <p className="mt-4 max-w-[22ch] border-t border-line pt-3 text-sm text-muted md:text-base">{n.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
