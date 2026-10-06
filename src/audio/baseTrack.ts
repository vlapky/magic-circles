import { encodeWav } from './wav';

// Базовый трек синтезируется в браузере: никаких файлов и чужих записей.
// 16 тактов 4/4, ля минор (Am – F – Dm – E), партии вступают по четыре такта.

export const BASE_BPM = 100;
const BEAT = 60 / BASE_BPM;
const BARS = 16;
const SR = 44100;

interface Chord {
  bass: number;
  pad: [number, number, number];
}

const CHORDS: Chord[] = [
  { bass: 55.0, pad: [110.0, 130.81, 164.81] }, // Am
  { bass: 43.65, pad: [110.0, 130.81, 174.61] }, // F
  { bass: 73.42, pad: [110.0, 146.83, 174.61] }, // Dm
  { bass: 41.2, pad: [103.83, 123.47, 164.81] }, // E
];

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, SR, SR);
  const data = buf.getChannelData(0);
  let a = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    data[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

function panned(ctx: BaseAudioContext, out: AudioNode, pan: number): AudioNode {
  if (!pan) return out;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  return p;
}

function kick(ctx: BaseAudioContext, out: AudioNode, t: number, gain = 1): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.35);
}

function hit(
  ctx: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  t: number,
  o: { type: BiquadFilterType; freq: number; q?: number; gain: number; decay: number; pan?: number },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.value = o.freq;
  f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + o.decay);
  src.connect(f).connect(g).connect(panned(ctx, out, o.pan ?? 0));
  src.start(t, (t * 0.37) % 0.5);
  src.stop(t + o.decay + 0.02);
}

function bass(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 5;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(220, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  osc.connect(f).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.28);
}

function pad(ctx: BaseAudioContext, out: AudioNode, t: number, dur: number, notes: number[]): void {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(450, t);
  f.frequency.linearRampToValueAtTime(1500, t + dur * 0.55);
  f.frequency.linearRampToValueAtTime(500, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 1.1);
  g.gain.setValueAtTime(0.05, t + dur - 0.9);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  f.connect(g).connect(out);
  notes.forEach((freq, i) => {
    for (const cents of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = cents;
      osc.connect(panned(ctx, f, (i - 1) * 0.45));
      osc.start(t);
      osc.stop(t + dur);
    }
  });
}

function bell(ctx: BaseAudioContext, out: AudioNode, t: number, freq: number, pan: number): void {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  g.connect(panned(ctx, out, pan));
  for (const [type, mul, level] of [['sine', 1, 1], ['triangle', 2, 0.25]] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * mul;
    const lv = ctx.createGain();
    lv.gain.value = level;
    osc.connect(lv).connect(g);
    osc.start(t);
    osc.stop(t + 0.26);
  }
}

const ARP = [0, 1, 2, 3, 2, 1, 4, 2];

async function render(): Promise<Blob> {
  const total = BARS * 4 * BEAT;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * SR), SR);
  const master = ctx.createGain();
  // короткие фейды на краях — петля замыкается без щелчка
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.85, 0.012);
  master.gain.setValueAtTime(0.85, total - 0.03);
  master.gain.linearRampToValueAtTime(0, total);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const noise = noiseBuffer(ctx);

  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const t0 = bar * 4 * BEAT;
    if (bar % 2 === 0) pad(ctx, master, t0, 8 * BEAT, chord.pad);
    const arp = [chord.pad[0] * 2, chord.pad[1] * 2, chord.pad[2] * 2, chord.pad[0] * 4, chord.pad[1] * 4];

    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BEAT;
      const last = bar === BARS - 1 && b === 3;
      kick(ctx, master, t);
      // сбивка в конце петли
      if (last) for (let k = 1; k < 4; k++) kick(ctx, master, t + (k * BEAT) / 4, 0.55 + k * 0.1);
      hit(ctx, master, noise, t + BEAT / 2, { type: 'highpass', freq: 7000, gain: 0.13, decay: 0.045, pan: 0.15 });
      if (bar >= 4) {
        bass(ctx, master, t + BEAT / 2, chord.bass);
        if (b % 2 === 1) hit(ctx, master, noise, t, { type: 'bandpass', freq: 1500, q: 0.8, gain: 0.24, decay: 0.15 });
      }
      if (bar >= 8) {
        if (b === 3) bass(ctx, master, t + BEAT * 0.75, chord.bass * 2);
        for (let k = 0; k < 4; k++) {
          const i = b * 4 + k;
          const tk = t + (k * BEAT) / 4;
          if (k % 2) hit(ctx, master, noise, tk, { type: 'highpass', freq: 9000, gain: 0.045, decay: 0.03, pan: -0.2 });
          bell(ctx, master, tk, arp[ARP[i % ARP.length]], i % 2 ? 0.5 : -0.5);
        }
      }
    }
  }

  const buf = await ctx.startRendering();
  return new Blob([encodeWav([buf.getChannelData(0), buf.getChannelData(1)], SR)], { type: 'audio/wav' });
}

let cached: Promise<string> | null = null;

/** URL сгенерированного базового трека; синтез выполняется один раз. */
export function baseTrackUrl(): Promise<string> {
  cached ??= render().then((blob) => URL.createObjectURL(blob));
  return cached;
}
