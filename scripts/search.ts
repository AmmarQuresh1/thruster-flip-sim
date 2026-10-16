// Find a thruster program for a target trick by stochastic hill-climbing.
// Usage: npx tsx scripts/search.ts kickflip [iterations] [seed]
// Prints the best program's share code. Deterministic for a given seed.
import R from '@dimforge/rapier3d-deterministic-compat';
import { SLICES, THRUSTERS } from '../src/sim/config';
import { runProgram, type Outcome } from '../src/sim/sim';
import { emptyProgram, encodeProgram, setCell } from '../src/sim/program';

await R.init();

type Span = [number, number]; // start slice, length (0 = unused)
type Genome = Span[][]; // per thruster, two spans

const target = process.argv[2] ?? 'kickflip';
const iters = Number(process.argv[3] ?? 1500);
let seed = Number(process.argv[4] ?? 1);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ri = (n: number) => Math.floor(rand() * n);

const TARGETS: Record<string, { roll: number; pitch: number; yaw: number; soft?: boolean }> = {
  kickflip: { roll: 1, pitch: 0, yaw: 0 },
  event: { roll: 1, pitch: 0, yaw: 0, soft: true },
  double: { roll: 2, pitch: 0, yaw: 0 },
  backflip: { roll: 0, pitch: 1, yaw: 0 },
  hover: { roll: 0, pitch: 0, yaw: 0, soft: true },
};
const T = TARGETS[target];

const idx = (id: string) => THRUSTERS.findIndex((t) => t.id === id);

function toProgram(g: Genome) {
  const p = emptyProgram();
  g.forEach((spans, row) => spans.forEach(([s, l]) => { for (let c = s; c < s + l && c < SLICES; c++) setCell(p, row, c, 1); }));
  return p;
}

function score(o: Outcome): number {
  let s = 0;
  if (o.status === 'landed') s += 100;
  if (o.hitLineup) s -= 60;
  s -= 40 * Math.abs(Math.abs(o.rollTurns) - T.roll);
  s -= 40 * Math.abs(Math.abs(o.pitchTurns) - T.pitch);
  s -= 20 * Math.abs(Math.abs(o.yawTurns) - T.yaw);
  s -= 0.25 * o.gasUsed;
  s -= (T.soft ? 6 : 1.2) * o.touchdownSpeed;
  return s;
}

function blank(): Genome {
  return THRUSTERS.map(() => [[0, 0], [0, 0]] as Span[]);
}

function seedGenome(): Genome {
  const g = blank();
  const set = (id: string, k: number, s: number, l: number) => (g[idx(id)][k] = [s, l]);
  if (target === 'kickflip' || target === 'event' || target === 'double') {
    const n = target === 'double' ? 4 : 2;
    set('FL', 0, 13, n); set('RL', 0, 13, n);
    set('FR', 0, 26, n); set('RR', 0, 26, n);
    set('FL', 1, 28, 2); set('RL', 1, 28, 2);
  } else if (target === 'backflip') {
    set('FL', 0, 13, 2); set('FR', 0, 13, 2);
    set('RL', 0, 26, 2); set('RR', 0, 26, 2);
  } else {
    for (const id of ['FL', 'FR', 'RL', 'RR']) { set(id, 0, 17, 3); set(id, 1, 26, 4); }
  }
  return g;
}

function mutate(g: Genome): Genome {
  const c = g.map((sp) => sp.map((s) => [s[0], s[1]] as Span));
  const n = 1 + ri(3);
  for (let k = 0; k < n; k++) {
    const row = ri(THRUSTERS.length);
    const j = ri(2);
    const sp = c[row][j];
    const m = ri(4);
    if (m === 0) sp[0] = Math.max(0, Math.min(SLICES - 1, sp[0] + ri(5) - 2));
    else if (m === 1) sp[1] = Math.max(0, Math.min(8, sp[1] + ri(3) - 1));
    else if (m === 2) { sp[0] = 6 + ri(34); sp[1] = 1 + ri(3); }
    else sp[1] = 0;
  }
  return c;
}

let best = seedGenome();
let bestO = runProgram(R, toProgram(best));
let bestS = score(bestO);
let cur = best, curS = bestS;
for (let i = 0; i < iters; i++) {
  const cand = mutate(cur);
  const o = runProgram(R, toProgram(cand));
  const s = score(o);
  // accept improvements, occasionally sideways moves
  if (s >= curS || rand() < 0.02) { cur = cand; curS = s; }
  if (s > bestS) {
    best = cand; bestS = s; bestO = o;
    console.error(`[${i}] ${s.toFixed(1)} ${o.status} ${o.trick} roll=${o.rollTurns.toFixed(2)} pitch=${o.pitchTurns.toFixed(2)} gas=${o.gasUsed.toFixed(1)} td=${o.touchdownSpeed.toFixed(1)}`);
  }
  if (i % 300 === 299) { cur = best; curS = bestS; }
}
console.log(JSON.stringify({ target, score: bestS, code: encodeProgram(toProgram(best)), outcome: bestO }));
