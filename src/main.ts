import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import R from '@dimforge/rapier3d-deterministic-compat';

import { DT, SLICE, SLICES, TANKS, THRUSTERS, type TankMode } from './sim/config';
import { Sim, rotate, type Frame, type Outcome } from './sim/sim';
import { cell, decodeShare, encodeShare, isEmpty, setCell, type Program } from './sim/program';
import { PRESETS, DEFAULT_PRESET } from './sim/presets';
import { buildStage, buildLights } from './render/stage';
import { buildCar } from './render/car';
import { Plumes } from './render/plumes';
import { ThrusterAudio } from './render/audio';
import { DIR_CAMS, DIR_CAM_INFO, decodeDirector, defaultDirector, encodeDirector, sameDirector, type DirCam, type Director } from './director';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const REST_Y = 0.99; // chassis centre height when parked

// ---------------------------------------------------------------- renderer
const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030405);
scene.fog = new THREE.FogExp2(0x030405, 0.0075);

// A dark reflection environment with a few bright panels where the real lights are,
// so the paint picks up floodlight streaks and the red strip instead of a studio box.
function buildEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const panel = (color: number, intensity: number, w: number, h: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(0xfff1dc, 6, 8, 3, [30, 10, 8]);
  panel(0xdde8ff, 4, 8, 3, [-28, 10, 14]);
  panel(0xffffff, 2.5, 30, 2, [0, 20, -30]);
  panel(0xff2236, 1.2, 60, 0.6, [0, 0.5, -10]);
  panel(0x404858, 1, 200, 40, [0, 40, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}
const envMap = buildEnv();

const stage = buildStage(scene);
const { key: keyLight } = buildLights(scene);
const carKey = new THREE.DirectionalLight(0xe8eef8, 1.1);
carKey.position.set(-6, 14, -30);
scene.add(carKey, carKey.target);
const car = buildCar(envMap);
scene.add(car.root);
const plumes = new Plumes(scene);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;

// ---------------------------------------------------------------- cameras
type CamMode = 'event' | 'side' | 'runway' | 'tele' | 'landing' | 'chase' | 'free';
const CAM_ORDER: CamMode[] = ['event', 'side', 'runway', 'tele', 'landing', 'chase', 'free'];
const BASE_FOV: Record<CamMode, number> = { event: 40, side: 44, runway: 36, tele: 15, landing: 52, chase: 50, free: 50 };
function fovFor(m: CamMode) {
  const a = window.innerWidth / window.innerHeight;
  return Math.min(85, BASE_FOV[m] * (a < 1 ? 1.55 : a < 1.4 ? 1.2 : 1));
}
let camMode: CamMode = 'event';

// ---------------------------------------------------------------- quality
// 'auto' starts high and drops to low if frames are slow. Pixel count is capped either way,
// because a 4K screen at full resolution is what makes most decent PCs struggle here.
type Quality = 'auto' | 'high' | 'low';
let quality: Quality = 'auto';
let lowActive = false;
try {
  const q = localStorage.getItem('tfs-quality');
  if (q === 'high' || q === 'low' || q === 'auto') quality = q;
} catch {
  /* storage blocked */
}
function isLow() {
  return quality === 'low' || (quality === 'auto' && lowActive);
}
function pickPixelRatio(w: number, h: number) {
  const maxPixels = isLow() ? 1.2e6 : 4.5e6;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return Math.max(0.5, Math.min(dpr, Math.sqrt(maxPixels / (w * h))));
}
function applyQuality() {
  const low = isLow();
  rt.samples = low ? 0 : 4;
  const size = low ? 1024 : 2048;
  if (keyLight.shadow.mapSize.x !== size) {
    keyLight.shadow.mapSize.set(size, size);
    keyLight.shadow.map?.dispose();
    (keyLight.shadow as { map: unknown }).map = null;
  }
  plumes.density = low ? 0.5 : 1;
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = pickPixelRatio(w, h);
  renderer.setPixelRatio(dpr);
  composer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  // bloom is blurry by nature, so render it at half resolution
  // bloom is blurry by nature, so on low quality render it at half resolution
  const bs = isLow() ? 0.5 : 1;
  bloom.setSize(Math.round(w * dpr * bs), Math.round(h * dpr * bs));
  camera.aspect = w / h;
  // keep the whole jump in shot on tall phone screens
  camera.fov = fovFor(camMode);
  // Shift the projection up so the action is centred in the space above the programme panel.
  const panelH = Math.min(document.getElementById('panel')?.offsetHeight ?? 0, h * 0.6);
  camera.setViewOffset(w, h + panelH, 0, panelH, w, h);
  camera.updateProjectionMatrix();
  plumes.setViewportHeight(h * renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
applyQuality();

// ---------------------------------------------------------------- state
let program: Program = (PRESETS.find((p) => p.id === DEFAULT_PRESET) ?? PRESETS[0]).program();
let sim: Sim | null = null;
let tank: TankMode = 'standard';
let ramp = false;
let idleFrame: Frame;
let running = false;
let acc = 0;
let timeScale = 1;
let finishedAt = -1;
let lastOutcome: Outcome | null = null;
const camLook = new THREE.Vector3(-10, 5.2, 0);

const audio = new ThrusterAudio();

// ---------------------------------------------------------------- grid UI
const gridEl = $('grid');
const cells: HTMLButtonElement[][] = [];
const colCells: HTMLButtonElement[][] = Array.from({ length: SLICES }, () => []);
const dirCells: { cam: HTMLButtonElement[]; slow: HTMLButtonElement[] } = { cam: [], slow: [] };
let director: Director = defaultDirector();
let directorOn = true;
let brush: DirCam = 'event';
function buildGrid() {
  gridEl.innerHTML = '';
  const corner = document.createElement('div');
  corner.className = 'g-time';
  corner.textContent = 'time →';
  gridEl.appendChild(corner);
  for (let c = 0; c < SLICES; c++) {
    const t = document.createElement('div');
    t.className = 'g-time';
    t.textContent = c % 10 === 0 ? `${(c * SLICE).toFixed(0)}s` : c % 5 === 0 ? '·' : '';
    gridEl.appendChild(t);
  }
  THRUSTERS.forEach((th, r) => {
    const lab = document.createElement('div');
    lab.className = `g-label ${th.group}`;
    lab.innerHTML = `<i></i>${th.label}`;
    gridEl.appendChild(lab);
    cells[r] = [];
    for (let c = 0; c < SLICES; c++) {
      const b = document.createElement('button');
      b.className = `c ${th.group}${c % 10 === 0 ? ' s5' : ''}`;
      b.dataset.r = String(r);
      b.dataset.c = String(c);
      b.setAttribute('aria-label', `${th.label} at ${(c * SLICE).toFixed(1)} s`);
      b.tabIndex = c === 0 ? 0 : -1;
      gridEl.appendChild(b);
      cells[r][c] = b;
      colCells[c].push(b);
    }
  });

  // director track: a toolbar row, then the camera row and the slow-mo row
  const bar = document.createElement('div');
  bar.className = 'dir-bar';
  bar.innerHTML =
    `<label class="dir-toggle"><input type="checkbox" id="chk-dir" checked /><span>Director</span></label>` +
    `<span class="dir-brush" role="radiogroup" aria-label="Camera to paint">` +
    DIR_CAMS.map(
      (c) => `<button class="brush cam-${c}" data-cam="${c}" role="radio" aria-checked="false" title="Paint ${DIR_CAM_INFO[c].name} cam: click or drag on the Camera row. Shift-click cuts to the end of that shot."><i></i>${DIR_CAM_INFO[c].name}</button>`,
    ).join('') +
    `</span><button class="btn ghost dir-reset" id="btn-dir-reset" title="Back to runway, event, landing">Reset track</button>` +
    `<button class="btn ghost dir-open-btn" id="btn-dir-open" aria-expanded="false">Edit track</button>`;
  gridEl.appendChild(bar);
  for (const row of ['cam', 'slow'] as const) {
    const lab = document.createElement('div');
    lab.className = 'g-label dir';
    lab.innerHTML = row === 'cam' ? '<i></i>Camera' : '<i></i>Slow-mo';
    gridEl.appendChild(lab);
    for (let c = 0; c < SLICES; c++) {
      const b = document.createElement('button');
      b.className = `dc ${row}${c % 10 === 0 ? ' s5' : ''}`;
      b.dataset.row = row;
      b.dataset.c = String(c);
      b.setAttribute('aria-label', `${row === 'cam' ? 'Camera' : 'Slow-mo'} at ${(c * SLICE).toFixed(1)} s`);
      b.tabIndex = -1;
      gridEl.appendChild(b);
      dirCells[row][c] = b;
      colCells[c].push(b);
    }
  }
}
function paintGrid() {
  for (let r = 0; r < THRUSTERS.length; r++)
    for (let c = 0; c < SLICES; c++) {
      const on = cell(program, r, c) === 1;
      cells[r][c].classList.toggle('on', on);
      cells[r][c].setAttribute('aria-pressed', String(on));
    }
}
buildGrid();

let painting = false; // touch: none; shift-drag: freehand
let paintValue = 1;
let boxAnchor: [number, number] | null = null;
let boxEnd: [number, number] | null = null;
let boxCells: HTMLButtonElement[] = [];
function cellFrom(el: Element | null): [number, number] | null {
  const b = el?.closest?.('.c') as HTMLElement | null;
  if (!b) return null;
  return [Number(b.dataset.r), Number(b.dataset.c)];
}
function applyPaint(rc: [number, number]) {
  setCell(program, rc[0], rc[1], paintValue);
  cells[rc[0]][rc[1]].classList.toggle('on', paintValue === 1);
  cells[rc[0]][rc[1]].setAttribute('aria-pressed', String(paintValue === 1));
}
function clearBoxPreview() {
  for (const b of boxCells) b.classList.remove('sel-fill', 'sel-erase');
  boxCells = [];
}
// Only touch cells whose state changes, so dragging a big box stays cheap.
function showBox() {
  const want = new Set<HTMLButtonElement>();
  if (boxAnchor && boxEnd) {
    const [r0, r1] = [Math.min(boxAnchor[0], boxEnd[0]), Math.max(boxAnchor[0], boxEnd[0])];
    const [c0, c1] = [Math.min(boxAnchor[1], boxEnd[1]), Math.max(boxAnchor[1], boxEnd[1])];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) want.add(cells[r][c]);
  }
  const cls = paintValue ? 'sel-fill' : 'sel-erase';
  for (const b of boxCells) if (!want.has(b)) b.classList.remove('sel-fill', 'sel-erase');
  const had = new Set(boxCells);
  for (const b of want) if (!had.has(b)) b.classList.add(cls);
  boxCells = [...want];
}
// Work out which cell is under the pointer from the grid's geometry instead of asking the browser.
let gridGeom: { left: number; top: number; pitchX: number; pitchY: number; x0: number; y0: number } | null = null;
function measureGrid() {
  const a = cells[0][0].getBoundingClientRect();
  const b = cells[1][1].getBoundingClientRect();
  gridGeom = { left: 0, top: 0, pitchX: b.left - a.left, pitchY: b.top - a.top, x0: a.left, y0: a.top };
}
function cellAt(x: number, y: number): [number, number] | null {
  if (!gridGeom) return null;
  const c = Math.floor((x - gridGeom.x0) / gridGeom.pitchX);
  const r = Math.floor((y - gridGeom.y0) / gridGeom.pitchY);
  return [Math.max(0, Math.min(THRUSTERS.length - 1, r)), Math.max(0, Math.min(SLICES - 1, c))];
}
let moveQueued: { x: number; y: number } | null = null;
function commitBox() {
  if (!boxAnchor || !boxEnd) return;
  const [r0, r1] = [Math.min(boxAnchor[0], boxEnd[0]), Math.max(boxAnchor[0], boxEnd[0])];
  const [c0, c1] = [Math.min(boxAnchor[1], boxEnd[1]), Math.max(boxAnchor[1], boxEnd[1])];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) applyPaint([r, c]);
  clearBoxPreview();
  boxAnchor = boxEnd = null;
  markCustom();
}
gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
gridEl.addEventListener('pointerdown', (e) => {
  if (running) return;
  const rc = cellFrom(e.target as Element);
  if (!rc) return;
  e.preventDefault();
  const precise = e.pointerType === 'mouse' || e.pointerType === 'pen';
  // right button always erases; otherwise starting on a lit cell erases and an empty cell fills
  paintValue = e.button === 2 ? 0 : cell(program, rc[0], rc[1]) ? 0 : 1;
  if (precise && e.shiftKey) {
    measureGrid();
    painting = true; // freehand
    applyPaint(rc);
    markCustom();
  } else if (precise) {
    measureGrid();
    boxAnchor = boxEnd = rc; // box select, committed on release
    showBox();
  } else {
    applyPaint(rc); // touch: tap toggles one cell, drag scrolls the grid
    markCustom();
  }
});
window.addEventListener('pointermove', (e) => {
  if (!painting && !boxAnchor) return;
  // coalesce moves to one update per frame
  const first = !moveQueued;
  moveQueued = { x: e.clientX, y: e.clientY };
  if (!first) return;
  requestAnimationFrame(() => {
    const m = moveQueued;
    moveQueued = null;
    if (!m || (!painting && !boxAnchor)) return;
    const rc = cellAt(m.x, m.y);
    if (!rc) return;
    if (painting) applyPaint(rc);
    else if (rc[0] !== boxEnd?.[0] || rc[1] !== boxEnd?.[1]) {
      boxEnd = rc;
      showBox();
    }
  });
});
window.addEventListener('pointerup', () => {
  painting = false;
  commitBox();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && boxAnchor) {
    clearBoxPreview();
    boxAnchor = boxEnd = null;
  }
});
gridEl.addEventListener('keydown', (e) => {
  const rc = cellFrom(e.target as Element);
  if (!rc) return;
  let [r, c] = rc;
  if (e.key === 'ArrowRight') c = Math.min(SLICES - 1, c + 1);
  else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (e.key === 'ArrowDown') r = Math.min(THRUSTERS.length - 1, r + 1);
  else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (e.key === ' ' || e.key === 'Enter') {
    if (running) return;
    paintValue = cell(program, r, c) ? 0 : 1;
    applyPaint([r, c]);
    markCustom();
    e.preventDefault();
    return;
  } else return;
  e.preventDefault();
  cells[rc[0]][rc[1]].tabIndex = -1;
  cells[r][c].tabIndex = 0;
  cells[r][c].focus();
});

// ---------------------------------------------------------------- presets
const sel = $<HTMLSelectElement>('sel-preset');
for (const p of PRESETS) {
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.name;
  sel.appendChild(o);
}
const custom = document.createElement('option');
custom.value = 'custom';
custom.textContent = 'Your program';
sel.appendChild(custom);
function markCustom() {
  sel.value = 'custom';
}
sel.addEventListener('change', () => {
  const p = PRESETS.find((x) => x.id === sel.value);
  if (!p) return;
  program = p.program();
  setTank('standard'); // presets are tuned for the standard tank
  setRamp(!!p.ramp);
  paintGrid();
  setHint(p.blurb);
  resetRun();
});
const fine = window.matchMedia('(pointer: fine)').matches;
const HOW = fine
  ? 'Drag a box to fill cells. Start on a lit cell or right-drag to erase. Shift-drag paints freehand.'
  : 'Tap cells to fire a thruster for 0.1 s. Swipe to scroll the timeline.';
function setHint(s: string) {
  $('hint').textContent = s;
  $('hint').title = HOW;
}

// ---------------------------------------------------------------- tank + quality
const tankSel = $<HTMLSelectElement>('sel-tank');
for (const [id, t] of Object.entries(TANKS)) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = t.label;
  tankSel.appendChild(o);
}
function setTank(t: TankMode) {
  tank = t;
  tankSel.value = t;
}
const rampBox = $<HTMLInputElement>('chk-ramp');
function setRamp(on: boolean) {
  ramp = on;
  rampBox.checked = on;
  stage.setRamp(on);
}
rampBox.addEventListener('change', () => {
  setRamp(rampBox.checked);
  resetRun();
});
tankSel.addEventListener('change', () => {
  setTank(tankSel.value as TankMode);
  resetRun();
});
const qBtn = $('btn-quality');
const qNames: Record<Quality, string> = { auto: 'Quality: auto', high: 'Quality: high', low: 'Quality: low' };
qBtn.textContent = qNames[quality];
qBtn.addEventListener('click', () => {
  quality = quality === 'auto' ? 'high' : quality === 'high' ? 'low' : 'auto';
  qBtn.textContent = qNames[quality];
  try {
    localStorage.setItem('tfs-quality', quality);
  } catch {
    /* storage blocked */
  }
  applyQuality();
});

