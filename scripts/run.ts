// Run a program headlessly and print the outcome.
// Usage: npx tsx scripts/run.ts [preset-name | 1.<code>] [--trace]
import R from '@dimforge/rapier3d-deterministic-compat';
import { runProgram } from '../src/sim/sim';
import { decodeProgram, emptyProgram } from '../src/sim/program';
import { PRESETS } from '../src/sim/presets';

await R.init();
const arg = process.argv[2] ?? 'none';
const trace = process.argv.includes('--trace');
const prog =
  arg === 'none' ? emptyProgram() : arg.startsWith('1.') ? decodeProgram(arg)! : PRESETS.find((p) => p.id === arg)!.program();

let n = 0;
const o = runProgram(R, prog, (f) => {
  if (trace && n++ % 12 === 0)
    console.log(
      `t=${f.t.toFixed(2)} x=${f.pos.x.toFixed(1)} y=${f.pos.y.toFixed(2)} vx=${f.vel.x.toFixed(1)} vy=${f.vel.y.toFixed(1)} gas=${f.gas.toFixed(1)} air=${f.airborne}`,
    );
});
console.log(JSON.stringify(o, (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2));
