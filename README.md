# Thruster Flip Sim

**This entire repo is vibecoded.**

A browser toy inspired by the cold-gas thruster car demos: a supercar with ten thrusters jumps a parked lineup, and the only thing you control is **when each thruster fires**. Paint the firing schedule on a grid, press Play, and see if you can land a kickflip.

Fan-made and unofficial. The car is an original design; no brands, logos or real vehicle models are used.

## Play

Play it at https://ammarquresh1.github.io/thruster-flip-sim/ Every flip you make has a share link, so anyone who opens it sees exactly the same run.

## How it works

- **Physics:** [Rapier](https://rapier.rs) (deterministic build) stepped at a fixed 120 Hz. Same program, same result on every machine.
- **Thrusters:** 4 rear boost (the outer two toed in so they can spin the car in the air), 4 corner lift, 2 roof-mounted roll jets. Each one is on/off for 0.1 s slices over a 4 s timeline.
- **Gas:** a 110 kg air tank (bigger and unlimited tanks are options) at 10,000 psi. Each newton of thrust burns gas at a rate set by a specific impulse of 65 s, and the tank's mass and centre of mass update as it empties.
- **Rendering:** three.js with bloom and a particle system for the plumes. Thruster audio is synthesised, so there are no sound files.

## Develop

```bash
npm install
npm run dev          # local dev server
npm test             # headless physics checks: presets land, runs are deterministic
npm run search -- kickflip 3000 7   # search for a program that lands a target trick
npm run shots        # headless screenshots of a run (needs `npx playwright install chromium`)
npm run build        # production build into dist/
```

## Licence

MIT