// ---------------------------------------------------------------- director track
function paintDirector() {
  for (let c = 0; c < SLICES; c++) {
    const cam = DIR_CAMS[director.cam[c]];
    const b = dirCells.cam[c];
    b.className = `dc cam cam-${cam}${c % 10 === 0 ? ' s5' : ''}`;
    // letter at the start of each camera segment
    b.textContent = c === 0 || director.cam[c - 1] !== director.cam[c] ? DIR_CAM_INFO[cam].letter : '';
    b.title = `${DIR_CAM_INFO[cam].name} cam from ${(c * SLICE).toFixed(1)} s`;
    dirCells.slow[c].classList.toggle('on', director.slow[c] === 1);
    dirCells.slow[c].setAttribute('aria-pressed', String(director.slow[c] === 1));
  }
  if (playheadCol >= 0) for (const b of colCells[playheadCol]) b.classList.add('ph');
}
function setBrush(c: DirCam) {
  brush = c;
  for (const b of gridEl.querySelectorAll<HTMLButtonElement>('.brush')) {
    const on = b.dataset.cam === c;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  }
}
function setDirectorOn(on: boolean) {
  directorOn = on;
  const box = document.getElementById('chk-dir') as HTMLInputElement | null;
  if (box) box.checked = on;
  gridEl.classList.toggle('dir-off', !on);
  if (on && running && sim) applyDirector(sim.time);
}
/** Called when you drive the camera or slow-mo by hand: the track steps aside. */
function directorOff(announce = true) {
  if (!directorOn) return;
  setDirectorOn(false);
  if (announce) toast('Director track off: you are driving the camera. Tick Director to use the track again.');
}
function applyDirector(t: number) {
  const c = Math.min(SLICES - 1, Math.floor(t / SLICE));
  const cam = DIR_CAMS[director.cam[c]];
  if (camMode !== cam) setCam(cam);
  const slow = director.slow[c] === 1;
  if ((timeScale < 1) !== slow) setSlow(slow);
}
gridEl.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'chk-dir') setDirectorOn(t.checked);
});
gridEl.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const br = t.closest<HTMLButtonElement>('.brush');
  if (br?.dataset.cam) setBrush(br.dataset.cam as DirCam);
  const ob = t.closest<HTMLButtonElement>('#btn-dir-open');
  if (ob) {
    const open = !gridEl.classList.contains('dir-open');
    gridEl.classList.toggle('dir-open', open);
    ob.setAttribute('aria-expanded', String(open));
    ob.textContent = open ? 'Hide track' : 'Edit track';
  }
  if (t.closest('#btn-dir-reset')) {
    director = defaultDirector();
    paintDirector();
    setDirectorOn(true);
  }
});
// Camera row: click or drag paints the brush camera on exactly the cells you touch.
// Shift-click (or a tap on touch screens, where dragging scrolls) cuts from that cell to the end of the shot.
// Slow-mo row: click toggles a cell; drag paints the first cell's new value.
let dirDrag: { row: 'cam' | 'slow'; start: number; last: number; value: number; moved: boolean; cut: boolean; before: Uint8Array } | null = null;
let dirGeom: { x0: number; pitch: number } | null = null;
function dirColAt(x: number) {
  if (!dirGeom) return 0;
  return Math.max(0, Math.min(SLICES - 1, Math.floor((x - dirGeom.x0) / dirGeom.pitch)));
}
function dirApplyRange(a: number, b: number) {
  if (!dirDrag) return;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const arr = dirDrag.row === 'cam' ? director.cam : director.slow;
  arr.set(dirDrag.before);
  for (let c = lo; c <= hi; c++) arr[c] = dirDrag.value;
  paintDirector();
}
gridEl.addEventListener('pointerdown', (e) => {
  const d = (e.target as HTMLElement).closest<HTMLButtonElement>('.dc');
  if (!d || running) return;
  e.preventDefault();
  const row = d.dataset.row as 'cam' | 'slow';
  const c = Number(d.dataset.c);
  const r0 = dirCells[row][0].getBoundingClientRect();
  const r1 = dirCells[row][1].getBoundingClientRect();
  dirGeom = { x0: r0.left, pitch: r1.left - r0.left };
  const arr = row === 'cam' ? director.cam : director.slow;
  const value = row === 'cam' ? DIR_CAMS.indexOf(brush) : arr[c] ? 0 : 1;
  const cut = row === 'cam' && (e.shiftKey || e.pointerType === 'touch');
  dirDrag = { row, start: c, last: c, value, moved: false, cut, before: arr.slice() };
  dirApplyRange(c, c);
  if (!directorOn) setDirectorOn(true);
});
window.addEventListener('pointermove', (e) => {
  if (!dirDrag) return;
  const c = dirColAt(e.clientX);
  if (c === dirDrag.last) return;
  dirDrag.last = c;
  dirDrag.moved = true;
  dirApplyRange(dirDrag.start, c);
});
window.addEventListener('pointerup', () => {
  if (!dirDrag) return;
  if (dirDrag.cut && !dirDrag.moved) {
    // a cut: run the brush camera from this cell to the end of the shot it lands in
    const old = dirDrag.before[dirDrag.start];
    let end = dirDrag.start;
    while (end + 1 < SLICES && dirDrag.before[end + 1] === old) end++;
    dirApplyRange(dirDrag.start, end);
  }
  dirDrag = null;
});

