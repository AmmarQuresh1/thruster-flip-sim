// The director track: which camera is live and whether slow-mo is on, for each 0.1 s column of the
// thruster grid. The last column holds for the rest of the run (landing and roll-out).
import { SLICES } from './sim/config';

export const DIR_CAMS = ['runway', 'event', 'side', 'tele', 'landing', 'chase'] as const;
export type DirCam = (typeof DIR_CAMS)[number];

export const DIR_CAM_INFO: Record<DirCam, { name: string; letter: string }> = {
  runway: { name: 'Runway', letter: 'R' },
  event: { name: 'Event', letter: 'E' },
  side: { name: 'Side', letter: 'S' },
  tele: { name: 'Telephoto', letter: 'T' },
  landing: { name: 'Landing', letter: 'L' },
  chase: { name: 'Chase', letter: 'C' },
};

export interface Director {
  cam: Uint8Array; // index into DIR_CAMS, one per column
  slow: Uint8Array; // 1 = slow-mo, one per column
}

/** Runway cam for the run-up, event cam once it lifts, landing cam for the touchdown; slow-mo over the flip. */
export function defaultDirector(): Director {
  const cam = new Uint8Array(SLICES);
  const slow = new Uint8Array(SLICES);
  const idx = (c: DirCam) => DIR_CAMS.indexOf(c);
  for (let c = 0; c < SLICES; c++) cam[c] = c < 7 ? idx('runway') : c < 24 ? idx('event') : idx('landing');
  for (let c = 13; c < 22; c++) slow[c] = 1;
  return { cam, slow };
}

export function sameDirector(a: Director, b: Director): boolean {
  for (let c = 0; c < SLICES; c++) if (a.cam[c] !== b.cam[c] || a.slow[c] !== b.slow[c]) return false;
  return true;
}

// ---- share-link encoding: "d1" + base64url of 3 bits per camera cell then 1 bit per slow-mo cell ----

export function encodeDirector(d: Director): string {
  const bits: number[] = [];
  for (let c = 0; c < SLICES; c++) for (let b = 0; b < 3; b++) bits.push((d.cam[c] >> b) & 1);
  for (let c = 0; c < SLICES; c++) bits.push(d.slow[c] & 1);
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((v, i) => v && (bytes[i >> 3] |= 1 << (i & 7)));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'd1' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDirector(s: string): Director | null {
  try {
    if (!s.startsWith('d1')) return null;
    const b64 = s.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bit = (i: number) => ((bin.charCodeAt(i >> 3) || 0) >> (i & 7)) & 1;
    const d: Director = { cam: new Uint8Array(SLICES), slow: new Uint8Array(SLICES) };
    for (let c = 0; c < SLICES; c++) {
      const v = bit(c * 3) | (bit(c * 3 + 1) << 1) | (bit(c * 3 + 2) << 2);
      if (v >= DIR_CAMS.length) return null;
      d.cam[c] = v;
    }
    for (let c = 0; c < SLICES; c++) d.slow[c] = bit(SLICES * 3 + c);
    return d;
  } catch {
    return null;
  }
}
