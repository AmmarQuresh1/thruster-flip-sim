// Cold-gas plumes: a jet of fast, tight particles out of each firing nozzle,
// which slow down, swell and linger as a drifting white cloud.
import * as THREE from 'three';

const MAX = 16000;

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / -mv.z;
    vAlpha = aAlpha;
  }
`;
const frag = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = dot(p, p);
    if (d > 1.0) discard;
    float a = exp(-d * 3.2) * vAlpha;
    gl_FragColor = vec4(uColor, a);
  }
`;

export class Plumes {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private age = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private peak = new Float32Array(MAX);
  private head = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uScale: { value: 600 }, uColor: { value: new THREE.Color(1.5, 1.6, 1.75) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setViewportHeight(h: number) {
    this.mat.uniforms.uScale.value = h * 0.9;
  }

  /** Emit along a jet. origin/dir in world space; carVel adds the car's motion. */
  emit(origin: THREE.Vector3, dir: THREE.Vector3, carVel: THREE.Vector3, count: number, strength: number) {
    for (let n = 0; n < count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX;
      const j = Math.random();
      const spread = 0.12;
      const sp = (24 + Math.random() * 18) * strength;
      const rx = (Math.random() - 0.5) * spread;
      const ry = (Math.random() - 0.5) * spread;
      const rz = (Math.random() - 0.5) * spread;
      this.pos[i * 3] = origin.x + dir.x * j * 0.3;
      this.pos[i * 3 + 1] = origin.y + dir.y * j * 0.3;
      this.pos[i * 3 + 2] = origin.z + dir.z * j * 0.3;
      this.vel[i * 3] = (dir.x + rx) * sp + carVel.x * 0.6;
      this.vel[i * 3 + 1] = (dir.y + ry) * sp + carVel.y * 0.6;
      this.vel[i * 3 + 2] = (dir.z + rz) * sp + carVel.z * 0.6;
      this.age[i] = 0;
      this.life[i] = 2.2 + Math.random() * 3.5;
      this.size[i] = 0.5;
      this.grow[i] = 2.2 + Math.random() * 2.2;
      this.peak[i] = 0.035 + Math.random() * 0.035;
      this.alpha[i] = this.peak[i];
    }
  }

  update(dt: number) {
    const drag = Math.exp(-dt * 3.2);
    for (let i = 0; i < MAX; i++) {
      if (this.alpha[i] <= 0 && this.age[i] >= this.life[i]) continue;
      const a = (this.age[i] += dt);
      const L = this.life[i];
      if (a >= L) {
        this.alpha[i] = 0;
        continue;
      }
      const k = i * 3;
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + 0.25 * dt; // slight buoyancy as it mixes
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.05) {
        // spread along the ground instead of passing through it
        this.pos[k + 1] = 0.05;
        const vy = this.vel[k + 1];
        this.vel[k + 1] = Math.abs(vy) * 0.1;
        this.vel[k] += (Math.random() - 0.5) * Math.abs(vy) * 0.8;
        this.vel[k + 2] += (Math.random() - 0.5) * Math.abs(vy) * 0.8;
      }
      this.size[i] = Math.min(this.size[i] + this.grow[i] * dt * (1.2 - a / L), 5.5);
      const fadeIn = Math.min(1, a * 12);
      const fadeOut = 1 - a / L;
      this.alpha[i] = this.peak[i] * fadeIn * fadeOut * fadeOut;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.alpha.fill(0);
    this.age.fill(1e9);
    this.life.fill(0);
  }
}