// ---------------------------------------------------------------- toast / share
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2600);
}
async function share() {
  const code = encodeShare(program, tank, ramp) + (sameDirector(director, defaultDirector()) ? '' : '!' + encodeDirector(director));
  try {
    history.replaceState(null, '', '#' + code);
  } catch {
    /* sandboxed frames may refuse */
  }
  const url = location.href.split('#')[0] + '#' + code;
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Anyone who opens it gets your exact flip.');
  } catch {
    toast(url);
  }
}
$('btn-share').addEventListener('click', share);
$('r-share').addEventListener('click', share);
$('btn-clear').addEventListener('click', () => {
  if (running) return;
  program.fill(0);
  paintGrid();
  markCustom();
  resetRun();
});

// ---------------------------------------------------------------- run control
function resetRun() {
  if (sim) sim.dispose();
  sim = new Sim(R, program, tank, ramp);
  idleFrame = sim.frame();
  running = false;
  finishedAt = -1;
  acc = 0;
  $('result').hidden = true;
  gridEl.classList.remove('locked');
  setPlayButton(false);
  applyFrame(idleFrame);
  setPlayhead(-1);
  liveRoll = 0;
  if (directorOn) {
    setCam('event'); // the hero shot while you edit
    setSlow(false);
  }
  // everything visual goes back to a clean state; only settings survive a reset
  plumes.clear();
  prevThrottle.fill(0);
  thrustNow = 0;
  plumeLight.intensity = 0;
}
function play() {
  audio.ensure();
  if (sim) sim.dispose();
  sim = new Sim(R, program, tank, ramp);
  running = true;
  finishedAt = -1;
  acc = 0;
  plumes.clear();
  $('result').hidden = true;
  gridEl.classList.add('locked');
  setPlayButton(true);
  landingCamX = -1;
  if (directorOn) applyDirector(0);
  if (recArmed) startRecording();
}
function setPlayButton(isRunning: boolean) {
  $('play-label').textContent = isRunning ? 'Reset' : 'Play';
  $('play-icon').setAttribute('d', isRunning ? 'M6 6h12v12H6z' : 'M7 4.5v15l12.5-7.5z');
}
$('btn-play').addEventListener('click', () => (running || finishedAt >= 0 ? resetRun() : play()));
$('r-replay').addEventListener('click', play);

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT') return;
  if (e.key === 'c' || e.key === 'C') cycleCam();
  if (e.key === 's' || e.key === 'S') toggleSlow();
  if (e.key === 'p' || e.key === 'P') running || finishedAt >= 0 ? resetRun() : play();
});

