// Headless physics test: every preset must land its trick, runs must be
// deterministic, and share codes must round-trip. No rendering involved.
import R from '@dimforge/rapier3d-deterministic-compat';
import { runProgram, type Frame } from '../src/sim/sim';
import { decodeProgram, encodeProgram } from '../src/sim/program';
import { PRESETS } from '../src/sim/presets';
import { decodeDirector, defaultDirector, encodeDirector, sameDirector } from '../src/director';

await R.init();
let failed = 0;
const fmt = (n: number) => n.toFixed(2);

for (const p of PRESETS) {
  const prog = p.program();
  const o = runProgram(R, prog, undefined, 'standard', !!p.ramp);
  const line = `${p.id.padEnd(9)} ${o.status.padEnd(8)} ${o.trick.padEnd(16)} gas=${fmt(o.gasUsed)}kg td=${fmt(o.touchdownSpeed)}m/s air=${fmt(o.airTime)}s`;
  if (p.id === 'kickflip' && o.rotationAtLift > 0.06) {
    failed++;
    console.log(`FAIL kickflip: already ${(o.rotationAtLift * 360).toFixed(0)} degrees into the roll before lifting off; it should lift first, then flip`);
  }
  if (p.id === 'soft' && o.peakTurns > 0.2) {
    failed++;
    console.log(`FAIL soft: rotates ${(o.peakTurns * 360).toFixed(0)} degrees on the way, it should stay level`);
  }
  if (p.expect && (o.status !== p.expect.status || o.trick !== p.expect.trick)) {
    failed++;
    console.log('FAIL ' + line + `  (expected ${p.expect.status} ${p.expect.trick})`);
  } else console.log('ok   ' + line);

  // share-code round trip
  const back = decodeProgram(encodeProgram(prog))!;
  if (back.some((v, i) => v !== prog[i])) {
    failed++;
    console.log(`FAIL ${p.id}: share code does not round-trip`);
  }
}

// determinism: same program twice gives bit-identical trajectories
const prog = PRESETS.find((p) => p.id === 'kickflip')!.program();
const a: Frame[] = [];
const b: Frame[] = [];
runProgram(R, prog, (f) => a.push(f));
runProgram(R, prog, (f) => b.push(f));
const same = a.length === b.length && a.every((f, i) => f.pos.x === b[i].pos.x && f.pos.y === b[i].pos.y && f.rot.w === b[i].rot.w);
if (!same) {
  failed++;
  console.log('FAIL determinism: two runs of the same program diverged');
} else console.log(`ok   determinism (${a.length} steps identical)`);

// director track round-trips through its share code
{
  const d = defaultDirector();
  d.cam[5] = 3; d.cam[30] = 5; d.slow[0] = 1; d.slow[39] = 1;
  const back = decodeDirector(encodeDirector(d));
  if (!back || !sameDirector(d, back)) {
    failed++;
    console.log('FAIL director: share code does not round-trip');
  } else console.log('ok   director share code round-trips');
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
