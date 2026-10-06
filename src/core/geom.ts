import { TAU, type Pt } from './ir';

export { TAU };
/** Угол «вверх» в экранных координатах (y вниз). */
export const TOP = -Math.PI / 2;

export const polar = (r: number, a: number): Pt => [r * Math.cos(a), r * Math.sin(a)];
export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** n углов по кругу, первый — сверху (+ rot). */
export function ringAngles(n: number, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(TOP + rot + (i * TAU) / n);
  return out;
}

export const ringPts = (n: number, r: number, rot = 0): Pt[] => ringAngles(n, rot).map((a) => polar(r, a));

/** Допустимые шаги звезды {n/k}. */
export function starSteps(n: number): number[] {
  const out: number[] = [];
  for (let k = 2; k <= Math.floor((n - 1) / 2); k++) out.push(k);
  if (n === 4 || n === 6 || n === 8 || n === 10 || n === 12) {
    // диаметры тоже годятся как «звезда»
    if (!out.includes(n / 2)) out.push(n / 2);
  }
  return out;
}

/** Внутренний радиус звезды {n/k} (или полигона при k = 1) с описанным радиусом 1. */
export const innerRatio = (n: number, k: number): number => Math.cos((Math.PI * k) / n);
