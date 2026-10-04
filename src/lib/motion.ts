import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isCoarsePointer = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

let lenis: Lenis | null = null;
const velocityListeners = new Set<(v: number) => void>();

/** Lenis drives scroll; GSAP's ticker drives Lenis so ScrollTrigger and smooth scroll share one frame. */
export function initSmoothScroll() {
  if (lenis || prefersReducedMotion()) return () => {};
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
  lenis.on("scroll", (e: Lenis) => {
    ScrollTrigger.update();
    velocityListeners.forEach((fn) => fn(e.velocity));
  });
  const tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

export function getLenis() {
  return lenis;
}

export function onScrollVelocity(fn: (v: number) => void) {
  velocityListeners.add(fn);
  return () => velocityListeners.delete(fn);
}

export function scrollToTarget(target: string | HTMLElement) {
  if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

export function stopScroll(stop: boolean) {
  if (!lenis) return;
  if (stop) lenis.stop();
  else lenis.start();
}

export { gsap, ScrollTrigger };
