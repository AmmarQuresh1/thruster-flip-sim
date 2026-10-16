// The night-time demo set: ground, stage platform with LED strip, kicker ramp,
// an unbranded parked lineup, floodlight rigs, a power line, and a few drone lights.
import * as THREE from 'three';
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

/** Generic parked vehicle: extruded side profile, dark paint, a white light bar facing the camera. */
function parkedVehicle(kind: string, w: number, h: number, l: number) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: kind === 'truck' ? 0x9ea3aa : 0x16191e, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });

  // profile in the (z, y) plane, nose toward -z (the camera)
  const s = new THREE.Shape();
  const L = l / 2;
  if (kind === 'truck') {
    // tall cab-over tractor unit
    s.moveTo(-L, 0.45);
    s.lineTo(L, 0.45);
    s.lineTo(L, h * 0.92);
    s.lineTo(-L + 0.6, h);
    s.lineTo(-L, h * 0.8);
    s.closePath();
  } else if (kind === 'pickup') {
    s.moveTo(-L, 0.35);
    s.lineTo(L, 0.35);
    s.lineTo(L, h * 0.62);
    s.lineTo(L * 0.05, h * 0.62);
    s.lineTo(-L * 0.15, h);
    s.lineTo(-L * 0.55, h * 0.72);
    s.lineTo(-L, h * 0.64);
    s.closePath();
  } else {
    const roofF = kind === 'suv' ? -0.35 : -0.25;
    s.moveTo(-L, 0.32);
    s.lineTo(L, 0.32);
    s.lineTo(L, h * 0.6);
    s.lineTo(L * 0.45, h);
    s.lineTo(L * roofF, h);
    s.lineTo(-L * 0.6, h * 0.62);
    s.lineTo(-L, h * 0.55);
    s.closePath();
  }
  const body = new THREE.ExtrudeGeometry(s, { depth: w * 0.94, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  body.translate(0, 0, -w * 0.47);
  body.rotateY(Math.PI / 2); // profile x -> world z
  const bm = new THREE.Mesh(body, paint);
  bm.castShadow = bm.receiveShadow = true;
  g.add(bm);

  // dark glass band
  const gb = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, h * 0.22, l * 0.4), glass);
  gb.position.set(0, h * 0.78, kind === 'truck' ? -L + 0.4 : -L * 0.05);
  if (kind !== 'truck') g.add(gb);

  // front light bar (faces -z)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.035, 0.02), emissive(0xeaf4ff, 5));
  bar.position.set(0, kind === 'truck' ? h * 0.33 : h * 0.52, -L - 0.07);
  g.add(bar);
  if (kind === 'truck') {
    // marker lamps along the cab roof
    for (let i = -2; i <= 2; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), emissive(0xffa040, 6));
      m.position.set(i * 0.38, h * 0.97, -L + 0.5);
      g.add(m);
    }
  }
  // wheels (visible as dark discs from the front three-quarter)
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20);
  wg.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(wg, tyre);
      t.position.set(sx * (w / 2 - 0.1), 0.36, sz * (L - 0.85));
      g.add(t);
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
  const ledMat = emissive(0xff2236, 7);
  const led = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.05, 0.05), ledMat);
  led.position.set((x0 + x1) / 2, 0.09, -4.52);
  root.add(led);
  // a longer run-off strip further forward, like the event floor
  const led2 = new THREE.Mesh(new THREE.BoxGeometry(110, 0.035, 0.04), emissive(0xff2236, 3.2));
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

  // kicker ramp
  const { rampStartX: a, rampEndX: b, rampHeight: h, rampHalfWidth: w } = COURSE;
  const rs = new THREE.Shape();
  rs.moveTo(a, 0);
  rs.lineTo(b, 0);
  rs.lineTo(b, h);
  rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, { depth: w * 2, bevelEnabled: false });
  rg.translate(0, 0, -w);
  const ramp = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.6 }));
  ramp.castShadow = ramp.receiveShadow = true;
  root.add(ramp);
  const len = Math.hypot(b - a, h);
  const ang = Math.atan2(h, b - a);
  for (const sz of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), emissive(0xeaf4ff, 1.3));
    edge.position.set((a + b) / 2, h / 2 + 0.03, sz * (w + 0.02));
    edge.rotation.z = ang;
    root.add(edge);
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, w * 2), emissive(0xff2236, 6));
  lip.position.set(b, h + 0.02, 0);
  root.add(lip);

  // floodlight rigs (left of the event shot = +x side here, behind the lineup)
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.7, metalness: 0.5 });
  const lampMat = emissive(0xfff3dd, 3.5);
  const rigs = [
    { x: 34, z: 6 },
    { x: -26, z: 14 },
  ];
  for (const r of rigs) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 0.3), rigMat);
    frame.position.y = 1.6;
    g.add(frame);
    for (let i = 0; i < 6; i++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), lampMat);
      lamp.position.set(-2.5 + i, 2.2, -0.16);
      lamp.rotation.y = Math.PI;
      g.add(lamp);
      const lamp2 = lamp.clone();
      lamp2.position.y = 1.2;
      g.add(lamp2);
    }
    g.position.set(r.x, 0, r.z);
    g.lookAt(13, 0, -40);
    root.add(g);
  }

  // power line across the back
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 });
  const poles = [-20, 40];
  for (const px of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 11, 10), poleMat);
    pole.position.set(px, 5.5, 34);
    root.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.4), poleMat);
    arm.position.set(px, 10.4, 34);
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
      pts.push(new THREE.Vector3(x, dy + sag * 0.6 + 1, 34 + dz));
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // tall light mast behind the stage
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 16, 8), rigMat);
  mast.position.set(4, 8, 30);
  root.add(mast);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.2), lampMat);
  mh.position.set(4, 16.2, 29.8);
  root.add(mh);

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

  return root;
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
  const red = new THREE.PointLight(0xff2a3a, 6, 14, 1.8);
  red.position.set(13, 0.6, -5.5);
  scene.add(red);

  return { key };
}
