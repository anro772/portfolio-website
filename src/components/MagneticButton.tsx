import { useEffect, useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";

type Props = {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  variant?: "solid" | "ghost";
  cursor?: string;
  className?: string;
  external?: boolean;
};

/** Pill CTA that leans toward the pointer; the fill rises from the side the pointer entered. */
export function MagneticButton({ href, onClick, children, variant = "solid", cursor, className = "", external }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current!;
    if (prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
    };
    const enter = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const fromTop = e.clientY - r.top < r.height / 2;
      gsap.fromTo(fillRef.current, { yPercent: fromTop ? -101 : 101 }, { yPercent: 0, duration: 0.5, ease: "expo.out" });
    };
    const leave = (e: PointerEvent) => {
      xTo(0);
      yTo(0);
      const r = el.getBoundingClientRect();
      const toTop = e.clientY - r.top < r.height / 2;
      gsap.to(fillRef.current, { yPercent: toTop ? -101 : 101, duration: 0.5, ease: "expo.out" });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  const base =
    "group relative inline-flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-full px-7 py-4 text-[15px] font-medium tracking-tight transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal";
  const look =
    variant === "solid"
      ? "bg-bone text-ink"
      : "border border-bone/25 text-bone";
  const fill = variant === "solid" ? "bg-signal" : "bg-bone";
  const textHover = variant === "solid" ? "" : "group-hover:text-ink";

  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      data-cursor={cursor}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${base} ${look} ${className}`}
    >
      <span ref={fillRef} aria-hidden className={`absolute inset-0 translate-y-[101%] rounded-full ${fill}`} />
      <span className={`relative flex items-center gap-3 transition-colors duration-300 ${textHover}`}>{children}</span>
    </a>
  );
}
