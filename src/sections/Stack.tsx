import { useEffect, useRef } from "react";
import { gsap, onScrollVelocity, prefersReducedMotion } from "../lib/motion";
import { marquee, skillGroups, languages } from "../data/cv";

export function Stack() {
  const root = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // marquee drifts on its own; scroll velocity speeds it up and flips its direction
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const track = trackRef.current!;
    let x = 0,
      dir = -1,
      boost = 0,
      raf = 0,
      visible = false;
    const off = onScrollVelocity((v) => {
      if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
      boost = Math.min(18, Math.abs(v) * 0.6);
    });
    const loop = () => {
      const half = track.scrollWidth / 2;
      boost *= 0.94;
      x += dir * (0.6 + boost);
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      track.style.transform = `translate3d(${x}px,0,0) skewX(${dir * -boost * 0.5}deg)`;
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(track);

    const ctx = gsap.context(() => {
      gsap.from(".skill-group", {
        y: 60,
        opacity: 0,
        duration: 1.2,
        stagger: 0.1,
        ease: "expo.out",
        scrollTrigger: { trigger: ".skill-grid", start: "top 80%" },
      });
    }, root);

    return () => {
      off();
      io.disconnect();
      cancelAnimationFrame(raf);
      ctx.revert();
    };
  }, []);

  const words = [...marquee, ...marquee];

  return (
    <section ref={root} id="stack" className="relative overflow-hidden bg-ink py-28 md:py-40">
      <div className="border-y border-line py-6 md:py-8" aria-hidden>
        <div ref={trackRef} className="marquee-track">
          {words.map((w, i) => (
            <span
              key={i}
              className={`flex shrink-0 items-center whitespace-nowrap px-6 text-[clamp(2.75rem,7vw,7rem)] font-medium leading-none tracking-[-0.05em] md:px-10 ${
                i % 3 === 1 ? "text-stroke" : "text-bone"
              }`}
            >
              {w}
              <span className="ml-12 inline-block size-3 rotate-45 bg-signal md:ml-20 md:size-4" />
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-24 max-w-[1600px] px-5 md:mt-32 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <h2 className="text-[clamp(2.4rem,5vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">The toolkit</h2>
            <p className="mt-6 max-w-[34ch] text-bone/70">
              .NET at work, whatever the problem needs after hours. Fluent in {languages.slice(0, 4).join(", ")} and more.
            </p>
          </div>
          <div className="skill-grid grid gap-x-10 gap-y-14 sm:grid-cols-2 md:col-span-8">
            {skillGroups.map((g) => (
              <div key={g.name} className="skill-group">
                <h3 className="mb-5 border-b border-line pb-3 font-mono text-[13px] text-muted">{g.name}</h3>
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {g.items.map((s) => (
                    <li
                      key={s}
                      className="text-[clamp(1.15rem,1.6vw,1.45rem)] tracking-[-0.02em] text-bone/60 transition-colors duration-300 hover:text-signal"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
