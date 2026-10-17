# Progress

Handoff notes so any session can pick this up without the original chat.

## Done
- Vite + TypeScript + three.js app, Rapier physics (deterministic build) at a fixed 120 Hz.
- Sim core in `src/sim/` (no DOM): 10 thrusters (4 rear boost, 4 corner lift, 2 side), 70 kg air tank at 10,000 psi with mass and centre of mass updated as gas vents, ramp, parked lineup, outcome scoring (trick name, gas used, touchdown speed, air time).
- Thruster grid: 10 rows × 40 slices of 0.1 s. Programs encode to a share link (`#1.<base64url>`).
- Presets found by `scripts/search.ts` and checked by `npm test`: event-style kickflip (soft landing), double kickflip, backflip, soft landing.
- Night scene in `src/render/`: original unbranded wedge car, stage with red LED strip, unbranded lineup, floodlights, power line, cold-gas particle plumes, bloom, synthesised thruster audio.
- Cameras: event (fixed wide shot that pans), chase, free orbit. Slow-mo. Clip recording via MediaRecorder.

- Event-shot framing tuned (camera shifted above the programme panel, pans with the car, tighter tracking on phones).
- GitHub Pages deploy workflow (`.github/workflows/pages.yml`): set Settings → Pages → Source to "GitHub Actions".
- `npm run build:single` makes a one-file build used for the in-chat preview.

- Tank modes: standard (70 kg), big (260 kg, the figure reported after the event), unlimited. Tank is part of the share code (`~b`, `~u`).
- Grid editing on desktop: drag a box to fill, start on a lit cell or right-drag to erase, shift-drag freehand. Touch: tap toggles.
- Quality: pixel count capped, bloom at half res, auto drop to low (no MSAA, smaller shadows, fewer particles) when frames are slow; Quality button to force high/low.
- Lineup rebuilt from rounded boxes: cab-over semi, pickup, saloons, SUV (all generic).

- Staging from the event video notes: floodlight tower with haze behind the semi, truss rigs with round lamps either side, curved truss arch, approach lane with centreline, red-strip barriers and floodlights that switch on as the car passes.
- Cameras: event, side track, runway, telephoto, landing, chase, free.
- Plumes: ground blast when a jet points at the asphalt, a cool light under the car while lifting, reset clears all gas, dead particles are not drawn, on-screen puff size capped.
- Audio: 2.8 kHz hiss, roar whose filter opens with thrust, 80 Hz weight, short burst when a thruster opens.
- `npm run` scripts: `scripts/export-glb.ts` writes the models to ./models as .glb; `scripts/stress.ts` checks run/reset doesn't slow down.

- No ramp (matches the event): the car drives in on flat ground and the four lift thrusters (14 kN each) throw it over the lineup. Standard tank is 110 kg of air. Outcomes now also fail "came down short" and "went round the lineup".
- Presets re-found for the flat course; `FROM=<code>` and `TANK=<mode>` env vars on `scripts/search.ts` start a search from an existing program or another tank.

- Lane lock: the car can't move sideways (z translation disabled), so the side jets are roof-mounted roll jets (8 kN). Presets: event kickflip, double, triple, soft landing (backflip dropped; the search couldn't land one with the lane locked). Loading a preset resets the tank to standard.
- `scripts/browser-check.ts` runs every preset in headless Chromium to confirm the browser matches the Node test.

- Heading lock: the car may only spin about its own long axis (kickflips) and the lane's side axis (flips); other spin is projected out each step and any heading creep rotated back (`Sim.lockHeading`). Removes the yaw drift from one-sided tyre grip at take-off. Rapier's own rotation lock is body-relative, so it isn't used.
- Softer, longer suspension (0.4 m travel). Results report lean after touchdown and bounces; the card says Clean / Stuck / Scrappy landing.
- Optional ramp (checkbox, off by default; `~r` in share codes). Ramp kickflip preset turns it on.
- Presets: event kickflip (clean landing), double, triple, backflip, soft landing, ramp kickflip; all land within 10° of level.

- Kickflip preset now lifts straight up first and flips at the top of the arc (test fails if it's more than ~20° into the roll by 2 m up); renamed from "Kickflip (event style)".
- Smoke uses normal blending under the bloom threshold, so overlapping puffs no longer blow out.
- Box-select preview colours beat the lit-cell colours (right-drag erase shows red on every row).
- Air-spin rule (replaces the Free spin checkbox): heading locked while touching the ground, free in the air, where yaw comes only from the rear jets (`Sim.airSpin` splits spin into roll / flip / swing about car-tied axes and sets the swing from a tracked rear-jet yaw rate, so roll and flip coupling can't twist the nose). On touchdown: within 20° of straight or backwards it eases back into the lane; otherwise "Landed sideways and spun out". Outer rear nozzles (Rear L spin / Rear R spin) are toed in 25° so one alone spins the car (~0.3 s ≈ 120°).
- Presets: kickflip (lift first, clean landing), 180 kickflip to fakie, 360 kickflip, double, triple, backflip, soft landing, ramp kickflip.

- Director track (`src/director.ts`): Camera and Slow-mo rows under the thruster grid, aligned to its 0.1 s columns; last column holds for the rest of the run. Default runway → event → landing with slow-mo over the flip. Click or drag on the camera row paints exactly those cells; shift-click (or a tap on touch) cuts from there to the end of that shot. Pressing the camera or slow-mo buttons by hand turns the director off. Saved in share links after `!` (`d1…`); omitted when it's the default. Folds behind "Edit track" on phones.

- Truck rebuilt as one smooth lofted shell (`src/render/truck.ts`): rounded nose, wraparound windscreen into a high roof, rounded sleeper, exposed chassis with drive axles; gloss white.

- Landing cam dollies: holds its low, close spot until the car is ~10 m away, then backs off ahead of it (further when the car is high), so long jumps stay in frame. Aims above the car by the panel offset so it centres in the visible window; tracks tighter sideways in portrait. Checked against the visible window: worst 83% of the way to the edge (desktop, 36 m test jump), 56% on phones. The follow light stays 13 m above the car.

- 360 kickflip preset retuned: 361° of spin, lands 2° off straight, 3° lean.
- iPhone silent switch no longer mutes the sound (`navigator.audioSession.type = 'playback'`, silent looping <audio> fallback on older iOS).

- Panel minimises to one row (Play/Reset + Show grid) while a run plays on phones or portrait screens; Hide/Show grid toggle everywhere; reset restores it unless you toggled it yourself.
- Repo stays private (Pages still serves the site with the Student Pack).

## Next
- Check on a real phone and a real GPU (headless shots use software WebGL).
- Optional: swap in a nicer car model (`src/render/car.ts` builds the current one procedurally).
- Done: Ammar's stylised pickup and coupe models are in `src/render/lineup-custom.ts` (coupe takes the camera-right slot); semi light bar at bumper height, three markers on the fairing.
- Clip download only works on the real site, not inside the claude.ai preview.

## Rules
- Anything that changes `src/sim/config.ts` invalidates preset codes: re-run `npm run search -- <target> 4000 <seed>` and update `src/sim/presets.ts`, then `npm test`.
- Keep physics code free of `Math.sin/cos/...` so share links replay identically across browsers.
