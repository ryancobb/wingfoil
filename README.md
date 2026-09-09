# Drift

A mobile-browser 3D wingfoiling game. Built with Three.js, vanilla JavaScript, and Vite.

[Play Drift](https://ryancobb.github.io/wingfoil/)

```sh
npm install
npm run dev
```

Open http://localhost:5178. On a phone connected to the same Wi-Fi, open the network URL printed by Vite. Landscape gives the widest view; portrait is also supported. Requires WebGL 2. The game is local until deployed; no account or backend is needed.

## Riding

- **Steer / shift weight:** left touch pad, WASD, or arrow keys. Down / S shifts weight back to raise the nose; up / W lowers it.
- **Wing trim:** right slider, Q to ease out, E to sheet in. The green marker suggests an efficient angle of attack relative to the apparent wind.
- **Pump:** touch Pump or press Space. Pumping has a cooldown and a replenishing energy budget.
- **Flag the wing:** on touch devices, tap Flag wing to depower and tap Power up wing to resume. Desktop defaults to holding the button or Shift. Settings lets you choose tap or hold.
- **Pause:** top-right pause button or Escape. Losing focus automatically pauses and releases controls.
- **Settings:** change wind, gusts, chop, wing area, foil area, or balance assistance. Swap the thumb controls or choose tap-to-flag; touch preferences persist locally. On mobile, this menu also contains help, camera, wind trails, restart, and the current objective.

The mobile HUD keeps speed, wind, and a foil-height gauge visible. Controls use large touch areas and respect screen safe areas. Extra statistics appear when paused, and short portrait screens hide coaching text to leave more space for riding.

Build speed, take off, and hold a ten-second flight to unlock an ongoing buoy course. A gate counts when you cross its plane between the two buoys. Session statistics track speed, distance, and flight time. Restart clears the current session; statistics are not persisted.

## Physics and its limits

The deterministic model runs at a fixed 120 Hz, separately from rendering, using SI units and a 90 kg rider/equipment mass. Apparent wind is true wind minus board velocity. Aerodynamic wing lift acts perpendicular to apparent wind, with drag along the flow. Sheeting sets wing orientation; its angle relative to the incoming wind controls lift, luffing, and stall. Hydrofoil lift depends on water speed squared, angle of attack, foil area, bank angle, and immersion. Profile and induced drag, lateral water resistance, board drag, buoyancy, and gravity are integrated into translation. Sustained near-surface ventilation or a hard touchdown triggers a short recovery.

Assisted mode uses a bounded pitch controller to target roughly 46 cm of board clearance. It still requires wing trim and steering. Manual mode removes that controller; the rider must shift weight to manage foil height. Pumping is a limited approximation of rider work. Roll/yaw and body motion use simplified control dynamics rather than a full articulated rigid-body solver. Water uses two small sinusoidal waves; there is no breaking surf, current, shoreline collision, or CFD. Gusts are deterministic. Coefficients are tuned for play and are not calibrated against a particular manufacturer's equipment; this is not a validated training simulator.

The force model follows the standard [lift/drag relationships explained by NASA](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag/) and [induced-drag formulation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/). Rendering uses [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), with capped pixel density and lightweight procedural geometry for phones. Google Fonts is optional; local sans-serif fallback fonts are provided.

## Verification

```sh
npm test                 # force model and numerical stability
npm run test:browser     # installed Google Chrome; desktop + touch emulation
npm run build           # static production files in dist/
npm run preview         # serve the production build
```

Browser coverage includes keyboard control, pause, reset, settings, touch steering and trim at the same time, pointer cancellation, portrait and landscape bounds at five phone sizes, touch target size/overlap, saved control preferences, and first-flight/course progression. Real-device Safari performance still needs a physical device check. `?debug` exposes simulation state for automated checks; normal sessions do not expose it.

## Deployment

GitHub Pages hosts the game at https://ryancobb.github.io/wingfoil/. Pushing to `main` runs the physics tests, builds the game, and deploys `dist/` through `.github/workflows/deploy.yml`. The repository's Pages source must be set to **GitHub Actions**.

The workflow builds with `npm run build -- --base /wingfoil/` so asset URLs resolve under the repository path. To preview that build locally, run the same build command followed by `npm run preview -- --base /wingfoil/`, then open http://localhost:4173/wingfoil/.

For other static hosts, `npm run build` produces `dist/` with the default root asset path.
