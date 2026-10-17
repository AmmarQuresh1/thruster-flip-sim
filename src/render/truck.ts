// Generic aerodynamic cab-over tractor unit built as one smooth lofted shell:
// rounded nose, raked windscreen flowing into a high roof, rounded sleeper, then an exposed
// chassis with the drive axles. Front at -Z, ground at y = 0 (same convention as stage.ts).
import * as THREE from 'three';

// [distance from the front bumper, half width, bottom y, top y, corner roundness exponent]
// Higher exponent = squarer cross-section. Kept smooth so the overhead lights roll over it.
const STATIONS: [number, number, number, number, number][] = [
  [0.0, 1.0, 0.62, 1.05, 2.4],
  [0.12, 1.18, 0.5, 1.38, 3.0],
  [0.35, 1.26, 0.44, 1.72, 3.4],
  [0.75, 1.29, 0.42, 2.25, 3.8],
  [1.25, 1.3, 0.42, 2.95, 4.0],
  [1.75, 1.3, 0.42, 3.45, 4.2],
  [2.3, 1.3, 0.42, 3.78, 4.4],
  [3.0, 1.3, 0.42, 3.9, 4.6],
  [3.75, 1.29, 0.44, 3.88, 4.6],
  [4.15, 1.24, 0.5, 3.8, 4.2],
  [4.3, 1.1, 0.6, 3.6, 3.4],
];
const RING = 48; // points around each cross-section

function sp(v: number, e: number) {
  return Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
}

/** Point on a station's superellipse ring; a in [0, 2π), 0 = right side, π/2 = top. */
function ringPoint(st: (typeof STATIONS)[number], a: number, zFront: number): THREE.Vector3 {
  const [s, hw, y0, y1, e] = st;
  const hh = (y1 - y0) / 2;
  return new THREE.Vector3(hw * sp(Math.cos(a), e), y0 + hh + hh * sp(Math.sin(a), e), zFront + s);
}

/** Loft a band of the shell between stations [s0, s1] and ring angles [a0, a1]. */
function loft(s0: number, s1: number, a0: number, a1: number, steps: number, zFront: number, inflate = 0) {
  const pos: number[] = [];
  const idx: number[] = [];
  const rows = s1 - s0 + 1;
  for (let i = s0; i <= s1; i++) {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      const p = ringPoint(STATIONS[i], a, zFront);
      if (inflate) {
        // push glass a hair outward so it sits on the paint without z-fighting
        const c = new THREE.Vector3(0, (STATIONS[i][2] + STATIONS[i][3]) / 2, p.z);
        p.add(p.clone().sub(c).setZ(0).normalize().multiplyScalar(inflate));
      }
      pos.push(p.x, p.y, p.z);
    }
  }
  const cols = steps + 1;
  for (let r = 0; r < rows - 1; r++)
    for (let k = 0; k < steps; k++) {
      const a = r * cols + k, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c); // counter-clockwise from outside
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat cap closing a station (front bumper face or back of the sleeper). */
function cap(i: number, zFront: number, facingFront: boolean) {
  const st = STATIONS[i];
  const pos: number[] = [0, (st[2] + st[3]) / 2, zFront + st[0]];
  for (let k = 0; k <= RING; k++) {
    const p = ringPoint(st, (k / RING) * Math.PI * 2, zFront);
    pos.push(p.x, p.y, p.z);
  }
  const idx: number[] = [];
  for (let k = 1; k <= RING; k++) facingFront ? idx.push(0, k + 1, k) : idx.push(0, k, k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildAeroTruck(w: number, l: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'truck';
  const L = l / 2;
  const zFront = -L;
  const sx = w / 2.6; // stations are authored for a 2.6 m wide cab
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.92, 0.94, 0.96, THREE.LinearSRGBColorSpace),
    metalness: 0.05,
    roughness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.04, metalness: 0.5, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.3, metalness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xeaf4ff, emissiveIntensity: 5 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 5 });

  const shell = new THREE.Group();
  shell.scale.set(sx, 1, 1);
  const last = STATIONS.length - 1;
  const body = new THREE.Mesh(loft(0, last, 0, Math.PI * 2, RING, zFront), paint);
  body.castShadow = body.receiveShadow = true;
  shell.add(body, new THREE.Mesh(cap(0, zFront, true), paint), new THREE.Mesh(cap(last, zFront, false), paint));
  // wraparound windscreen: the upper front of the shell between the hood and the roof
  shell.add(new THREE.Mesh(loft(3, 5, Math.PI * 0.12, Math.PI * 0.88, 28, zFront, 0.012), glass));
  // side windows behind it
  shell.add(new THREE.Mesh(loft(5, 6, Math.PI * 0.06, Math.PI * 0.2, 6, zFront, 0.012), glass));
  shell.add(new THREE.Mesh(loft(5, 6, Math.PI * 0.8, Math.PI * 0.94, 6, zFront, 0.012), glass));
  g.add(shell);

  // lower trim, lights and markers
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.16, 4.0), trim);
  skirt.position.set(0, 0.46, zFront + 2.15);
  g.add(skirt);
  // light bar on the face of the bumper (the front cap is at zFront, 0.62-1.05 m high)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.05, 0.03), white);
  bar.position.set(0, 0.88, zFront - 0.02);
  g.add(bar);
  for (let i = -1; i <= 1; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), amber);
    m.position.set(i * 0.36, 3.42, zFront + 1.76);
    m.rotation.x = -0.75;
    g.add(m);
  }
  for (const s of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.16), trim);
    mirror.position.set(s * (w / 2 + 0.12), 2.35, zFront + 1.0);
    g.add(mirror);
  }

  // exposed chassis behind the cab: frame rails, deck plate and enclosed side boxes
  const rails = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.3, l - 4.2), trim);
  rails.position.set(0, 0.82, zFront + 4.2 + (l - 4.2) / 2);
  g.add(rails);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.08, 1.1), rim);
  deck.position.set(0, 1.12, L - 1.15);
  g.add(deck);
  for (const s of [-1, 1]) {
    const box = new THREE.Mesh(new RoundedBox(0.34, 0.62, 1.6), paint);
    box.position.set(s * (w / 2 - 0.2), 0.86, zFront + 3.4);
    g.add(box);
  }

  const wheel = (r: number, width: number, x: number, z: number) => {
    const wg = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 28), tyre);
    t.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 24), rim);
    hub.rotation.z = Math.PI / 2;
    wg.add(t, hub);
    wg.position.set(x, r, z);
    wg.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.add(wg);
  };
  wheel(0.52, 0.32, -(w / 2 - 0.2), zFront + 1.05);
  wheel(0.52, 0.32, w / 2 - 0.2, zFront + 1.05);
  for (const z of [L - 1.75, L - 0.6]) for (const s of [-1, 1]) wheel(0.52, 0.55, s * (w / 2 - 0.32), z);
  return g;
}

// small rounded box helper (kept local so this file stands alone)
class RoundedBox extends THREE.BufferGeometry {
  constructor(w: number, h: number, d: number) {
    super();
    const b = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
    const p = b.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const r = Math.min(w, h, d) * 0.3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = new THREE.Vector3(
        Math.max(-w / 2 + r, Math.min(w / 2 - r, v.x)),
        Math.max(-h / 2 + r, Math.min(h / 2 - r, v.y)),
        Math.max(-d / 2 + r, Math.min(d / 2 - r, v.z)),
      );
      const n = v.clone().sub(c);
      if (n.lengthSq() > 0) v.copy(c.add(n.normalize().multiplyScalar(r)));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    this.copy(b);
    this.computeVertexNormals();
  }
}
