// All physical constants for the sim live here. Units are SI (m, kg, s, N).
// Car local frame: +x forward, +y up, +z = car's right side.

export type Vec3 = { x: number; y: number; z: number };

export interface ThrusterDef {
  id: string;
  label: string;
  group: 'boost' | 'lift' | 'side';
  pos: Vec3; // nozzle position, car local frame
  dir: Vec3; // direction the FORCE acts on the car (plume goes the opposite way)
  force: number; // N at full open
}

export const DT = 1 / 120; // fixed physics step
export const SLICE = 0.1; // seconds per program cell
export const SLICES = 40; // 4 s of programmable timeline
export const MAX_TIME = 8; // hard stop for a run
export const G0 = 9.81;

export const CAR = {
  mass: 1650, // dry mass, kg (chassis collider)
  halfExtents: { x: 2.25, y: 0.42, z: 0.98 },
  chassisOffsetY: 0.62, // collider centre above ground at rest-ish
  wheelRadius: 0.36,
  wheelX: 1.45,
  wheelZ: 0.86,
  suspensionRest: 0.32,
  suspensionStiffness: 38,
  suspensionCompression: 4.4,
  suspensionRelaxation: 3.2,
  maxSuspensionForce: 1.2e5,
  frictionSlip: 2.2,
  startSpeed: 25, // m/s at the start of the run-up
};

// Compressed-air tank, sitting just behind the seats.
export const TANK = {
  pos: { x: -0.55, y: 0.05, z: 0 } as Vec3,
  gasMass: 110, // kg of air at full fill (standard tank)
  isp: 65, // s, roughly what a cold-gas air thruster manages at sea level
};

export type TankMode = 'standard' | 'big' | 'unlimited';
// 'big' uses the 260 kg figure reported after the event, read as the mass of air carried.
// 'unlimited' never runs dry and keeps the standard tank's mass, so it handles like the default car.
export const TANKS: Record<TankMode, { label: string; gas: number; infinite: boolean }> = {
  standard: { label: 'Standard (110 kg air)', gas: 110, infinite: false },
  big: { label: 'Big tank (260 kg air)', gas: 260, infinite: false },
  unlimited: { label: 'Unlimited', gas: 110, infinite: true },
};

const LIFT = 14000; // enough for all four to throw the car clear of the lineup from flat ground
const BOOST = 6000;
const SIDE = 8000;

export const THRUSTERS: ThrusterDef[] = [
  { id: 'B1', label: 'Rear 1', group: 'boost', pos: { x: -2.25, y: 0.0, z: -0.6 }, dir: { x: 1, y: 0, z: 0 }, force: BOOST },
  { id: 'B2', label: 'Rear 2', group: 'boost', pos: { x: -2.25, y: 0.0, z: -0.2 }, dir: { x: 1, y: 0, z: 0 }, force: BOOST },
  { id: 'B3', label: 'Rear 3', group: 'boost', pos: { x: -2.25, y: 0.0, z: 0.2 }, dir: { x: 1, y: 0, z: 0 }, force: BOOST },
  { id: 'B4', label: 'Rear 4', group: 'boost', pos: { x: -2.25, y: 0.0, z: 0.6 }, dir: { x: 1, y: 0, z: 0 }, force: BOOST },
  { id: 'FL', label: 'Lift front-L', group: 'lift', pos: { x: 1.6, y: -0.42, z: -0.85 }, dir: { x: 0, y: 1, z: 0 }, force: LIFT },
  { id: 'FR', label: 'Lift front-R', group: 'lift', pos: { x: 1.6, y: -0.42, z: 0.85 }, dir: { x: 0, y: 1, z: 0 }, force: LIFT },
  { id: 'RL', label: 'Lift rear-L', group: 'lift', pos: { x: -1.6, y: -0.42, z: -0.85 }, dir: { x: 0, y: 1, z: 0 }, force: LIFT },
  { id: 'RR', label: 'Lift rear-R', group: 'lift', pos: { x: -1.6, y: -0.42, z: 0.85 }, dir: { x: 0, y: 1, z: 0 }, force: LIFT },
  // Roof-edge jets. The car can't move sideways (see CAR.lockZ), so these only add roll.
  { id: 'SL', label: 'Roll L', group: 'side', pos: { x: 0.0, y: 0.42, z: -0.98 }, dir: { x: 0, y: 0, z: 1 }, force: SIDE },
  { id: 'SR', label: 'Roll R', group: 'side', pos: { x: 0.0, y: 0.42, z: 0.98 }, dir: { x: 0, y: 0, z: -1 }, force: SIDE },
];

// Course layout along world +x. Ground is y = 0.
export const COURSE = {
  startX: -30,
  laneEndX: -8, // the approach lane (barriers, centreline) stops here; there is no ramp, the lift thrusters do the jump
  // Parked lineup the car jumps over. x = centre, w = width along travel, h = height, l = length (z)
  lineup: [
    { x: 5.0, w: 2.0, h: 1.45, l: 4.8, kind: 'sedan' },
    { x: 8.4, w: 2.0, h: 1.6, l: 4.8, kind: 'sedan' },
    { x: 13.2, w: 2.6, h: 4.0, l: 6.2, kind: 'truck' },
    { x: 18.0, w: 2.1, h: 1.9, l: 5.6, kind: 'pickup' },
    { x: 21.4, w: 2.0, h: 1.6, l: 4.7, kind: 'suv' },
  ],
  lineupZ: 0,
};
