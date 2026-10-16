// Synthesised cold-gas roar: filtered white noise whose level follows total thrust.
// No audio files to ship. Also exposes a MediaStream so recorded clips carry sound.

export class ThrusterAudio {
  ctx: AudioContext | null = null;
  private hiss!: GainNode;
  private roar!: GainNode;
  private master!: GainNode;
  dest: MediaStreamAudioDestinationNode | null = null;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.7;

    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();

    src.connect(hp).connect(this.hiss).connect(this.master);
    src.connect(bp).connect(this.roar).connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination();
    comp.connect(this.dest);
    src.start();
  }

  /** level: total thrust 0..1 (fraction of all thrusters at full). */
  set(level: number, timeScale: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const l = this.muted ? 0 : Math.min(1, level * 2.2);
    const slow = timeScale < 1 ? 0.6 : 1;
    this.hiss.gain.setTargetAtTime(l * 0.35 * slow, t, 0.03);
    this.roar.gain.setTargetAtTime(l * 1.1, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.set(0, 1);
  }
}
