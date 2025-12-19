# 251231_FireworkClicks

FireworkClicks is a minimal Three.js playground: a full-screen black canvas where every click (or drag) spawns a randomized firework burst at the pointer’s location—no menus, just explosions.

## Features
- Full-viewport Three.js renderer with additive, glowing particle fireworks (bloom + radial sprite).
- Click-and-drag spawning that trails bursts along the drag path (up to ~60 bursts/sec).
- Randomized explosion size, color, and style (burst, ring, spray) with warm fade and sparkier outliers.
- Vite + TypeScript tooling for fast dev/preview builds.

## Getting Started
- Install: `npm install`
- Dev server: `npm run dev` (Vite) then open the shown localhost URL.
- Build: `npm run build`; preview the bundle with `npm run preview`.

## Controls
- Left click anywhere: spawns a firework at that position.
- Click and drag: spawns a chain of bursts along the drag.
- Right click: disabled to keep focus on spawning.