// ---------------------------------------------------------------- view tools
const camBtn = $('btn-cam');
const camNames: Record<CamMode, string> = {
  event: 'Event cam',
  side: 'Side track',
  runway: 'Runway cam',
  tele: 'Telephoto',
  landing: 'Landing cam',
  chase: 'Chase cam',
  free: 'Free cam',
};
function cycleCam() {
  directorOff();
  setCam(CAM_ORDER[(CAM_ORDER.indexOf(camMode) + 1) % CAM_ORDER.length]);
}
function setCam(m: CamMode) {
  camMode = m;
  landingCamX = -1;
  camBtn.textContent = camNames[camMode];
  controls.enabled = camMode === 'free';
  if (camMode === 'free') controls.target.copy(car.root.position);
  camLook.copy(car.root.position);
  camPos.set(car.root.position.x - 4, 2.5, -24);
  camera.fov = fovFor(camMode);
  camera.updateProjectionMatrix();
}
camBtn.addEventListener('click', cycleCam);
const slowBtn = $('btn-slow');
function toggleSlow() {
  directorOff();
  setSlow(timeScale === 1);
}
function setSlow(on: boolean) {
  timeScale = on ? 0.25 : 1;
  slowBtn.setAttribute('aria-pressed', String(on));
}
slowBtn.addEventListener('click', toggleSlow);
const soundBtn = $('btn-sound');
soundBtn.addEventListener('click', () => {
  audio.ensure();
  audio.setMuted(!audio.muted);
  soundBtn.setAttribute('aria-pressed', String(!audio.muted));
  soundBtn.textContent = audio.muted ? 'Sound off' : 'Sound on';
});

