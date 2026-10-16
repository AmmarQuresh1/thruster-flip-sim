// Dev-only: builds each model and exports it as a binary glTF (.glb).
// Driven by scripts/export-glb.ts; not part of the production build.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildCar } from './render/car';
import { parkedVehicle } from './render/stage';
import { COURSE } from './sim/config';

function toB64(buf: ArrayBuffer) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function exportObj(obj: THREE.Object3D): Promise<string> {
  const ex = new GLTFExporter();
  const res = await ex.parseAsync(obj, { binary: true, onlyVisible: true });
  return toB64(res as ArrayBuffer);
}

(window as unknown as Record<string, unknown>).__export = async () => {
  const out: Record<string, string> = {};
  const car = buildCar(null);
  car.root.name = 'hero-car';
  out['hero-car'] = await exportObj(car.root);
  const seen = new Set<string>();
  for (const v of COURSE.lineup) {
    const name = seen.has(v.kind) ? `${v.kind}-2` : v.kind;
    seen.add(v.kind);
    const g = parkedVehicle(v.kind, v.w, v.h, v.l);
    g.name = name;
    out[name] = await exportObj(g);
  }
  return out;
};
