// The night-time demo set: ground, stage platform with LED strip, kicker ramp,
// an unbranded parked lineup, floodlight rigs, a power line, and a few drone lights.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COURSE } from '../sim/config';

const ASPHALT = 0x0a0b0d;

function emissive(color: number, intensity = 4) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity, roughness: 1 });
}

function noiseTexture(size = 256, base = 18, spread = 10) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = base + Math.random() * spread;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v + 2;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Generic parked vehicles, built from rounded boxes. Nose faces -z (toward the event camera).
 * Deliberately unbranded: a cab-over semi tractor, a pickup, a saloon and an SUV.
 */
const PAINT: Record<string, number> = { sedan: 0x9a8156, sedan2: 0x141b29, truck: 0xeef0f2, pickup: 0x5c1a1f, suv: 0x22252a };
let sedanCount = 0;

function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function parkedVehicle(kind: string, w: number, h: number, l: number) {
  const g = new THREE.Group();
  const colorKey = kind === 'sedan' && sedanCount++ % 2 === 1 ? 'sedan2' : kind;
  const isWhite = kind === 'truck';
  const paint = new THREE.MeshPhysicalMaterial({
    color: PAINT[colorKey] ?? 0x1a1d22,
    roughness: isWhite ? 0.18 : 0.3,
    metalness: isWhite ? 0.05 : 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x06080b, roughness: 0.05, metalness: 0.5, clearcoat: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.6, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x060606, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.3, metalness: 0.8 });
  const white = emissive(0xeaf4ff, 5);
  const amber = emissive(0xffa040, 5);
  const L = l / 2;
  const at = (m: THREE.Object3D, x: number, y: number, z: number) => (m.position.set(x, y, z), g.add(m), m);

  const wheel = (r: number, width: number, x: number, z: number) => {
    const wg = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 24), tyre);
    t.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.02, 20), rim);
    hub.rotation.z = Math.PI / 2;
    wg.add(t, hub);
    at(wg, x, r, z);
  };

  if (kind === 'truck') {
    // cab-over semi tractor
    at(rbox(w * 0.86, 0.45, l * 0.96, 0.05, trim), 0, 0.85, 0); // frame rails
    at(rbox(w, 2.3, 2.3, 0.18, paint), 0, 2.25, -L + 1.15); // cab
    at(rbox(w * 0.97, 2.5, 1.7, 0.16, paint), 0, 2.45, -L + 3.1); // sleeper
    const fair = at(rbox(w * 0.96, 0.7, 2.1, 0.25, paint), 0, 3.62, -L + 1.6); // roof fairing
    fair.rotation.x = 0.18;
    const ws = at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.95, 0.04), glass), 0, 2.8, -L - 0.01); // windshield
    ws.rotation.x = -0.06;
    for (const sx of [-1, 1]) at(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 1.0), glass), sx * (w / 2 + 0.005), 2.75, -L + 0.75); // door glass
    at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.56, 0.75, 0.05), trim), 0, 1.65, -L - 0.02); // grille
    at(rbox(w * 1.02, 0.38, 0.32, 0.08, trim), 0, 0.9, -L - 0.05); // bumper
    for (const sx of [-1, 1]) {
      at(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.03), white), sx * (w / 2 - 0.35), 1.25, -L - 0.04); // headlamps
      at(rbox(0.3, 0.75, 2.3, 0.08, paint), sx * (w / 2 - 0.12), 0.95, -L + 3.0); // side fairings
    }
    at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, 0.03), white), 0, 1.12, -L - 0.22); // light bar at bumper level
    for (let i = -1; i <= 1; i++) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), amber), i * 0.3, 3.3, -L - 0.03);
    wheel(0.52, 0.32, -(w / 2 - 0.2), -L + 1.0);
    wheel(0.52, 0.32, w / 2 - 0.2, -L + 1.0);
    for (const z of [L - 1.75, L - 0.6]) for (const sx of [-1, 1]) wheel(0.52, 0.55, sx * (w / 2 - 0.32), z);
  } else if (kind === 'pickup') {
    at(rbox(w, 0.78, l, 0.14, paint), 0, 0.95, 0); // lower body
    at(rbox(w * 0.9, 0.72, 2.0, 0.16, glass), 0, 1.66, -L + 2.35); // cab glasshouse
    at(rbox(w * 0.86, 0.08, 1.55, 0.04, paint), 0, 2.03, -L + 2.4); // roof
    at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.84, 0.06, 1.95), trim), 0, 1.33, L - 1.05); // bed floor
    for (const sx of [-1, 1]) at(rbox(0.1, 0.2, 2.1, 0.03, paint), sx * (w / 2 - 0.06), 1.42, L - 1.05); // bed rails
    at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.04, 0.03), white), 0, 1.2, -L - 0.02);
    for (const z of [-L + 1.0, L - 0.95]) for (const sx of [-1, 1]) wheel(0.44, 0.3, sx * (w / 2 - 0.12), z);
  } else {
    const suv = kind === 'suv';
    const bodyH = suv ? 0.78 : 0.6;
    at(rbox(w, bodyH, l, 0.2, paint), 0, 0.32 + bodyH / 2, 0);
    const ghH = suv ? 0.62 : 0.5;
    const ghL = suv ? l * 0.62 : l * 0.48;
    const ghZ = suv ? L * 0.08 : -L * 0.02;
    at(rbox(w * 0.86, ghH, ghL, 0.2, glass), 0, 0.32 + bodyH + ghH / 2 - 0.04, ghZ); // glasshouse
    at(rbox(w * 0.8, 0.07, ghL * 0.8, 0.03, paint), 0, 0.32 + bodyH + ghH - 0.06, ghZ); // roof
    if (suv) at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.035, 0.03), white), 0, 0.32 + bodyH * 0.75, -L - 0.02); // light bar
    else
      for (const sx of [-1, 1]) {
        const hl = at(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.03), white), sx * 0.66, 0.32 + bodyH * 0.72, -L - 0.03);
        hl.rotation.z = sx * 0.12;
      }
    for (const z of [-L + 0.95, L - 0.95]) for (const sx of [-1, 1]) wheel(0.36, 0.24, sx * (w / 2 - 0.1), z);
  }
  return g;
}