// ---------------------------------------------------------------- recording
let recArmed = false;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
const recBtn = $('btn-rec');
recBtn.addEventListener('click', () => {
  if (recorder) return;
  recArmed = !recArmed;
  recBtn.setAttribute('aria-pressed', String(recArmed));
  recBtn.textContent = recArmed ? '● Armed: press Play' : '● Record run';
  if (recArmed && typeof MediaRecorder === 'undefined') {
    toast('This browser cannot record the canvas. Try Chrome or Firefox.');
    recArmed = false;
    recBtn.setAttribute('aria-pressed', 'false');
  }
});
function startRecording() {
  try {
    audio.ensure();
    const stream = canvas.captureStream(60);
    audio.dest?.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const v = $<HTMLVideoElement>('clip-video');
      v.src = url;
      const a = $<HTMLAnchorElement>('clip-download');
      a.href = url;
      a.download = blob.type.includes('mp4') ? 'thruster-flip.mp4' : 'thruster-flip.webm';
      $<HTMLDialogElement>('clip-dialog').showModal();
      recorder = null;
    };
    recorder.start();
    recBtn.classList.add('live');
    recBtn.textContent = '● Recording';
  } catch {
    toast('Recording failed to start in this browser.');
    recorder = null;
  }
  recArmed = false;
  recBtn.setAttribute('aria-pressed', 'false');
}
function stopRecording() {
  if (recorder && recorder.state === 'recording') recorder.stop();
  recBtn.classList.remove('live');
  recBtn.textContent = '● Record run';
}
$('clip-close').addEventListener('click', () => $<HTMLDialogElement>('clip-dialog').close());

