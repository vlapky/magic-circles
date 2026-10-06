export interface Bands {
  bass: number;
  mid: number;
  treble: number;
  level: number;
}

/** Средняя громкость полосы частот из байтового спектра анализатора, 0…1. */
function band(spectrum: Uint8Array, binHz: number, lo: number, hi: number): number {
  const a = Math.max(1, Math.floor(lo / binHz));
  const b = Math.min(spectrum.length - 1, Math.ceil(hi / binHz));
  if (b < a) return 0;
  let sum = 0;
  for (let i = a; i <= b; i++) sum += spectrum[i];
  return sum / (b - a + 1) / 255;
}

/** Растягивает полезную часть диапазона: спектр анализатора в децибелах и почти не опускается к нулю. */
const lift = (x: number, floor: number, power = 1): number => Math.pow(Math.min(1, Math.max(0, (x - floor) / (1 - floor))), power);

/** Бас, середина и верх из спектра, приведённые к сопоставимым 0…1. */
export function readBands(spectrum: Uint8Array, sampleRate: number, fftSize: number): Bands {
  const binHz = sampleRate / fftSize;
  const bass = lift(band(spectrum, binHz, 30, 160), 0.3, 1.5);
  const mid = lift(band(spectrum, binHz, 160, 2000), 0.2);
  // энергия верха в музыке заметно ниже баса — усиливаем
  const treble = Math.min(1, band(spectrum, binHz, 2000, 9000) * 2.8);
  return { bass, mid, treble, level: Math.min(1, bass * 0.5 + mid * 0.35 + treble * 0.15) };
}

/**
 * Детектор ударов по басу: удар — резкий подъём за несколько кадров.
 * Порог подстраивается под силу недавних ударов, чтобы басовые ноты между бочками
 * не считались ударами. sens 0…1 — чувствительность.
 */
export class BeatDetector {
  /** недавние значения баса с отметками времени — окно не зависит от частоты кадров */
  private recent: [number, number][] = [];
  private avg = 0;
  private peak = 0;
  private last = -Infinity;

  reset(): void {
    this.recent = [];
    this.avg = 0;
    this.peak = 0;
    this.last = -Infinity;
  }

  update(bass: number, t: number, dt: number, sens: number): boolean {
    while (this.recent.length && t - this.recent[0][0] > 0.09) this.recent.shift();
    let low = bass;
    for (const [, v] of this.recent) low = Math.min(low, v);
    const rise = bass - low;
    // доля от силы недавних ударов: чем выше чувствительность, тем более слабые подъёмы засчитываются
    const threshold = Math.max(0.3 - 0.22 * sens, (0.95 - 0.4 * sens) * this.peak);
    const hit = rise > threshold && bass > this.avg && t - this.last > 0.24;

    this.avg += (bass - this.avg) * (1 - Math.exp(-dt / 0.8));
    this.peak *= Math.exp(-dt / 4);
    this.recent.push([t, bass]);
    if (hit) this.last = t;
    // подъём дорастает ещё пару кадров после срабатывания — запоминаем его полную высоту
    if (t - this.last < 0.1) this.peak = Math.max(this.peak, rise);
    return hit;
  }
}