export function buildStage(scene: THREE.Scene) {
  const root = new THREE.Group();
  scene.add(root);

  // ground
  const tex = noiseTexture();
  tex.repeat.set(60, 60);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: ASPHALT, map: tex, roughness: 0.82, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // stage platform under the lineup, with the red LED strip along its front edge
  const xs = COURSE.lineup.map((v) => v.x);
  const x0 = Math.min(...xs) - 4.5;
  const x1 = Math.max(...xs) + 4.5;
  const platW = x1 - x0;
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(platW, 0.08, 9),
    new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.55, metalness: 0.3 }),
  );
  plat.position.set((x0 + x1) / 2, 0.04, 0);
  plat.receiveShadow = true;
  root.add(plat);
  const ledMat = emissive(0xff2236, 4.5);
  const led = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.11, 0.09), ledMat);
  led.position.set((x0 + x1) / 2, 0.09, -4.52);
  root.add(led);
  // a longer run-off strip further forward, like the event floor
  const led2 = new THREE.Mesh(new THREE.BoxGeometry(110, 0.08, 0.08), emissive(0xff2236, 2.4));
  led2.position.set(8, 0.02, -7.6);
  root.add(led2);
  // red light spill on the floor in front of the strips
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 6),
    new THREE.MeshBasicMaterial({ color: 0xff1a2e, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(8, 0.015, -6.8);
  root.add(spill);

  // lineup
  for (const v of COURSE.lineup) {
    const car = parkedVehicle(v.kind, v.w, v.h, v.l);
    car.position.set(v.x, 0.08, COURSE.lineupZ);
    root.add(car);
  }

  // optional kicker ramp, hidden unless the ramp setting is on
  const rampGroup = new THREE.Group();
  {
    const { startX: a, endX: b, height: h, halfWidth: w } = COURSE.ramp;
    const rs = new THREE.Shape();
    rs.moveTo(a, 0);
    rs.lineTo(b, 0);
    rs.lineTo(b, h);
    rs.closePath();
    const rg = new THREE.ExtrudeGeometry(rs, { depth: w * 2, bevelEnabled: false });
    rg.translate(0, 0, -w);
    const ramp = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.6 }));
    ramp.castShadow = ramp.receiveShadow = true;
    rampGroup.add(ramp);
    const len = Math.hypot(b - a, h);
    const ang = Math.atan2(h, b - a);
    for (const sz of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), emissive(0xeaf4ff, 1.3));
      edge.position.set((a + b) / 2, h / 2 + 0.03, sz * (w + 0.02));
      edge.rotation.z = ang;
      rampGroup.add(edge);
    }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, w * 2), emissive(0xff2236, 4));
    lip.position.set(b, h + 0.02, 0);
    rampGroup.add(lip);
  }
  rampGroup.visible = false;
  root.add(rampGroup);

  // floodlight rigs (left of the event shot = +x side here, behind the lineup)
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.7, metalness: 0.5 });
  const lampMat = emissive(0xfff3dd, 3.5);
  // low truss rigs either side of the lineup, each with a row of round stage lamps angled up
  const rigs = [
    { x: 31, z: 7 },
    { x: -5, z: 7 },
  ];
  const housing = new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.5, metalness: 0.7 });
  for (const r of rigs) {
    const g = new THREE.Group();
    for (const y of [0.9, 2.1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 0.08), rigMat);
      bar.position.y = y;
      g.add(bar);
    }
    for (let i = 0; i <= 8; i++) {
      const diag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), rigMat);
      diag.position.set(-3.2 + i * 0.8, 1.5, 0);
      diag.rotation.z = i % 2 ? 0.55 : -0.55;
      g.add(diag);
    }
    for (const sx of [-3.2, 3.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), rigMat);
      leg.position.set(sx, 1.1, 0);
      g.add(leg);
    }
    for (let i = 0; i < 6; i++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.45, 18), housing);
      can.rotation.x = Math.PI / 2 - 0.35;
      can.position.set(-2.6 + i * 1.04, 2.55, 0);
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.27, 18), lampMat);
      lamp.position.set(0, -0.23, 0);
      lamp.rotation.x = Math.PI / 2;
      can.add(lamp);
      g.add(can);
    }
    g.position.set(r.x, 0, r.z);
    g.lookAt(13, 3, -40);
    root.add(g);
  }

  // floodlight tower behind the semi: two banks of 2x3 cool-white panels
  const towerX = COURSE.lineup.reduce((a, v) => (v.h > a.h ? v : a)).x;
  const tower = new THREE.Group();
  const mastT = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 15, 10), rigMat);
  mastT.position.y = 7.5;
  tower.add(mastT);
  const coolMat = emissive(0xe9f2ff, 5);
  for (const by of [14.6, 12.9]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.35, 0.25), rigMat);
    frame.position.set(0, by, 0);
    tower.add(frame);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const pnl = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.5), coolMat);
        pnl.position.set(-0.82 + i * 0.82, by - 0.3 + j * 0.6, -0.14);
        pnl.rotation.y = Math.PI;
        tower.add(pnl);
      }
  }
  // faint haze cone under the lamps (fake god-rays)
  const haze = new THREE.Mesh(
    new THREE.ConeGeometry(9, 15, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x9fb6d6, transparent: true, opacity: 0.022, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  haze.position.set(0, 6.5, -4);
  haze.rotation.x = -0.28;
  tower.add(haze);
  tower.position.set(towerX, 0, 14);
  root.add(tower);

  // curved truss arch behind the landing side
  const archMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.4, metalness: 0.85 });
  for (const off of [-0.45, 0.45]) {
    const curve = new THREE.EllipseCurve(0, 0, 8, 7.5, 0, Math.PI, false, 0);
    const pts = curve.getPoints(48).map((p) => new THREE.Vector3(0, p.y, p.x));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.12, 8, false), archMat);
    tube.position.set(off, 0, 0);
    const arch = new THREE.Group();
    arch.add(tube);
    arch.position.set(36, 0, 16);
    arch.rotation.y = -0.5;
    root.add(arch);
  }

  // approach lane: painted centreline, low barriers with vertical red LED strips,
  // and low floodlights that switch on in sequence as the car passes
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.7 });
  const lineA = new THREE.Mesh(new THREE.PlaneGeometry(COURSE.laneEndX + 70, 0.16), paint);
  lineA.rotation.x = -Math.PI / 2;
  lineA.position.set((COURSE.laneEndX - 70) / 2, 0.012, 0);
  root.add(lineA);
  const lineB = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.16), paint);
  lineB.rotation.x = -Math.PI / 2;
  lineB.position.set(x1 + 40, 0.012, 0);
  root.add(lineB);
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.5, metalness: 0.7 });
  const stripMat = emissive(0xff2236, 4);
  const floods: { x: number; mat: THREE.MeshStandardMaterial }[] = [];
  for (const sz of [-1, 1]) {
    const len = COURSE.laneEndX + 66;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 0.18), barrierMat);
    bar.position.set(COURSE.laneEndX - 1 - len / 2, 0.35, sz * 4.6);
    root.add(bar);
    for (let x = COURSE.laneEndX - 3; x > COURSE.laneEndX - 66; x -= 3) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), stripMat);
      st.position.set(x, 0.38, sz * (4.6 - 0.1));
      root.add(st);
    }
    for (let x = COURSE.laneEndX - 5; x > COURSE.laneEndX - 64; x -= 6) {
      const mat = emissive(0xf4f7ff, 0);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.04), mat);
      f.position.set(x, 0.85, sz * (4.6 - 0.12));
      f.rotation.x = sz * 0.3;
      root.add(f);
      floods.push({ x, mat });
    }
  }

  // power line across the back
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 });
  const POLE_Z = 20;
  const poles = [18.5, -38];
  for (const px of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 11, 10), poleMat);
    pole.position.set(px, 5.5, POLE_Z);
    root.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.4), poleMat);
    arm.position.set(px, 10.4, POLE_Z);
    root.add(arm);
  }
  const wireMat = new THREE.LineBasicMaterial({ color: 0x3a3d44 });
  for (const [dz, dy] of [
    [-1.0, 10.5],
    [1.0, 10.5],
    [0, 8.6],
  ]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = -90 + t * 200;
      const sag = 1.4 * Math.cosh((x - 10) / 60) - 1.4 * Math.cosh(100 / 60);
      pts.push(new THREE.Vector3(x, dy + sag * 0.6 + 1, POLE_Z + dz));
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }


  // drone / crane lights in the sky
  const dotMat = emissive(0xffffff, 2.2);
  const dotG = new THREE.SphereGeometry(0.12, 8, 6);
  const sky = [
    [8, 24, 40],
    [9, 24.2, 40],
    [10, 24.1, 40],
    [11.2, 23.9, 40],
    [-6, 17, 38],
    [-5.6, 17.1, 38],
    [-5.2, 17, 38],
  ];
  for (const [x, y, z] of sky) {
    const d = new THREE.Mesh(dotG, dotMat);
    d.position.set(x, y, z);
    root.add(d);
  }

  return {
    root,
    setRamp(on: boolean) {
      rampGroup.visible = on;
    },
    /** Approach floodlights switch on one by one as the car reaches them; all off again on reset. */
    update(carX: number) {
      for (const f of floods) {
        const want = carX > f.x - 9 ? 4 : 0;
        f.mat.emissiveIntensity += (want - f.mat.emissiveIntensity) * 0.35;
      }
    },
  };
}

export function buildLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0x1a2230, 0x050505, 0.35));

  // key floodlight from the rig, casting shadows
  const key = new THREE.SpotLight(0xfff1dc, 260, 140, Math.PI / 7, 0.5, 1.4);
  key.position.set(34, 16, 8);
  key.target.position.set(10, 3, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 5;
  key.shadow.camera.far = 120;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);

  const fill = new THREE.SpotLight(0xdde8ff, 110, 140, Math.PI / 6, 0.6, 1.4);
  fill.position.set(-26, 14, 14);
  fill.target.position.set(4, 3, 0);
  scene.add(fill, fill.target);

  // front wash from the camera side, low, keeps the lineup readable
  const front = new THREE.SpotLight(0xffffff, 60, 120, Math.PI / 9, 0.7, 1.3);
  front.position.set(12, 6, -40);
  front.target.position.set(12, 2, 0);
  scene.add(front, front.target);

  // red bounce from the LED strip
  const red = new THREE.PointLight(0xff2a3a, 2, 10, 2);
  red.position.set(13, 0.6, -5.5);
  scene.add(red);

  return { key };
}
