import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "../lib/motion";
import { scramble } from "../lib/scramble";
import { experience } from "../data/cv";

export function Experience() {
  const root = useRef<HTMLElement>(null);
  const year = useRef<HTMLSpanElement>(null);
  const company = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      const roles = gsap.utils.toArray<HTMLElement>(".role");
      // the pinned year follows the last role whose top has crossed 55% of the viewport; derived from
      // positions on every update, so fast flicks and jumps still land on the right year
      let current = -1;
      const show = (i: number) => {
        if (i === current) return;
        current = i;
        const role = experience[i];
        if (year.current && year.current.textContent !== role.year) scramble(year.current, role.year, 500);
        if (company.current && company.current.textContent !== role.company) scramble(company.current, role.company, 500);
      };
      const pick = () => {
        const line = window.innerHeight * 0.55;
        let idx = 0;
        roles.forEach((el, i) => {
          if (el.getBoundingClientRect().top < line) idx = i;
        });
        show(idx);
      };
      ScrollTrigger.create({
        trigger: root.current,
        start: "top bottom",
        end: "bottom top",
        onUpdate: pick,
        onRefresh: pick,
      });

      roles.forEach((el) => {
        if (reduce) return;
        const title = el.querySelector<HTMLElement>(".role-title");
        ScrollTrigger.create({
          trigger: el,
          start: "top 80%",
          once: true,
          onEnter: () => title && scramble(title, title.dataset.text ?? "", 800),
        });
        gsap.from(el.querySelectorAll(".role-point"), {
          x: 40,
          opacity: 0,
          duration: 1,
          stagger: 0.07,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 70%" },
        });
        gsap.fromTo(
          el.querySelector(".role-line"),
          { scaleX: 0 },
          { scaleX: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 80%", end: "top 30%", scrub: true } },
        );
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="experience" className="relative bg-surface px-5 py-28 md:px-10 md:py-40">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-28">
            <h2 className="text-[clamp(2.4rem,5vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">Experience</h2>
            <div className="mt-10 hidden md:block" aria-hidden>
              <span ref={year} className="block font-mono text-[clamp(6rem,11vw,11rem)] leading-[0.85] tracking-[-0.06em] text-signal">
                {experience[0].year}
              </span>
              <span ref={company} className="mt-4 block font-mono text-lg uppercase tracking-[0.12em] text-muted">
                {experience[0].company}
              </span>
            </div>
          </div>
        </div>
        <ol className="md:col-span-7 md:pt-4">
          {experience.map((r) => (
            <li key={r.title} className="role relative pb-24 last:pb-0">
              <div className="role-line mb-8 h-px origin-left bg-bone/30" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h3
                  className="role-title text-[clamp(1.6rem,2.6vw,2.4rem)] font-medium tracking-[-0.03em]"
                  data-text={r.title}
                >
                  {r.title}
                </h3>
                <span className="font-mono text-[13px] text-muted">{r.period}</span>
              </div>
              <p className="mt-2 text-bone/70">
                {r.company}, Bucharest{r.context ? `. ${r.context}` : ""}
              </p>
              <ul className="mt-8 grid gap-4">
                {r.points.map((p) => (
                  <li key={p} className="role-point grid grid-cols-[1.25rem_1fr] text-[17px] leading-relaxed text-bone/85">
                    <span aria-hidden className="mt-[0.7em] h-px w-2.5 bg-signal" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