// ---------------------------------------------------------------- per-frame
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const carVel = new THREE.Vector3();
let lastFrame: Frame | null = null;
let liveRoll = 0;
let playheadCol = -1;

function setPlayhead(col: number) {
  if (col === playheadCol) return;
  if (playheadCol >= 0) for (const b of colCells[playheadCol]) b.classList.remove('ph', 'fire');
  playheadCol = col;
  if (col >= 0) for (const b of colCells[col]) b.classList.add('ph');
}

function applyFrame(f: Frame) {
  car.root.position.set(f.pos.x, f.pos.y, f.pos.z);
  car.root.quaternion.set(f.rot.x, f.rot.y, f.rot.z, f.rot.w);
  car.setWheels(
    f.wheels.map((w) => w.suspension),
    f.wheels.map((w) => w.rotation),
  );
  car.setThrottle(f.throttle);
  lastFrame = f;
}

const prevThrottle = new Array(THRUSTERS.length).fill(0);
let thrustNow = 0;
function emitPlumes(f: Frame, dt: number) {
  carVel.set(f.vel.x, f.vel.y, f.vel.z);
  let lift = 0;
  let total = 0;
  for (let i = 0; i < THRUSTERS.length; i++) {
    const thr = f.throttle[i];
    if (thr > 0 && prevThrottle[i] <= 0) audio.burst(THRUSTERS[i].group === 'lift' ? 1 : 0.7);
    prevThrottle[i] = thr;
    if (thr <= 0) continue;
    total += thr;
    if (THRUSTERS[i].group === 'lift') lift += thr;
    const t = THRUSTERS[i];
    tmpV.set(t.pos.x, t.pos.y, t.pos.z);
    car.root.localToWorld(tmpV);
    const d = rotate(f.rot, { x: -t.dir.x, y: -t.dir.y, z: -t.dir.z });
    tmpD.set(d.x, d.y, d.z);
    const n = Math.max(1, Math.round(1800 * dt * thr));
    plumes.emit(tmpV, tmpD, carVel, n, t.group === 'boost' ? 1.2 : 1);
    // jets pointing at the ground blast outward along the asphalt
    if (d.y < -0.35) {
      const dist = tmpV.y / -d.y;
      if (dist < 4.5) {
        tmpV.addScaledVector(tmpD, dist);
        plumes.emitGround(tmpV, Math.round(450 * dt * thr * (1 - dist / 4.5)), 1 - dist / 6);
      }
    }
  }
  thrustNow = total / THRUSTERS.length;
  plumeLight.intensity = lift * 22;
  plumeLight.position.set(f.pos.x, f.pos.y - 1.3, f.pos.z);
}
const plumeLight = new THREE.PointLight(0xdff6ff, 0, 15, 2);
scene.add(plumeLight);

