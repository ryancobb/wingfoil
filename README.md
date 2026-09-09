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

## Graphics

The ocean uses a dense local wave mesh and a lightweight distant ring. Its surface height follows the same two-wave function as the physics. Reflections, antialiased foam contours, partial underwater visibility, a spreading hull wake, and pooled spray add movement without external texture downloads. The stylized sky and islands are procedural too.

White, curling gust ribbons are inspired by the readable wind effects in *The Wind Waker*. They spawn in the surrounding view, then advect through world space with the actual true-wind vector; their strength and speed respond to wind conditions. They fade near the rider to keep the controls and wing readable. Toggle **Wind trails** in settings. Two small wing telltales follow apparent wind.

The rider has articulated arms and legs; hand positions come from the wing's actual handle transforms. The wing has a tapered leading edge, cambered canopy, seams, transparent windows, strut handles, and load-dependent billow/flutter. Powered yaw uses the physics model's sheeting angle, mirrored across tacks. A damped overhead transition changes sides; flagging releases the back hand and aligns the wing's chord with apparent wind. These poses remain approximations of rider technique, informed by [F-ONE's wing handling guide](https://www.f-one.world/app/uploads/2019/07/2020-SWING-user-guide-LR-1.pdf) and [Duotone's handle/strut design description](https://secure-uk.duotonesports.com/products/duotone-foil-wing-unit-2024).

## Verification

```sh
npm test                 # force model, numerical stability, wing pose and limb geometry
npm run test:browser     # installed Google Chrome; desktop + touch emulation
npm run build           # static production files in dist/
npm run preview         # serve the production build
```

Browser coverage includes keyboard control, pause, reset, settings, touch steering and trim at the same time, pointer cancellation, portrait and landscape bounds at five phone sizes, touch target size/overlap, saved control preferences, and first-flight/course progression. Animation tests also check 288 combinations of wing size, trim, bank, pitch, tack, and grip changes without stretching the arms. Graphics checks compile the shaders in Chrome, exercise both tacks and flagging, check wind visibility, and bound draw calls/triangles and geometry growth. Real-device Safari performance still needs a physical device check. `?debug` exposes simulation state for automated checks; normal sessions do not expose it.

## Deployment

GitHub Pages hosts the game at https://ryancobb.github.io/wingfoil/. Pushing to `main` runs the physics, animation, and browser tests, builds the game, and deploys `dist/` through `.github/workflows/deploy.yml`. The repository's Pages source must be set to **GitHub Actions**.

Repository: https://github.com/ryancobb/wingfoil. Commit the intended changes on `main`, then deploy and check progress:

```sh
git push origin main
gh run list --repo ryancobb/wingfoil --workflow deploy.yml --limit 1
gh run watch <run-id> --repo ryancobb/wingfoil --exit-status
```

To redeploy the current `main` without another commit:

```sh
gh workflow run deploy.yml --repo ryancobb/wingfoil --ref main
```

The workflow uses Node 22, installs dependencies with `npm ci`, and runs the browser tests with Playwright Chromium before deployment. Local browser tests use installed Google Chrome. Build output is uploaded as an artifact; do not commit `dist/`. After deployment succeeds, open the live URL and verify the game starts. Desktop and mobile emulation were checked on the initial deployment; physical-device Safari still needs a device check.

The workflow builds with `npm run build -- --base /wingfoil/` so asset URLs resolve under the repository path. To preview that build locally, run the same build command followed by `npm run preview -- --base /wingfoil/`, then open http://localhost:4173/wingfoil/.

For other static hosts, `npm run build` produces `dist/` with the default root asset path.
