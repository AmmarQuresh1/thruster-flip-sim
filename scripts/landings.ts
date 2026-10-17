// How clean are the preset landings? Prints touchdown speed, worst lean after touchdown and bounces.
import R from '@dimforge/rapier3d-deterministic-compat';
import { runProgram } from '../src/sim/sim';
import { PRESETS } from '../src/sim/presets';
await R.init();
for (const p of PRESETS.filter((x) => x.expect)) {
  const o = runProgram(R, p.program(), undefined, 'standard', !!p.ramp);
  console.log(p.id.padEnd(9), o.status.padEnd(8), o.trick.padEnd(16), `td=${o.touchdownSpeed.toFixed(1)}m/s lean=${o.landingTilt.toFixed(0)}° bounces=${o.bounces}`);
}
