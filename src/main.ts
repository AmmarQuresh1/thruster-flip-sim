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

buildStage(scene);
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
  const maxPixels = isLow() ? 1.2e6 : 3.2e6;
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
  bloom.setSize(Math.round((w * dpr) / 2), Math.round((h * dpr) / 2));
  camera.aspect = w / h;
  // keep the whole jump in shot on tall phone screens
  camera.fov = camera.aspect < 1 ? 62 : camera.aspect < 1.4 ? 48 : 40;
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
let idleFrame: Frame;
let running = false;
let acc = 0;
let timeScale = 1;
let finishedAt = -1;
let lastOutcome: Outcome | null = null;
type CamMode = 'event' | 'chase' | 'free';
let camMode: CamMode = 'event';
const camLook = new THREE.Vector3(-10, 5.2, 0);

const audio = new ThrusterAudio();

// ---------------------------------------------------------------- grid UI
const gridEl = $('grid');
const cells: HTMLButtonElement[][] = [];
const colCells: HTMLButtonElement[][] = Array.from({ length: SLICES }, () => []);
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
function showBox() {
  clearBoxPreview();
  if (!boxAnchor || !boxEnd) return;
  const [r0, r1] = [Math.min(boxAnchor[0], boxEnd[0]), Math.max(boxAnchor[0], boxEnd[0])];
  const [c0, c1] = [Math.min(boxAnchor[1], boxEnd[1]), Math.max(boxAnchor[1], boxEnd[1])];
  const cls = paintValue ? 'sel-fill' : 'sel-erase';
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      cells[r][c].classList.add(cls);
      boxCells.push(cells[r][c]);
    }
}
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
    painting = true; // freehand
    applyPaint(rc);
    markCustom();
  } else if (precise) {
    boxAnchor = boxEnd = rc; // box select, committed on release
    showBox();
  } else {
    applyPaint(rc); // touch: tap toggles one cell, drag scrolls the grid
    markCustom();
  }
});
window.addEventListener('pointermove', (e) => {
  if (!painting && !boxAnchor) return;
  const rc = cellFrom(document.elementFromPoint(e.clientX, e.clientY));
  if (!rc) return;
  if (painting) applyPaint(rc);
  else if (rc[0] !== boxEnd?.[0] || rc[1] !== boxEnd?.[1]) {
    boxEnd = rc;
    showBox();
  }
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
  const code = encodeShare(program, tank);
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
  sim = new Sim(R, program, tank);
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
}
function play() {
  audio.ensure();
  if (sim) sim.dispose();
  sim = new Sim(R, program, tank);
  running = true;
  finishedAt = -1;
  acc = 0;
  plumes.clear();
  $('result').hidden = true;
  gridEl.classList.add('locked');
  setPlayButton(true);
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
const camNames: Record<CamMode, string> = { event: 'Event cam', chase: 'Chase cam', free: 'Free cam' };
function cycleCam() {
  camMode = camMode === 'event' ? 'chase' : camMode === 'chase' ? 'free' : 'event';
  camBtn.textContent = camNames[camMode];
  controls.enabled = camMode === 'free';
  if (camMode === 'free') controls.target.copy(car.root.position);
}
camBtn.addEventListener('click', cycleCam);
const slowBtn = $('btn-slow');
function toggleSlow() {
  timeScale = timeScale === 1 ? 0.25 : 1;
  slowBtn.setAttribute('aria-pressed', String(timeScale < 1));
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

function emitPlumes(f: Frame, dt: number) {
  carVel.set(f.vel.x, f.vel.y, f.vel.z);
  for (let i = 0; i < THRUSTERS.length; i++) {
    const thr = f.throttle[i];
    if (thr <= 0) continue;
    const t = THRUSTERS[i];
    tmpV.set(t.pos.x, t.pos.y, t.pos.z);
    car.root.localToWorld(tmpV);
    const d = rotate(f.rot, { x: -t.dir.x, y: -t.dir.y, z: -t.dir.z });
    tmpD.set(d.x, d.y, d.z);
    const n = Math.max(1, Math.round(1800 * dt * thr));
    plumes.emit(tmpV, tmpD, carVel, n, t.group === 'boost' ? 1.2 : 1);
  }
}

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

function updateCamera(dt: number) {
  const p = car.root.position;
  if (camMode === 'event') {
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
    if (col >= 0) THRUSTERS.forEach((_, r) => cells[r][col].classList.toggle('fire', f.throttle[r] > 0));
    audio.set(f.throttle.reduce((a, b) => a + b, 0) / THRUSTERS.length, timeScale);
    updateHud(f);
  } else {
    audio.set(0, 1);
    if (lastFrame) updateHud(lastFrame);
  }
  if (finishedAt >= 0 && !running && sim?.outcome && $('result').hidden && now - finishedAt > 900 / timeScale) {
    showResult(sim.outcome);
    setPlayhead(-1);
    if (recorder) setTimeout(stopRecording, 1200);
  }

  plumes.update(dt);
  carKey.target.position.copy(car.root.position);
  carKey.position.set(car.root.position.x - 6, 14, -30);
  updateCamera(realDt);
  composer.render();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- boot
async function boot() {
  await R.init();
  const fromHash = decodeShare(location.hash.slice(1));
  if (fromHash) {
    program = fromHash.program;
    setTank(fromHash.tank);
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
      while (camMode !== m) cycleCam();
    },
    get outcome() {
      return lastOutcome ?? sim?.outcome ?? null;
    },
    get t() {
      return sim?.time ?? 0;
    },
    setSlow: (on: boolean) => {
      if ((timeScale < 1) !== on) toggleSlow();
    },
  };
}
boot();