const tmT = $('tm-t');
const tmAlt = $('tm-alt');
const tmSpd = $('tm-spd');
const tmRoll = $('tm-roll');
const tmPsi = $('tm-psi');
const tmGas = $('tm-gas');
function updateHud(f: Frame) {
  tmT.textContent = f.t.toFixed(2);
  tmAlt.textContent = Math.max(0, f.pos.y - REST_Y).toFixed(1);
  tmSpd.textContent = Math.round(Math.hypot(f.vel.x, f.vel.y, f.vel.z) * 3.6).toString();
  tmRoll.textContent = Math.round(Math.abs(liveRoll) * 360).toString();
  const cap = TANKS[tank].gas;
  const frac = TANKS[tank].infinite ? 1 : f.gas / cap;
  tmPsi.textContent = TANKS[tank].infinite ? '∞' : Math.round(10000 * frac).toLocaleString('en-GB');
  tmGas.style.width = `${frac * 100}%`;
  tmGas.classList.toggle('low', frac < 0.2);
}

function showResult(o: Outcome) {
  lastOutcome = o;
  const card = $('result');
  const good = o.status === 'landed';
  card.classList.toggle('bad', !good);
  $('r-status').textContent = good ? o.reason : `${o.reason}`;
  $('r-trick').textContent = good ? o.trick : o.status === 'rolled' ? `${o.trick}, bailed` : 'Crash';
  $('r-gas').textContent = `${o.gasUsed.toFixed(1)} kg`;
  $('r-air').textContent = `${o.airTime.toFixed(2)} s`;
  $('r-td').textContent = `${o.touchdownSpeed.toFixed(1)} m/s`;
  $('r-h').textContent = `${Math.max(0, o.maxHeight - REST_Y).toFixed(1)} m`;
  card.hidden = false;
}

const camPos = new THREE.Vector3(0, 2.5, -24);
let landingCamX = -1;
function updateCamera(dt: number) {
  const p = car.root.position;
  const shake = thrustNow * 0.08;
  const jitter = () => (Math.random() - 0.5) * shake;
  const ease = (k: number) => 1 - Math.exp(-dt * k);
  if (camMode === 'side') {
    camPos.lerp(tmpV.set(p.x - 3, 2.6, -24), ease(3));
    camera.position.copy(camPos);
    camLook.lerp(tmpV.set(p.x, Math.max(2, p.y), 0), ease(5));
    camera.lookAt(camLook.x + jitter(), camLook.y + jitter(), camLook.z);
  } else if (camMode === 'runway') {
    camera.position.set(-36 + jitter(), 1.3 + jitter(), 0);
    camLook.lerp(tmpV.set(p.x, Math.max(1.5, p.y), p.z), ease(6));
    camera.lookAt(camLook);
  } else if (camMode === 'tele') {
    camera.position.set(p.x * 0.85 + 2, 2, -95);
    camLook.lerp(tmpV.set(p.x, p.y, p.z), ease(9));
    camera.lookAt(camLook);
  } else if (camMode === 'landing') {
    // Low and close at the landing zone. Once the car gets within ~10 m the camera backs away
    // ahead of it (further when the car is high), so long jumps never fly past the lens.
    // The aim lags the car a little, which keeps it running in on the left of the frame.
    const wantX = Math.max(54, p.x + 10 + 0.9 * Math.max(0, p.y - 3));
    const wantY = 1.1 + 0.3 * Math.max(0, p.y - 3);
    if (landingCamX < 0 || camPos.distanceTo(car.root.position) > 400) landingCamX = wantX;
    landingCamX += (wantX - landingCamX) * ease(6);
    camera.position.set(landingCamX + jitter(), wantY + jitter(), -7);
    // The panel covers the bottom of the screen and the view is shifted up to compensate, so the
    // visible window sits below the aim point. Aim above the car by that amount to centre it.
    const v = camera.view;
    const panelFrac = v && v.enabled ? v.offsetY / v.fullHeight : 0;
    const dist = Math.hypot(p.x - landingCamX, 7);
    const lift = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * panelFrac;
    // horizontal lag keeps it running in on the left; portrait screens are too narrow for it
    camLook.x += (p.x - camLook.x) * ease(camera.aspect < 1 ? 16 : 4);
    camLook.y += (Math.max(1.4, p.y) + lift - camLook.y) * ease(9);
    camLook.z = p.z;
    camera.lookAt(camLook);
  } else if (camMode === 'event') {
    camera.position.set(9, 2.2, -42);
    const k = camera.aspect < 1 ? 0.95 : 0.6; // narrow screens track the car more tightly
    const tx = THREE.MathUtils.clamp(p.x * k + (1 - k) * 20, -24, 70);
    const ty = 5.2;
    camLook.lerp(tmpV.set(tx, ty, 0), 1 - Math.exp(-dt * 2.5));
    camera.lookAt(camLook);
  } else if (camMode === 'chase') {
    const want = tmpV.set(p.x - 11, Math.max(2.2, p.y + 2.6), p.z - 7.5);
    camera.position.lerp(want, 1 - Math.exp(-dt * 6));
    camera.lookAt(p.x + 3, p.y, p.z);
  } else {
    controls.target.lerp(p, 1 - Math.exp(-dt * 4));
    controls.update();
  }
}

