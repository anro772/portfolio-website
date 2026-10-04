# Andrei Stefan, portfolio

Personal portfolio site. React 19 + TypeScript + Vite, Tailwind v4, GSAP + Lenis for motion, Three.js for the ASCII hero object and the contact fluid gradient.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

Content (experience, projects, skills, links) lives in `src/data/cv.ts`.
The CV download is `public/Andrei-Stefan-CV.pdf` and the portrait is `public/me.jpeg`; replace those files to update them.

## Deploy (Cloudflare Pages)

One-time setup:

1. Push this repo to GitHub.
2. Cloudflare dashboard, Workers & Pages, Create, Pages, Connect to Git, pick the repo.
3. Build settings:
   - Framework preset: `Vite` (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version comes from `.node-version`
4. Save and deploy. Optionally add a custom domain under the project's Custom domains tab.

After that, every push to `main` deploys to production, and every other branch or pull request gets its own preview URL.

Caching and security headers are in `public/_headers`.
