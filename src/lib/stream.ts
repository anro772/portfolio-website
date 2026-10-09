/**
 * Meeting point for the glyph stream: the hero object and the portrait live in different sections,
 * so each registers itself here and the stream layer connects them once both exist.
 */

export type StreamHero = {
  setDissolve(t: number): void;
  getObjectRegion(): { x: number; y: number; radius: number };
};

export type StreamPortrait = {
  readonly isReady: boolean;
  setStreamMode(on: boolean): void;
  setVisibility(t: number): void;
  getCells(): {
    cells: { ch: string; x: number; y: number; r: number; g: number; b: number }[];
    cellW: number;
    cellH: number;
  };
  onLayout?: () => void;
};

type Parts = { hero?: StreamHero; portrait?: StreamPortrait };

const parts: Parts = {};
const listeners = new Set<() => void>();

export function registerStreamPart<K extends keyof Parts>(key: K, value: Parts[K] | null) {
  if (value) parts[key] = value;
  else delete parts[key];
  listeners.forEach((f) => f());
}

export function streamParts(): Readonly<Parts> {
  return parts;
}

export function onStreamParts(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}
