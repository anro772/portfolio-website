# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primarily a personal showcase: visitors who come to see what Andrei Stefan builds and how he works, browsing at their own pace, often from a shared link. Recruiters and engineering leads hiring for .NET / full-stack roles are a secondary audience; they skim for proof of reliability, then download the CV or get in touch.

## Product Purpose
A single-page portfolio for Andrei Stefan, a .NET application developer in Bucharest. It presents his work as a craft showcase first: the IBM myUCB role, two theses, and personal tools and mods. Success means a visitor remembers the site, understands what he does, and can reach him or his CV in one step.

## Positioning
He is the only .NET developer on myUCB, a GxP-regulated patient management system for the pharmaceutical client UCB at IBM, with 5 major production releases, 100+ merged changes, 30+ Snyk fixes, 30+ resolved incidents and zero rollbacks. The pairing of regulated, zero-rollback production work with after-hours tinkering (desktop tools, automation, game mods) is what the site should carry.

## Operating Context
Deployed as a static Vite build on Cloudflare (Workers static assets) at anro.site; every push to `main` redeploys. Visitors arrive on desktop and mobile; the site must work without WebGPU or WebGL and with reduced motion.

## Capabilities and Constraints
- Content lives in `src/data/cv.ts`; the CV PDF is `public/Andrei-Stefan-CV.pdf`, the portrait `public/me.jpeg`.
- Heavy visuals load lazily and must fall back gracefully (WebGPU, WebGL, reduced motion, touch).
- Long scroll-jacked sections are unwelcome: a pinned sequence must stay short and clearly lead on to the next section.

## Brand Commitments
Name: Andrei Stefan. Contact label "Get in touch" used everywhere. Plain, factual voice; no em-dashes in visible copy.

## Evidence on Hand
Only CV facts: roles and dates, the numbers above, projects (Privacy Browser, REVERB, Replayd, VOD Segmentor, Pathdle, game modding, Luminosity), education (ASE master's 2026, bachelor's 2023), CAE C1, IBM badges. No testimonials, client logos, case-study metrics or press exist; do not invent them.

## Product Principles
1. Craft is the proof: interactions should feel built, not templated.
2. Every number shown is real and sourced from the CV.
3. Enhancement never gates content: the plain page is complete on its own.
4. Keep the visitor moving: spectacle supports the story and then gets out of the way.
