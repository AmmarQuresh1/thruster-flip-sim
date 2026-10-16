// An original, unbranded wedge supercar built from lofted cross-sections.
// Car local frame matches the sim: +x forward, +y up, +z right.
import * as THREE from 'three';
import { CAR, THRUSTERS } from '../sim/config';

// [x, bottomHalfW, beltHalfW, beltY, roofHalfW, roofY]
const STATIONS: number[][] = [
  [-2.25, 0.88, 0.93, -0.06, 0.84, 0.0],
  [-1.95, 0.94, 0.98, -0.03, 0.8, 0.09],
  [-1.25, 0.96, 0.99, -0.05, 0.6, 0.31],
  [-0.6, 0.96, 0.98, -0.09, 0.53, 0.41],
  [0.1, 0.95, 0.97, -0.13, 0.54, 0.38],
  [0.72, 0.94, 0.95, -0.17, 0.6, 0.11],
  [1.5, 0.9, 0.9, -0.25, 0.77, -0.17],
  [2.25, 0.8, 0.76, -0.43, 0.68, -0.37],
];
const BASE_Y = -0.72;
const GLASS_FROM = 2; // station index range whose upper faces are glass
const GLASS_TO = 5;

function buildBody(paint: THREE.Material, glass: THREE.Material, under: THREE.Material) {
  const pos: number[] = [];
  const groups: { start: number; count: number; mat: number }[] = [];
  const ring = (s: number[]) => {
    const [x, wb, wbelt, yb, wr, yr] = s;
    // loop: bottom-left, belt-left, roof-left, roof-right, belt-right, bottom-right
    return [
      [x, BASE_Y, -wb],
      [x, yb, -wbelt],
      [x, yr, -wr],
      [x, yr, wr],
      [x, yb, wbelt],
      [x, BASE_Y, wb],
    ];
  };
  const pushTri = (a: number[], b: number[], c: number[], mat: number) => {
    const start = pos.length / 3;
    pos.push(...a, ...b, ...c);
    const last = groups[groups.length - 1];
    if (last && last.mat === mat && last.start + last.count === start) last.count += 3;
    else groups.push({ start, count: 3, mat });
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], mat: number) => {
    pushTri(a, b, c, mat);
    pushTri(a, c, d, mat);
  };
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const A = ring(STATIONS[i]);
    const B = ring(STATIONS[i + 1]);
    const isGlass = i >= GLASS_FROM && i < GLASS_TO;
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      let mat = 0;
      if (k === 5) mat = 2; // underside
      else if (isGlass && (k === 1 || k === 2 || k === 3)) mat = 1;
      // winding so normals face outward
      quad(A[k], A[k2], B[k2], B[k], mat);
    }
  }
  // end caps
  const capRear = ring(STATIONS[0]);
  const capFront = ring(STATIONS[STATIONS.length - 1]);
  for (let k = 1; k < 5; k++) {
    pushTri(capRear[0], capRear[k + 1], capRear[k], 0);
    pushTri(capFront[0], capFront[k], capFront[k + 1], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.mat);
  g.computeVertexNormals(); // non-indexed -> flat facets
  const m = new THREE.Mesh(g, [paint, glass, under]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildWheel(tyreMat: THREE.Material, rimMat: THREE.Material) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const r = CAR.wheelRadius;
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.27, 28, 1, true), tyreMat);
  tyre.rotation.x = Math.PI / 2;
  const side = new THREE.Mesh(new THREE.RingGeometry(r * 0.66, r, 28), tyreMat);
  side.position.z = 0.135;
  const side2 = side.clone();
  side2.position.z = -0.135;
  side2.rotation.y = Math.PI;
  spin.add(tyre, side, side2);
  // turbine-style rim: 7 thin blades
  for (let i = 0; i < 7; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, 0.045, 0.03), rimMat);
    blade.rotation.z = (i / 7) * Math.PI * 2 + 0.25;
    blade.position.z = 0.12;
    const b2 = blade.clone();
    b2.position.z = -0.12;
    spin.add(blade, b2);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 12), rimMat);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  g.userData.spin = spin;
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export interface CarRig {
  root: THREE.Group;
  wheels: THREE.Group[];
  nozzleGlow: THREE.MeshStandardMaterial[];
  setWheels(susp: number[], rot: number[]): void;
  setThrottle(t: number[]): void;
}

