import { SLICES, THRUSTERS, type TankMode } from './config';

// A program is a grid of on/off cells: one row per thruster, one column per time slice.
export type Program = Uint8Array; // length THRUSTERS.length * SLICES, row-major

export const ROWS = THRUSTERS.length;

export function emptyProgram(): Program {
  return new Uint8Array(ROWS * SLICES);
}

export function cell(p: Program, row: number, col: number): number {
  return p[row * SLICES + col];
}

export function setCell(p: Program, row: number, col: number, v: number) {
  p[row * SLICES + col] = v ? 1 : 0;
}

export function isEmpty(p: Program): boolean {
  for (let i = 0; i < p.length; i++) if (p[i]) return false;
  return true;
}

// ---- Share-link encoding: "1." + base64url(packed bits) ----

export function encodeProgram(p: Program): string {
  const bytes = new Uint8Array(Math.ceil(p.length / 8));
  for (let i = 0; i < p.length; i++) if (p[i]) bytes[i >> 3] |= 1 << (i & 7);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return '1.' + b64;
}

export function decodeProgram(s: string): Program | null {
  try {
    if (!s.startsWith('1.')) return null;
    const b64 = s.slice(2).split('~')[0].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const p = emptyProgram();
    for (let i = 0; i < p.length; i++) {
      const byte = bin.charCodeAt(i >> 3) || 0;
      p[i] = (byte >> (i & 7)) & 1;
    }
    return p;
  } catch {
    return null;
  }
}

// Share codes may carry a tank suffix: "~b" (big) or "~u" (unlimited). No suffix = standard.
export function encodeShare(p: Program, tank: TankMode): string {
  return encodeProgram(p) + (tank === 'big' ? '~b' : tank === 'unlimited' ? '~u' : '');
}

export function decodeShare(s: string): { program: Program; tank: TankMode } | null {
  const program = decodeProgram(s);
  if (!program) return null;
  const suf = s.split('~')[1];
  return { program, tank: suf === 'b' ? 'big' : suf === 'u' ? 'unlimited' : 'standard' };
}

// Build a program from a compact description: { rowId: [[fromSlice, toSliceExclusive], ...] }
export function programFromSpans(spans: Record<string, [number, number][]>): Program {
  const p = emptyProgram();
  for (const [id, list] of Object.entries(spans)) {
    const row = THRUSTERS.findIndex((t) => t.id === id);
    if (row < 0) continue;
    for (const [a, b] of list) for (let c = Math.max(0, a); c < Math.min(SLICES, b); c++) setCell(p, row, c, 1);
  }
  return p;
}
