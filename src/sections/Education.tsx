import { useEffect, useRef } from "react";
import { GraduationCap, Certificate, Translate } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion } from "../lib/motion";

const DOTS =
  "bg-[radial-gradient(circle,rgba(236,234,228,0.14)_1px,transparent_1.2px)] bg-[length:14px_14px]";

export function Education() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".bento-cell", {
        clipPath: "inset(100% 0 0 0)",
        duration: 1.3,
        stagger: 0.12,
        ease: "expo.inOut",
        scrollTrigger: { trigger: root.current, start: "top 70%" },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} aria-labelledby="edu-title" className="bg-ink px-5 pb-28 md:px-10 md:pb-40">
      <div className="mx-auto max-w-[1600px]">
        <h2 id="edu-title" className="mb-12 text-[clamp(2.4rem,5vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em]">
          Education
        </h2>
        <div className="grid gap-3 md:grid-cols-6 md:grid-rows-[auto_auto]">
          <article className={`bento-cell relative flex min-h-[320px] flex-col justify-between overflow-hidden border border-line bg-surface p-7 md:col-span-4 md:p-10 ${DOTS}`}>
            <GraduationCap size={32} weight="light" className="text-signal" />
            <div>
              <p className="font-mono text-[13px] text-muted">Master's, 2026</p>
              <h3 className="mt-3 max-w-[24ch] text-[clamp(1.6rem,2.8vw,2.6rem)] font-medium leading-[1.02] tracking-[-0.035em]">
                Informatic Systems for Process Management and Economic Resources
              </h3>
              <p className="mt-4 text-bone/70">Bucharest University of Economic Studies (ASE), CSIE</p>
            </div>
          </article>
          <article className="bento-cell flex min-h-[320px] flex-col justify-between bg-signal p-7 text-ink md:col-span-2 md:p-10">
            <Translate size={32} weight="light" />
            <div>
              <p className="text-[clamp(4.5rem,8vw,7rem)] font-medium leading-[0.8] tracking-[-0.06em]">C1</p>
              <p className="mt-4 max-w-[22ch] font-medium">Cambridge Certificate in Advanced English</p>
            </div>
          </article>
          <article className="bento-cell flex min-h-[260px] flex-col justify-between border border-line bg-raise p-7 md:col-span-2 md:p-10">
            <p className="font-mono text-[13px] text-muted">Bachelor's, 2023</p>
            <div>
              <h3 className="text-[clamp(1.4rem,2vw,1.9rem)] font-medium leading-[1.05] tracking-[-0.03em]">
                Economic Informatics, English Section
              </h3>
              <p className="mt-3 text-bone/70">ASE Bucharest</p>
            </div>
          </article>
          <article className="bento-cell flex min-h-[260px] flex-col justify-between gap-8 border border-line bg-surface p-7 md:col-span-4 md:p-10">
            <Certificate size={32} weight="light" className="text-signal" />
            <div>
              <p className="font-mono text-[13px] text-muted">IBM certifications</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {[
                  "Healthcare Jumpstart",
                  "Enterprise Design Thinking",
                  "Garage Essentials",
                  "Agile Explorer",
                  "watsonx Code Assistant",
                ].map((c) => (
                  <li key={c} className="border border-line px-4 py-2 text-[15px] text-bone/85">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
