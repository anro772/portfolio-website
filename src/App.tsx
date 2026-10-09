import { useCallback, useEffect, useState } from "react";
import { initSmoothScroll, ScrollTrigger } from "./lib/motion";
import { Preloader } from "./components/Preloader";
import { Nav } from "./components/Nav";
import { Cursor } from "./components/Cursor";
import { Grain } from "./components/Grain";
import { GlyphStreamLayer } from "./components/GlyphStreamLayer";
import { Hero } from "./sections/Hero";
import { About } from "./sections/About";
import { ZeroRollbacks } from "./sections/ZeroRollbacks";
import { Experience } from "./sections/Experience";
import { Work } from "./sections/Work";
import { Stack } from "./sections/Stack";
import { Education } from "./sections/Education";
import { Contact } from "./sections/Contact";

export function App() {
  const [ready, setReady] = useState(false);
  const onDone = useCallback(() => setReady(true), []);

  useEffect(() => initSmoothScroll(), []);

  // late-loading fonts and canvases change heights; re-measure triggers once things settle
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => window.clearTimeout(id);
  }, [ready]);

  return (
    <>
      <Preloader onDone={onDone} />
      <Cursor />
      <Grain />
      <GlyphStreamLayer />
      <Nav />
      <main>
        <Hero ready={ready} />
        <About />
        <ZeroRollbacks />
        <Experience />
        <Work />
        <Stack />
        <Education />
        <Contact />
      </main>
    </>
  );
}