let prev = performance.now();
let slowFrames = 0;
let sampled = 0;
function loop(now: number) {
  const raw = (now - prev) / 1000;
  const realDt = Math.min(0.05, raw);
  prev = now;
  // auto quality: if most frames over ~2 s run slower than ~40 fps, drop to low once
  if (quality === 'auto' && !lowActive && !document.hidden && raw < 0.5) {
    sampled++;
    if (raw > 0.025) slowFrames++;
    if (sampled === 120) {
      if (slowFrames > 70) {
        lowActive = true;
        applyQuality();
        toast('Switched to low quality to keep it smooth. Change it with the Quality button.');
      }
      sampled = slowFrames = 0;
    }
  }
  const dt = realDt * timeScale;

  if (running && sim) {
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 30) {
      acc -= DT;
      n++;
      if (!sim.tick()) {
        running = false;
        finishedAt = now;
        break;
      }
    }
    const f = sim.frame();
    liveRoll = sim.roll;
    applyFrame(f);
    emitPlumes(f, dt);
    const col = f.t < SLICES * SLICE ? Math.floor(f.t / SLICE) : -1;
    setPlayhead(col);
    if (directorOn) applyDirector(f.t);
    if (col >= 0) THRUSTERS.forEach((_, r) => cells[r][col].classList.toggle('fire', f.throttle[r] > 0));
    audio.set(f.throttle.reduce((a, b) => a + b, 0) / THRUSTERS.length, timeScale);
    updateHud(f);
  } else {
    audio.set(0, 1);
    thrustNow = 0;
    plumeLight.intensity = 0;
    if (lastFrame) updateHud(lastFrame);
  }
  if (finishedAt >= 0 && !running && sim?.outcome && $('result').hidden && now - finishedAt > 900 / timeScale) {
    showResult(sim.outcome);
    setPlayhead(-1);
    if (recorder) setTimeout(stopRecording, 1200);
  }

  plumes.update(dt);
  stage.update(car.root.position.x);
  carKey.target.position.copy(car.root.position);
  carKey.position.set(car.root.position.x - 6, car.root.position.y + 13, -30); // stays above the car, even on huge jumps
  updateCamera(realDt);
  composer.render();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- boot
async function boot() {
  await R.init();
  const [progPart, dirPart] = location.hash.slice(1).split('!');
  const fromHash = decodeShare(progPart);
  const sharedDir = dirPart ? decodeDirector(dirPart) : null;
  if (sharedDir) director = sharedDir;
  if (fromHash) {
    program = fromHash.program;
    setTank(fromHash.tank);
    setRamp(fromHash.ramp);
    markCustom();
    setHint('Loaded a shared flip. Press Play.');
  } else {
    sel.value = DEFAULT_PRESET;
    const p = PRESETS.find((x) => x.id === sel.value);
    if (p) setHint(p.blurb);
  }
  if (isEmpty(program)) setHint(HOW);
  $('how').textContent = HOW;
  paintGrid();
  paintDirector();
  setBrush('event');
  resetRun();
  $('loading').hidden = true;
  resize();
  document.fonts?.ready.then(resize);
  new ResizeObserver(resize).observe($('panel'));
  requestAnimationFrame(loop);
  // test hook for headless checks
  (window as unknown as Record<string, unknown>).__flip = {
    play,
    resetRun,
    setCam: (m: CamMode) => {
      directorOff(false);
      setCam(m);
    },
    useDirector: () => setDirectorOn(true),
    get outcome() {
      return lastOutcome ?? sim?.outcome ?? null;
    },
    get t() {
      return sim?.time ?? 0;
    },
    setSlow: (on: boolean) => {
      directorOff(false);
      setSlow(on);
    },
  };
}
boot();
