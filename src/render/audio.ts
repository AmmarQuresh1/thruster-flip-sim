// Synthesised cold-gas sound, no audio files:
//  - a high-pressure hiss (white noise through a 2.8 kHz band-pass),
//  - a tearing roar (noise through a low-pass that opens up with thrust) plus a little 80 Hz weight,
//  - short crisp bursts whenever a thruster opens (the "chuff" of attitude jets).
// Also exposes a MediaStream so recorded clips carry sound.

export class ThrusterAudio {
  ctx: AudioContext | null = null;
  private hiss!: GainNode;
  private roar!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private sub!: GainNode;
  private master!: GainNode;
  private noise!: AudioBuffer;
  dest: MediaStreamAudioDestinationNode | null = null;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    unmuteOnIOS();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.7;
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarFilter.frequency.value = 400;
    this.roarFilter.Q.value = 0.8;

    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    this.sub = ctx.createGain();
    this.sub.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 80;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();

    src.connect(bp).connect(this.hiss).connect(this.master);
    src.connect(this.roarFilter).connect(this.roar).connect(this.master);
    osc.connect(this.sub).connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination();
    comp.connect(this.dest);
    src.start();
    osc.start();
  }

  /** level: total thrust 0..1 (fraction of all thrusters at full). */
  set(level: number, timeScale: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const l = this.muted ? 0 : Math.min(1, level * 2.2);
    const slow = timeScale < 1 ? 0.6 : 1;
    this.hiss.gain.setTargetAtTime(l * 0.45 * slow, t, 0.03);
    this.roar.gain.setTargetAtTime(l * 1.2, t, 0.05);
    this.roarFilter.frequency.setTargetAtTime(400 + 1000 * l, t, 0.08);
    this.sub.gain.setTargetAtTime(l * 0.25, t, 0.08);
  }

  /** A short crisp burst when a thruster opens. */
  burst(strength = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * strength, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.09);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.set(0, 1);
  }
}

/**
 * iPhones mute Web Audio when the ring/silent switch is on, unless the page's audio counts as media
 * playback (like a video). Safari 17+ lets us say so directly; older iOS needs a silent looping
 * <audio> element started from a tap, which switches the page into playback mode.
 */
let iosUnmuted = false;
function unmuteOnIOS() {
  if (iosUnmuted) return;
  iosUnmuted = true;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
      return;
    } catch {
      /* fall through to the silent-audio workaround */
    }
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;
  // 0.1 s of silence as an 8 kHz mono WAV
  const n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, str: string) => [...str].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  const el = document.createElement('audio');
  el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  el.loop = true;
  el.setAttribute('playsinline', '');
  el.play().catch(() => {
    /* if this fails the switch still mutes us; nothing else to do */
  });
}