export function buildCar(envMap: THREE.Texture | null): CarRig {
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xe9ecef,
    roughness: 0.32,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMap,
    envMapIntensity: 0.6,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.04, metalness: 0.6, clearcoat: 1, envMap, envMapIntensity: 1.2 });
  const under = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.8, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x101215, roughness: 0.45, metalness: 0.6, envMap });
  root.add(buildBody(paint, glass, under));

  // dark lower side skirts
  for (const sz of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.05), trim);
    sk.position.set(0, -0.62, sz * 0.97);
    root.add(sk);
  }
  // front splitter + rear diffuser
  const split = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 1.62), trim);
  split.position.set(2.24, -0.7, 0);
  root.add(split);
  const diff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 1.7), trim);
  diff.position.set(-2.2, -0.58, 0);
  root.add(diff);

  // headlamps: two slim angled slits
  const lamp = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xf4f8ff, emissiveIntensity: 7 });
  for (const sz of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.42), lamp);
    h.position.set(2.235, -0.4, sz * 0.47);
    h.rotation.x = sz * 0.22;
    root.add(h);
  }
  // tail lamps: three short segments a side
  const tail = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1c2c, emissiveIntensity: 6 });
  for (const sz of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.16), tail);
      t.position.set(-2.255, -0.12, sz * (0.42 + i * 0.19));
      root.add(t);
    }

  // thruster nozzles
  const nozzleGlow: THREE.MeshStandardMaterial[] = [];
  const nozzleBody = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.3, metalness: 0.9, envMap });
  for (const t of THRUSTERS) {
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xbfe3ff, emissiveIntensity: 0 });
    nozzleGlow.push(glow);
    const r = t.group === 'boost' ? 0.075 : 0.06;
    const n = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, 0.08, 16, 1, true), nozzleBody);
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.9, 16), glow);
    const g = new THREE.Group();
    g.add(n, core);
    core.position.y = -0.03;
    core.rotation.x = Math.PI / 2;
    // cylinder axis is +y; orient so it points along the plume direction (-dir)
    const plume = new THREE.Vector3(-t.dir.x, -t.dir.y, -t.dir.z);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), plume);
    g.position.set(t.pos.x, t.pos.y, t.pos.z);
    root.add(g);
  }

  // wheels
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.25, metalness: 0.9, envMap });
  const wheels: THREE.Group[] = [];
  const anchors = [
    [CAR.wheelX, -CAR.wheelZ],
    [CAR.wheelX, CAR.wheelZ],
    [-CAR.wheelX, -CAR.wheelZ],
    [-CAR.wheelX, CAR.wheelZ],
  ];
  const wy = -CAR.halfExtents.y + 0.05;
  for (const [x, z] of anchors) {
    const w = buildWheel(tyreMat, rimMat);
    w.position.set(x, wy - CAR.suspensionRest, z);
    root.add(w);
    wheels.push(w);
  }

  return {
    root,
    wheels,
    nozzleGlow,
    setWheels(susp, rot) {
      for (let i = 0; i < 4; i++) {
        const w = wheels[i];
        w.position.y = wy - Math.min(susp[i], CAR.suspensionRest + 0.12);
        (w.userData.spin as THREE.Group).rotation.z = -rot[i];
      }
    },
    setThrottle(t) {
      for (let i = 0; i < t.length; i++) nozzleGlow[i].emissiveIntensity = t[i] * 8;
    },
  };
}
