# 251231_FireworkClicks

FireworkClicks is a minimal Three.js playground: a full-screen black canvas where every click or drag spawns randomized fireworks—no menus, just bursts, trails, spirals, and crackles.

## Features
- Full-viewport Three.js renderer with additive particles, bloom, radial sprites, halos, and a tiny center flash.
- Click-and-drag spawning up to ~60 bursts/sec with larger radius ranges (to 20) and particle counts (to 300).
- Per-burst styles: classic bursts/rings/sprays, burst-wide fizzle crackles on fall, shared-axis spirals, per-particle chaotic spirals, and burst-wide persistent trails (with smoother fades) or shorter trails otherwise.
- Long and short trails that taper smoothly; warm color fade with spark outliers; CTA overlay that clears on first click.
- Vite + TypeScript tooling for fast dev/preview builds.

## Getting Started
- Install: `npm install`
- Dev server: `npm run dev` (Vite) then open the shown localhost URL.
- Build: `npm run build`; preview the bundle with `npm run preview`.

## Controls
- Left click: spawn a firework at the pointer.
- Click and drag: spawn chained bursts along the drag path.
- First click clears the pulsing “CLICK TO BOOM” overlay.
- Right click: disabled to keep focus on spawning.

## Deployment
- Local production preview: `npm install`, then `npm run build` and `npm run preview` to inspect the compiled bundle.
- Publish to GitHub Pages: from a clean `main`, run `npm run build -- --base=./`, check out `gh-pages`, replace its root with `dist/` contents (including `assets` and `index.html`), commit, and `git push origin gh-pages`. Switch back to `main` when done.
- Live demo: https://ekimroyrp.github.io/251231_FireworkClicks/
