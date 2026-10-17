// Deterministic thruster-car simulation on top of Rapier (deterministic build).
// No DOM here, so the same code runs in the browser and in Node tests.
//
// Determinism rules for this file: fixed timestep, integer step counter,
// and no Math.sin/cos/etc. in anything that feeds the physics. Quaternion
// rotation is done by hand with multiply/add only.

import type RAPIER_NS from '@dimforge/rapier3d-deterministic-compat';
import { CAR, COURSE, DT, G0, MAX_TIME, SLICE, SLICES, TANK, TANKS, THRUSTERS, type TankMode, type Vec3 } from './config';
import { type Program } from './program';

type RAPIER = typeof RAPIER_NS;
type Quat = { x: number; y: number; z: number; w: number };

const STEPS_PER_SLICE = Math.round(SLICE / DT); // 12
const PROGRAM_STEPS = STEPS_PER_SLICE * SLICES;
const MAX_STEPS = Math.round(MAX_TIME / DT);
const LAND_MARGIN_COS = 0.9396926; // cos 20°: land within 20° of straight (or of backwards) or spin out
const LINEUP_END = Math.max(...COURSE.lineup.map((v) => v.x + v.w / 2)) + 2;
const LINEUP_START = Math.min(...COURSE.lineup.map((v) => v.x - v.w / 2));

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(q×v) + 2 q×(q×v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export interface Outcome {
  status: 'landed' | 'crashed' | 'rolled' | 'timeout';
  reason: string;
  trick: string;
  rollTurns: number; // signed turns about the car's long axis (net)
  peakTurns: number;
  landingHeading: number; // degrees between the nose and the lane at touchdown (folded, 0-90; backwards counts as 0)
  fakie: boolean; // landed and rolled away backwards
  rotationAtLift: number; // turns already rotated when the car was 2 m up; near 0 means it lifted before flipping // largest rotation reached on any axis at any moment; a roll there and back nets to zero but still shows here
  pitchTurns: number;
  yawTurns: number;
  gasUsed: number; // kg
  touchdownSpeed: number; // vertical m/s at first contact after the jump
  landingTilt: number; // worst lean from upright after touchdown, degrees (0 = clean)
  bounces: number; // times it left the ground again after touching down
  airTime: number;
  maxHeight: number;
  distance: number;
  hitLineup: boolean;
}

export interface Frame {
  t: number;
  pos: Vec3;
  rot: Quat;
  vel: Vec3;
  throttle: number[]; // per thruster 0..1 this step
  gas: number;
  wheels: { suspension: number; rotation: number; contact: boolean }[];
  airborne: boolean;
}

export class Sim {
  readonly R: RAPIER;
  world: RAPIER_NS.World;
  body: RAPIER_NS.RigidBody;
  chassis: RAPIER_NS.Collider;
  vehicle: RAPIER_NS.DynamicRayCastVehicleController;
  lineupHandles = new Set<number>();
  groundHandle = -1;

  program: Program;
  step = 0;
  gas: number;
  readonly capacity: number;
  readonly infinite: boolean;
  gasUsed = 0;
  throttle = new Array(THRUSTERS.length).fill(0);
  done = false;
  outcome: Outcome | null = null;

  // tracking
  roll = 0; // live, signed turns about the long axis
  private pitch = 0;
  private yaw = 0;
  private airborneSteps = 0;
  private everAirborne = false;
  private takeoffStep = -1;
  private takeoffX: number | null = null;
  private landStep = -1;
  private maxHeight = 0;
  private touchdownSpeed = 0;
  private prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  private restSteps = 0;
  private hitLineup = false;
  private roofHit = false;
  private peak = 0;
  private rotAtLift = -1;
  private minUpAfterLanding = 1;
  private bounces = 0;
  private wasGrounded = false;
  private wentAround = false;

  // Heading rule: locked to the lane while touching the ground, free in the air. On touchdown,
  // within LAND_MARGIN of straight (or of backwards) it eases back into lane; otherwise it spins out.
  private airPhase = false;
  private spunOut = false;
  private landHeadingCos = 1;
  private yawRate = 0; // rad/s about world up, driven only by uneven rear jets while airborne
  private boostYawTorque = 0; // this step's torque about world up from the rear jets

  constructor(R: RAPIER, program: Program, tank: TankMode = 'standard', ramp = false) {
    this.R = R;
    this.program = program;
    this.capacity = TANKS[tank].gas;
    this.infinite = TANKS[tank].infinite;
    this.gas = this.capacity;
    const world = new R.World({ x: 0, y: -G0, z: 0 });
    world.timestep = DT;
    this.world = world;

    // Ground
    const ground = world.createCollider(R.ColliderDesc.cuboid(400, 0.5, 400).setTranslation(0, -0.5, 0).setFriction(0.9));
    this.groundHandle = ground.handle;

    if (ramp) {
      const { startX: a, endX: b, height: h, halfWidth: w } = COURSE.ramp;
      const pts = new Float32Array([a, 0, -w, a, 0, w, b, 0, -w, b, 0, w, b, h, -w, b, h, w]);
      world.createCollider(R.ColliderDesc.convexHull(pts)!.setFriction(0.9));
    }

    // Parked lineup
    for (const v of COURSE.lineup) {
      const c = world.createCollider(
        R.ColliderDesc.cuboid(v.w / 2, v.h / 2, v.l / 2).setTranslation(v.x, v.h / 2, COURSE.lineupZ),
      );
      this.lineupHandles.add(c.handle);
    }

    // Car
    const he = CAR.halfExtents;
    const startY = CAR.chassisOffsetY + 0.05;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(COURSE.startX, startY, 0)
        .setLinvel(CAR.startSpeed, 0, 0)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setAngularDamping(0.05),
    );
    // Locked to the lane: the car never drifts sideways, so every jump lines up with the parked cars.
    this.body.setEnabledTranslations(true, true, false, true);
    const vol = 8 * he.x * he.y * he.z;
    this.chassis = world.createCollider(
      R.ColliderDesc.cuboid(he.x, he.y, he.z).setDensity(CAR.mass / vol).setFriction(0.6).setRestitution(0.05),
      this.body,
    );
    this.applyGasMass();

    const vc = world.createVehicleController(this.body);
    const wy = -he.y + 0.05;
    for (const [sx, sz] of [
      [1, -1],
      [1, 1],
      [-1, -1],
      [-1, 1],
    ]) {
      vc.addWheel(
        { x: sx * CAR.wheelX, y: wy, z: sz * CAR.wheelZ },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        CAR.suspensionRest,
        CAR.wheelRadius,
      );
    }
    for (let i = 0; i < 4; i++) {
      vc.setWheelSuspensionStiffness(i, CAR.suspensionStiffness);
      vc.setWheelSuspensionCompression(i, CAR.suspensionCompression);
      vc.setWheelSuspensionRelaxation(i, CAR.suspensionRelaxation);
      vc.setWheelMaxSuspensionForce(i, CAR.maxSuspensionForce);
      vc.setWheelFrictionSlip(i, CAR.frictionSlip);
      vc.setWheelMaxSuspensionTravel(i, CAR.suspensionTravel);
    }
    this.vehicle = vc;
    this.prevVel = { x: CAR.startSpeed, y: 0, z: 0 };
  }

  private applyGasMass() {
    const m = Math.max(this.gas, 0.0001);
    const r2 = 0.4 * m * 0.09; // solid sphere, r = 0.3 m
    this.body.setAdditionalMassProperties(m, TANK.pos, { x: r2, y: r2, z: r2 }, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  /**
   * Keep the nose pointing along the lane. The car may spin about its own long axis (kickflips)
   * and about the lane's side axis (flips), but any other spin is removed, and any heading the
   * solver lets creep in is rotated back out. Only multiply/add/sqrt, so it stays deterministic.
   */
  private lockHeading(blend = 1) {
    const b = this.body;
    let q = b.rotation();
    let f = rotate(q, { x: 1, y: 0, z: 0 });
    const h = Math.sqrt(f.x * f.x + f.y * f.y);
    if (f.z > 1e-7 || f.z < -1e-7) {
      // shortest rotation taking f to (f.x, f.y, 0)/h: axis = f × t, built from the half-way vector
      const tx = f.x / h, ty = f.y / h;
      let mx = f.x + tx, my = f.y + ty, mz = f.z;
      const ml = Math.sqrt(mx * mx + my * my + mz * mz);
      mx /= ml; my /= ml; mz /= ml;
      // c = from · mid, axis = from × mid
      const cw = f.x * mx + f.y * my + f.z * mz;
      const cx = f.y * mz - f.z * my;
      const cy = f.z * mx - f.x * mz;
      const cz = f.x * my - f.y * mx;
      // partial correction: nlerp between no rotation and the full correction
      let pw = 1 - blend + blend * cw, px = blend * cx, py = blend * cy, pz = blend * cz;
      const pl = Math.sqrt(pw * pw + px * px + py * py + pz * pz);
      const cw2 = pw / pl, cx2 = px / pl, cy2 = py / pl, cz2 = pz / pl;
      // corrected = c * q
      const nq = {
        w: cw2 * q.w - cx2 * q.x - cy2 * q.y - cz2 * q.z,
        x: cw2 * q.x + cx2 * q.w + cy2 * q.z - cz2 * q.y,
        y: cw2 * q.y - cx2 * q.z + cy2 * q.w + cz2 * q.x,
        z: cw2 * q.z + cx2 * q.y - cy2 * q.x + cz2 * q.w,
      };
      const n = Math.sqrt(nq.w * nq.w + nq.x * nq.x + nq.y * nq.y + nq.z * nq.z);
      q = { x: nq.x / n, y: nq.y / n, z: nq.z / n, w: nq.w / n };
      b.setRotation(q, true);
      f = rotate(q, { x: 1, y: 0, z: 0 });
    }
    // keep only spin about the car's long axis and about the lane's side axis (world z)
    const fl = Math.sqrt(f.x * f.x + f.y * f.y) || 1;
    const fx = f.x / fl, fy = f.y / fl;
    const w = b.angvel();
    const along = w.x * fx + w.y * fy;
    b.setAngvel({ x: along * fx, y: along * fy, z: w.z }, true);
  }

  /**
   * In the air, split the spin into roll (about the nose), flip (about the side axis laid flat)
   * and yaw (about world up). Roll and flip are left to the physics; yaw is replaced by a rate that
   * only the rear jets can change, so rolling and flipping can't twist the nose by themselves.
   */
  private airSpin() {
    const b = this.body;
    const q = b.rotation();
    const f = rotate(q, { x: 1, y: 0, z: 0 });
    const u = rotate(q, { x: 0, y: 1, z: 0 });
    const r = rotate(q, { x: 0, y: 0, z: 1 });
    // moment of inertia about world up, from the body's principal moments
    const I = b.principalInertia();
    const Iyy = I.x * f.y * f.y + I.y * u.y * u.y + I.z * r.y * r.y;
    if (Iyy > 1e-6) this.yawRate += (this.boostYawTorque / Iyy) * DT;
    // Split the spin along three axes tied to the car: the nose (roll), the side axis laid flat
    // (flip), and m = nose x side, which swings the nose left/right. Roll and flip stay as the
    // physics made them; the swing is set from the rear-jet yaw rate. Well-conditioned at any
    // attitude (a world-up yaw becomes pure roll when the nose points straight up, hence * fh).
    const fh = Math.sqrt(f.x * f.x + f.z * f.z);
    let nx: number, ny: number, nz: number;
    if (fh > 1e-4) {
      nx = -f.z / fh; ny = 0; nz = f.x / fh;
      // keep the side axis on the car's right so it doesn't flip over when the nose passes vertical
      if (nx * r.x + nz * r.z < 0) { nx = -nx; nz = -nz; }
    } else {
      nx = r.x; ny = r.y; nz = r.z; // nose vertical: use the car's own side axis
    }
    const mx = f.y * nz - f.z * ny, my = f.z * nx - f.x * nz, mz = f.x * ny - f.y * nx;
    const w = b.angvel();
    const roll = w.x * f.x + w.y * f.y + w.z * f.z;
    const flip = w.x * nx + w.y * ny + w.z * nz;
    const swing = this.yawRate * my; // the world-up yaw rate, seen along the car's swing axis
    b.setAngvel(
      {
        x: roll * f.x + flip * nx + swing * mx,
        y: roll * f.y + flip * ny + swing * my,
        z: roll * f.z + flip * nz + swing * mz,
      },
      true,
    );
  }

  private applyHeadingRule() {
    if (this.spunOut) return; // landed sideways: physics only from here on
    const touching = this.airborneSteps === 0;
    if (!touching) {
      // just leaving the ground: keep the lock for a few steps so the tyres can't twist it on the way up
      if (this.airborneSteps > 3) {
        if (!this.airPhase) this.yawRate = 0;
        this.airPhase = true;
        this.airSpin();
      } else this.lockHeading();
      return;
    }
    if (this.airPhase) {
      // touchdown after a flight: how far off the lane is the nose? (compared via cos, no trig)
      this.airPhase = false;
      const f = rotate(this.body.rotation(), { x: 1, y: 0, z: 0 });
      const n = Math.sqrt(f.x * f.x + f.z * f.z);
      const c = n > 1e-6 ? Math.abs(f.x) / n : 0;
      this.landHeadingCos = c;
      if (c < LAND_MARGIN_COS) {
        this.spunOut = true;
        return;
      }
    }
    this.lockHeading(0.25); // ease back into the lane over a few steps
  }

  get time() {
    return this.step * DT;
  }

  wheelsInContact(): number {
    let n = 0;
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) n++;
    return n;
  }

  private chassisTouching(handles: (h: number) => boolean): boolean {
    let touching = false;
    this.world.contactPairsWith(this.chassis, (other) => {
      if (touching || !handles(other.handle)) return;
      this.world.contactPair(this.chassis, other, (manifold) => {
        if (manifold.numContacts() > 0) touching = true;
      });
    });
    return touching;
  }

  /** Advance one fixed step. Returns false once the run is over. */
  tick(): boolean {
    if (this.done) return false;
    const body = this.body;
    const q = body.rotation();
    const p = body.translation();

    // --- thrusters ---
    body.resetForces(true);
    body.resetTorques(true); // addForceAtPoint also accumulates torque
    const col = this.step < PROGRAM_STEPS ? Math.floor(this.step / STEPS_PER_SLICE) : -1;
    let demand = 0;
    for (let i = 0; i < THRUSTERS.length; i++) {
      const on = col >= 0 && this.program[i * SLICES + col] === 1;
      this.throttle[i] = on ? 1 : 0;
      if (on) demand += THRUSTERS[i].force;
    }
    const flowPerN = 1 / (TANK.isp * G0); // kg/s per N
    const want = demand * flowPerN * DT;
    let scale = 1;
    if (want > 0) {
      if (this.gas <= 0) scale = 0;
      else if (want > this.gas) scale = this.gas / want;
    }
    this.boostYawTorque = 0;
    if (demand > 0 && scale > 0) {
      const com = body.worldCom();
      for (let i = 0; i < THRUSTERS.length; i++) {
        if (!this.throttle[i]) continue;
        const t = THRUSTERS[i];
        this.throttle[i] = scale;
        const d = rotate(q, t.dir);
        const lp = rotate(q, t.pos);
        const f = t.force * scale;
        body.addForceAtPoint({ x: d.x * f, y: d.y * f, z: d.z * f }, { x: p.x + lp.x, y: p.y + lp.y, z: p.z + lp.z }, true);
        if (t.group === 'boost') {
          // torque about world up: (r × F).y with r from the centre of mass
          const rx = p.x + lp.x - com.x, rz = p.z + lp.z - com.z;
          this.boostYawTorque += rz * d.x * f - rx * d.z * f;
        }
      }
      this.gasUsed += want * scale;
      if (!this.infinite) {
        this.gas -= want * scale;
        if (this.gas < 0) this.gas = 0;
        this.applyGasMass();
      }
    } else if (demand > 0) {
      for (let i = 0; i < THRUSTERS.length; i++) this.throttle[i] = 0;
    }

    // --- brakes once the programme is over and we're on the ground ---
    const grounded = this.wheelsInContact();
    const brake = this.step >= PROGRAM_STEPS && this.everAirborne && grounded >= 2 ? 60 : 0;
    for (let i = 0; i < 4; i++) this.vehicle.setWheelBrake(i, brake);

    this.vehicle.updateVehicle(DT);
    this.world.step();
    this.step++;
    this.applyHeadingRule();

    // --- tracking ---
    const v = body.linvel();
    const w = body.angvel();
    const q2 = body.rotation();
    const fwd = rotate(q2, { x: 1, y: 0, z: 0 });
    const up = rotate(q2, { x: 0, y: 1, z: 0 });
    const TAU = 6.283185307179586;
    // Kickflip = spin about the car's own long axis; flip = spin about the lane's side axis (world z).
    this.roll += ((w.x * fwd.x + w.y * fwd.y + w.z * fwd.z) * DT) / TAU;
    // flips are about the car's side axis laid flat on the ground; spins are about world up
    const fn = Math.sqrt(fwd.x * fwd.x + fwd.z * fwd.z);
    const rgt = rotate(q2, { x: 0, y: 0, z: 1 });
    let sx = fn > 1e-3 ? -fwd.z / fn : rgt.x;
    let sz = fn > 1e-3 ? fwd.x / fn : rgt.z;
    if (sx * rgt.x + sz * rgt.z < 0) { sx = -sx; sz = -sz; }
    this.pitch += ((w.x * sx + w.z * sz) * DT) / TAU;
    if (this.airPhase) this.yaw += (this.yawRate * DT) / TAU; // only spin done in the air counts towards the trick

    const ar = Math.max(Math.abs(this.roll), Math.abs(this.pitch), Math.abs(this.yaw));
    if (ar > this.peak) this.peak = ar;
    const pos = body.translation();
    if (pos.y > this.maxHeight) this.maxHeight = pos.y;
    // how much it had already rotated by the time it was 2 m up (lift first, then flip, keeps this near 0)
    if (this.rotAtLift < 0 && pos.y > 3.0) this.rotAtLift = Math.max(Math.abs(this.roll), Math.abs(this.pitch));
    // passing the lineup at ground level without hitting it means it steered round the cars
    if (pos.x > LINEUP_START && pos.x < LINEUP_END - 2 && pos.y < 2.2) this.wentAround = true;

    const nContact = this.wheelsInContact();
    const chassisOnGround = this.chassisTouching((h) => h === this.groundHandle);
    if (this.chassisTouching((h) => this.lineupHandles.has(h))) this.hitLineup = true;
    for (let i = 0; i < 4; i++) {
      const g = this.vehicle.wheelGroundObject(i);
      if (g && this.lineupHandles.has(g.handle)) this.hitLineup = true;
    }

    const anyContact = nContact > 0 || chassisOnGround || this.chassisTouching(() => true);
    if (!anyContact) {
      this.airborneSteps++;
      // the take-off that counts is the last one before the lineup (little hops on the run-up don't)
      if (this.airborneSteps > 12 && (!this.everAirborne || (this.landStep < 0 && pos.x < LINEUP_START && this.takeoffX !== null && pos.x - this.takeoffX > 3 && this.airborneSteps === 13))) {
        this.everAirborne = true;
        this.takeoffStep = this.step - this.airborneSteps;
        this.takeoffX = pos.x;
      }
    } else {
      // the landing that counts is the first touchdown past the lineup
      if (this.everAirborne && this.landStep < 0 && pos.x > LINEUP_END - 2) {
        this.landStep = this.step;
        this.touchdownSpeed = Math.max(0, -this.prevVel.y);
      }
      this.airborneSteps = 0;
    }

    this.prevVel = { x: v.x, y: v.y, z: v.z };

    if (this.everAirborne && chassisOnGround && up.y < 0.35) this.roofHit = true;
    if (this.landStep >= 0) {
      if (up.y < this.minUpAfterLanding) this.minUpAfterLanding = up.y;
      const grounded = nContact > 0 || chassisOnGround;
      if (this.wasGrounded && !grounded && this.airborneSteps > 6) this.bounces++;
      if (grounded) this.wasGrounded = true;
      else if (this.airborneSteps > 6) this.wasGrounded = false;
    }

    // --- end conditions ---
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const spin = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    if (this.step > PROGRAM_STEPS && speed < 0.6 && spin < 0.4) this.restSteps++;
    else this.restSteps = 0;

    if (this.restSteps > 45 || this.step >= MAX_STEPS || pos.y < -5) this.finish(up.y, pos.x);
    return !this.done;
  }

  private finish(upY: number, x: number) {
    this.done = true;
    const rollTurns = this.roll;
    const pitchTurns = this.pitch;
    const yawTurns = this.yaw;
    const fakie = this.landStep >= 0 && !this.spunOut && rotate(this.body.rotation(), { x: 1, y: 0, z: 0 }).x < 0;
    let trick = nameTrick(rollTurns, pitchTurns, yawTurns);
    let status: Outcome['status'];
    let reason: string;
    if (this.hitLineup) {
      status = 'crashed';
      reason = 'Clipped the lineup';
    } else if (!this.everAirborne) {
      status = 'crashed';
      reason = 'Never left the ground';
    } else if (this.wentAround) {
      status = 'crashed';
      reason = 'Went round the lineup instead of over it';
    } else if (x < LINEUP_END) {
      status = 'crashed';
      reason = 'Came down short of the lineup';
    } else if (this.spunOut) {
      status = upY < 0.7 || this.roofHit ? 'rolled' : 'crashed';
      reason = 'Landed sideways and spun out';
    } else if (upY < 0.7 || this.roofHit) {
      status = 'rolled';
      reason = upY < 0.7 ? 'Ended up on its roof' : 'Touched down on the roof';
    } else if (this.step >= MAX_STEPS) {
      status = 'timeout';
      reason = 'Still moving at the time limit';
    } else {
      status = 'landed';
      const tilt = (Math.acos(Math.max(-1, Math.min(1, this.minUpAfterLanding))) * 180) / Math.PI;
      reason =
        tilt < 15 && this.touchdownSpeed < 4 && this.bounces === 0
          ? 'Clean landing'
          : tilt > 50 || this.bounces > 0
            ? 'Scrappy landing, but it stayed upright'
            : 'Stuck the landing';
    }
    if (status === 'landed' && fakie) trick += ' to fakie';
    this.outcome = {
      status,
      reason,
      trick,
      rollTurns,
      peakTurns: this.peak,
      landingHeading: (Math.acos(Math.max(-1, Math.min(1, this.landHeadingCos))) * 180) / Math.PI,
      fakie,
      rotationAtLift: Math.max(0, this.rotAtLift),
      pitchTurns,
      yawTurns,
      gasUsed: this.gasUsed,
      touchdownSpeed: this.touchdownSpeed,
      landingTilt: (Math.acos(Math.max(-1, Math.min(1, this.minUpAfterLanding))) * 180) / Math.PI,
      bounces: this.bounces,
      airTime: this.takeoffStep >= 0 && this.landStep >= 0 ? (this.landStep - this.takeoffStep) * DT : 0,
      maxHeight: this.maxHeight,
      distance: this.takeoffX === null ? 0 : x - this.takeoffX,
      hitLineup: this.hitLineup,
    };
  }

  frame(): Frame {
    const b = this.body;
    const wheels = [];
    for (let i = 0; i < 4; i++) {
      wheels.push({
        suspension: this.vehicle.wheelSuspensionLength(i) ?? CAR.suspensionRest,
        rotation: this.vehicle.wheelRotation(i) ?? 0,
        contact: this.vehicle.wheelIsInContact(i),
      });
    }
    const t = b.translation();
    const r = b.rotation();
    const v = b.linvel();
    return {
      t: this.time,
      pos: { x: t.x, y: t.y, z: t.z },
      rot: { x: r.x, y: r.y, z: r.z, w: r.w },
      vel: { x: v.x, y: v.y, z: v.z },
      throttle: this.throttle.slice(),
      gas: this.gas,
      wheels,
      airborne: this.airborneSteps > 3,
    };
  }

  dispose() {
    this.world.free();
  }
}

export function nameTrick(roll: number, pitch: number, yaw: number): string {
  const parts: string[] = [];
  const r = Math.round(Math.abs(roll));
  const p = Math.round(Math.abs(pitch));
  const y = Math.round(Math.abs(yaw) * 2) / 2;
  const mult = (n: number) => (n === 2 ? 'Double ' : n === 3 ? 'Triple ' : n > 3 ? `${n}x ` : '');
  if (y >= 0.5) parts.push(`${y * 360}`);
  if (r >= 1) parts.push(`${mult(r)}Kickflip`);
  if (p >= 1) parts.push(`${mult(p)}${pitch > 0 ? 'Backflip' : 'Frontflip'}`);
  if (!parts.length) return Math.abs(roll) > 0.35 || Math.abs(pitch) > 0.35 ? 'Half rotation' : 'Straight jump';
  return parts.join(' ');
}

/** Run a whole program headlessly and return the outcome. */
export function runProgram(
  R: RAPIER,
  program: Program,
  onFrame?: (f: Frame) => void,
  tank: TankMode = 'standard',
  ramp = false,
): Outcome {
  const sim = new Sim(R, program, tank, ramp);
  while (sim.tick()) if (onFrame) onFrame(sim.frame());
  const o = sim.outcome!;
  sim.dispose();
  return o;
}
