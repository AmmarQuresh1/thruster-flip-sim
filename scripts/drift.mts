import R from '@dimforge/rapier3d-deterministic-compat';
import { runProgram } from '../src/sim/sim';
import { PRESETS } from '../src/sim/presets';
await R.init();
for (const p of PRESETS.filter((x) => x.expect)) {
  const o = runProgram(R, p.program());
  console.log(p.id.padEnd(9), o.status.padEnd(8), o.trick.padEnd(18), 'roll', o.rollTurns.toFixed(2), 'pitch', o.pitchTurns.toFixed(2), 'yaw', o.yawTurns.toFixed(2), 'lean', o.landingTilt.toFixed(0));
}
