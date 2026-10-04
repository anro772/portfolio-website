import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, DownloadSimple } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion } from "../lib/motion";
import { profile } from "../data/cv";
import { MagneticButton } from "../components/MagneticButton";

export function Contact() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let fluid: { dispose: () => void } | null = null;
    let cancelled = false;
    import("../webgl/FluidGradient").then(({ FluidGradient }) => {
      if (cancelled || !stage.current) return;
      try {
        fluid = new FluidGradient(stage.current, prefersReducedMotion());
      } catch {
        // no WebGL: the CSS gradient underneath stays
      }
    });
    return () => {
      cancelled = true;
      fluid?.dispose();
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".contact-line .split-char", {
        yPercent: 110,
        duration: 1.2,
        stagger: 0.02,
        ease: "expo.out",
        scrollTrigger: { trigger: ".contact-line", start: "top 85%" },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  const [user, domain] = profile.email.split("@");
  const chars = (s: string) =>
    [...s].map((c, i) => (
      <span key={i} className="split-char">
        {c}
      </span>
    ));

  return (
    <section
      ref={root}
      id="contact"
      className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[radial-gradient(70%_60%_at_75%_40%,#3a1408_0%,#0c0c0d_70%)]"
    >
      <div ref={stage} aria-hidden className="absolute inset-0 -z-10" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-center px-5 pb-16 pt-32 md:px-10">
        <p className="mb-8 font-mono text-[12px] uppercase tracking-[0.16em] text-bone/70">Open to new roles</p>
        <h2 className="max-w-[16ch] text-[clamp(2.6rem,6vw,6rem)] font-medium leading-[0.92] tracking-[-0.05em]">
          Need someone who ships carefully?
        </h2>

        <button
          type="button"
          onClick={copy}
          data-cursor="copy"
          className="contact-line group mt-14 block w-fit max-w-full text-left focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-signal"
          aria-label={`Copy email address ${profile.email}`}
        >
          <span className="block break-all text-[clamp(1.9rem,6.4vw,7.2rem)] font-medium leading-[1] tracking-[-0.05em]">
            <span className="line-mask">{chars(user)}</span>
            <span className="line-mask text-signal">{chars("@")}</span>
            <span className="line-mask">{chars(domain)}</span>
          </span>
          <span className="mt-4 block h-[2px] origin-left scale-x-0 bg-bone transition-transform duration-700 ease-out-expo group-hover:scale-x-100" />
        </button>
        <p role="status" aria-live="polite" className="mt-4 h-6 font-mono text-[13px] text-bone/80">
          {copied ? "Copied to clipboard" : ""}
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <MagneticButton href="/Andrei-Stefan-CV.pdf" cursor="open" external>
            Download CV <DownloadSimple size={18} weight="bold" />
          </MagneticButton>
          <MagneticButton href={profile.github} variant="ghost" cursor="open" external>
            GitHub <ArrowUpRight size={16} weight="bold" />
          </MagneticButton>
          <MagneticButton href={profile.linkedin} variant="ghost" cursor="open" external>
            LinkedIn <ArrowUpRight size={16} weight="bold" />
          </MagneticButton>
          <a href={profile.phoneHref} className="px-4 font-mono text-sm text-bone/80 underline-offset-4 hover:text-bone hover:underline">
            {profile.phone}
          </a>
        </div>
      </div>
      <footer className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 border-t border-bone/15 px-5 py-6 text-[13px] text-bone/60 md:px-10">
        <span>Andrei Stefan, {new Date().getFullYear()}</span>
        <span>Built with React, GSAP and Three.js</span>
      </footer>
    </section>
  );
}
