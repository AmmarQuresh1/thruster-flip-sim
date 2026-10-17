// Find a thruster program for a target trick by stochastic hill-climbing.
// Usage: npx tsx scripts/search.ts kickflip [iterations] [seed]
// Prints the best program's share code. Deterministic for a given seed.
import R from '@dimforge/rapier3d-deterministic-compat';
import { SLICES, THRUSTERS } from '../src/sim/config';
import { runProgram, type Outcome } from '../src/sim/sim';
import type { TankMode } from '../src/sim/config';
const TANK_MODE = (process.env.TANK ?? 'standard') as TankMode;
const RAMP = process.env.RAMP === '1';
import { decodeProgram, emptyProgram, encodeProgram, setCell } from '../src/sim/program';

await R.init();

type Span = [number, number]; // start slice, length (0 = unused)
type Genome = Span[][]; // per thruster, three spans

const target = process.argv[2] ?? 'kickflip';
const iters = Number(process.argv[3] ?? 1500);
let seed = Number(process.argv[4] ?? 1);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ri = (n: number) => Math.floor(rand() * n);

const TARGETS: Record<string, { roll: number; pitch: number; yaw: number; soft?: boolean }> = {
  kickflip: { roll: 1, pitch: 0, yaw: 0 },
  event: { roll: 1, pitch: 0, yaw: 0, soft: true },
  double: { roll: 2, pitch: 0, yaw: 0 },
  triple: { roll: 3, pitch: 0, yaw: 0 },
  '360': { roll: 1, pitch: 0, yaw: 1 },
  '180': { roll: 1, pitch: 0, yaw: 0.5 },
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
  s -= 40 * Math.abs(Math.abs(o.yawTurns) - T.yaw);
  s -= 0.25 * o.gasUsed;
  // reward clean, level touchdowns
  if (o.status === 'landed') s -= 0.6 * o.landingTilt + 25 * o.bounces;
  // tricks that should stay level must not spin and spin back
  if (T.roll === 0 && T.pitch === 0) s -= 80 * Math.max(0, o.peakTurns - 0.12);
  s -= (T.soft ? 6 : 1.2) * o.touchdownSpeed;
  // the event car lifted straight up first and only then flipped
  if (target === 'event') s -= 150 * Math.max(0, o.rotationAtLift - 0.04);
  s -= 4 * Math.max(0, o.maxHeight - 9); // keep the arc close to the event: just over the semi, not into orbit
  return s;
}

function blank(): Genome {
  return THRUSTERS.map(() => [[0, 0], [0, 0], [0, 0]] as Span[]);
}

function seedGenome(): Genome {
  // No ramp: all four lift thrusters throw the car up before the lineup (~0.7 s in), then the
  // trick-specific pairs spin it, then all four cushion the landing.
  const g = blank();
  const set = (id: string, k: number, s: number, l: number) => (g[idx(id)][k] = [s, l]);
  for (const id of ['FL', 'FR', 'RL', 'RR']) set(id, 0, 7, 3);
  if (target === 'event') {
    // straight up on all four, then one side kicks the roll, the other side stops it, then cushion
    for (const id of ['FL', 'FR', 'RL', 'RR']) set(id, 0, 6, 4);
    set('FL', 1, 12, 2); set('RL', 1, 12, 2);
    set('FR', 1, 19, 2); set('RR', 1, 19, 2);
    for (const id of ['FL', 'FR', 'RL', 'RR']) set(id, 2, 26, 3);
  } else if (target === 'kickflip' || target === 'event' || target === 'double') {
    const n = target === 'double' ? 3 : 2;
    set('FL', 1, 11, n); set('RL', 1, 11, n);
    set('FR', 1, 19, n); set('RR', 1, 19, n);
    for (const id of ['FL', 'FR', 'RL', 'RR']) set(id, 2, 26, 3);
  } else if (target === 'backflip') {
    set('FL', 1, 11, 2); set('FR', 1, 11, 2);
    set('RL', 1, 19, 2); set('RR', 1, 19, 2);
    for (const id of ['FL', 'FR', 'RL', 'RR']) set(id, 2, 26, 3);
  } else {
    for (const id of ['FL', 'FR', 'RL', 'RR']) { set(id, 0, 7, 4); set(id, 1, 20, 6); }
  }
  return g;
}

function mutate(g: Genome): Genome {
  const c = g.map((sp) => sp.map((s) => [s[0], s[1]] as Span));
  const n = 1 + ri(3);
  for (let k = 0; k < n; k++) {
    const row = ri(THRUSTERS.length);
    const j = ri(3);
    const sp = c[row][j];
    const m = ri(4);
    if (m === 0) sp[0] = Math.max(0, Math.min(SLICES - 1, sp[0] + ri(5) - 2));
    else if (m === 1) sp[1] = Math.max(0, Math.min(8, sp[1] + ri(3) - 1));
    else if (m === 2) { sp[0] = 4 + ri(36); sp[1] = 1 + ri(3); }
    else sp[1] = 0;
  }
  return c;
}

// Optional: start from an existing share code (FROM=1.xxxx) instead of the hand-written seed.
function fromCode(code: string): Genome {
  const p = decodeProgram(code)!;
  const g = blank();
  THRUSTERS.forEach((_, row) => {
    const spans: Span[] = [];
    let c = 0;
    while (c < SLICES) {
      if (p[row * SLICES + c]) {
        const s0 = c;
        while (c < SLICES && p[row * SLICES + c]) c++;
        spans.push([s0, c - s0]);
      } else c++;
    }
    spans.slice(0, 3).forEach((sp, k) => (g[row][k] = sp));
  });
  return g;
}
let best = process.env.FROM ? fromCode(process.env.FROM) : seedGenome();
let bestO = runProgram(R, toProgram(best), undefined, TANK_MODE, RAMP);
let bestS = score(bestO);
let cur = best, curS = bestS;
for (let i = 0; i < iters; i++) {
  const cand = mutate(cur);
  const o = runProgram(R, toProgram(cand), undefined, TANK_MODE, RAMP);
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
