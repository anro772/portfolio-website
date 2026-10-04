const POOL = "!<>-_\/[]{}=+*^?#01ABCDEFXZ";

/** Decodes text into place character by character. Returns a cancel function. */
export function scramble(el: HTMLElement, finalText: string, duration = 700) {
  const start = performance.now();
  const len = finalText.length;
  let raf = 0;
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const settled = Math.floor(p * len);
    let out = finalText.slice(0, settled);
    for (let i = settled; i < len; i++) {
      const c = finalText[i];
      out += c === " " ? " " : POOL[(Math.random() * POOL.length) | 0];
    }
    el.textContent = out;
    if (p < 1) raf = requestAnimationFrame(frame);
    else el.textContent = finalText;
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = finalText;
  };
}
