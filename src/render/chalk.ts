import { TAU, arcPts, smoothPts, type Pt, type Shape } from '../core/ir';
import type { Rng } from '../core/rng';

const f = (n: number): string => String(Math.round(n * 10) / 10);

/** Делит отрезки длиннее step. */
function subdivide(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Базовые штрихи фигуры — так, как их вела бы рука. */
function strokes(s: Shape, rng: Rng, rough: number): Pt[][] {
  if (s.t === 'c') {
    // окружность от руки: начало и конец не совпадают, радиус плывёт
    const start = rng() * TAU;
    const sweep = TAU + rng.range(0.04, 0.22);
    const steps = Math.max(10, Math.ceil((s.r * sweep) / 5));
    const amp = Math.min(rough * 0.7, s.r * 0.07);
    const ph = rng() * TAU;
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + sweep * t;
      const r = s.r + amp * Math.sin(2 * a + ph) + amp * 1.2 * (t - 0.5);
      pts.push([s.x + r * Math.cos(a), s.y + r * Math.sin(a)]);
    }
    return [pts];
  }
  if (s.t === 'a') return [arcPts(s, 5)];
  if (s.smooth) return [smoothPts(s.pts, 6)];

  const pts = s.closed ? [...s.pts, s.pts[0]] : s.pts;
  const longEdges = pts.length > 2 && pts.some((p, i) => i > 0 && Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 30);
  if (!longEdges) return [subdivide(pts, 7)];
  // длинные стороны рисуются отдельными взмахами с небольшим перелётом за угол
  const out: Pt[][] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const o0 = rng.range(0, rough * 1.6) / d;
    const o1 = rng.range(0, rough * 1.6) / d;
    out.push(
      subdivide(
        [
          [a[0] - (b[0] - a[0]) * o0, a[1] - (b[1] - a[1]) * o0],
          [b[0] + (b[0] - a[0]) * o1, b[1] + (b[1] - a[1]) * o1],
        ],
        7,
      ),
    );
  }
  return out;
}

/** Дрожание руки: плавная волна поперёк штриха + мелкий шум. */
function jitter(pts: Pt[], rng: Rng, rough: number, w: number): string {
  const amp = rough * (0.35 + Math.min(w, 3) * 0.12);
  const f1 = TAU / rng.range(60, 110);
  const f2 = TAU / rng.range(22, 38);
  const p1 = rng() * TAU;
  const p2 = rng() * TAU;
  const ox = rng.range(-1, 1) * rough * 0.3;
  const oy = rng.range(-1, 1) * rough * 0.3;
  let len = 0;
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    if (i) len += Math.hypot(p[0] - o[0], p[1] - o[1]);
    const tx = q[0] - o[0];
    const ty = q[1] - o[1];
    const tl = Math.hypot(tx, ty) || 1;
    const wob = amp * (Math.sin(len * f1 + p1) + 0.5 * Math.sin(len * f2 + p2));
    const x = p[0] + ox + (-ty / tl) * wob + rng.range(-1, 1) * rough * 0.16;
    const y = p[1] + oy + (tx / tl) * wob + rng.range(-1, 1) * rough * 0.16;
    d += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
  }
  return d;
}

function blob(s: Shape, rng: Rng, rough: number): string {
  if (s.t === 'c') {
    let d = '';
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      const r = s.r * rng.range(0.85, 1.18);
      d += `${i ? 'L' : 'M'}${f(s.x + r * Math.cos(a))} ${f(s.y + r * Math.sin(a))}`;
    }
    return d + 'Z';
  }
  if (s.t === 'p') {
    return s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x + rng.range(-1, 1) * rough * 0.4)} ${f(y + rng.range(-1, 1) * rough * 0.4)}`).join('') + 'Z';
  }
  return '';
}

const PASS_W = [1, 0.72, 0.5];
const PASS_O = [0.88, 0.6, 0.42];

/** Меловой рендер набора фигур: несколько неровных проходов на каждый штрих. */
export function chalkRun(run: Shape[], rng: Rng, rough: number): string {
  const buckets = new Map<string, string>();
  let fills = '';
  for (const s of run) {
    if (s.t !== 'a' && s.fill === 'ink') {
      fills += blob(s, rng, rough);
      if (!s.w) continue;
    }
    if (!s.w) continue;
    const base = strokes(s, rng, rough);
    const passes = s.w >= 1.5 ? 3 : 2;
    for (const st of base) {
      for (let p = 0; p < passes; p++) {
        const w = Math.max(0.4, Math.round(s.w * PASS_W[p] * rng.range(0.9, 1.15) * 5) / 5);
        const key = `${w}|${PASS_O[p]}`;
        buckets.set(key, (buckets.get(key) ?? '') + jitter(st, rng, rough, s.w));
      }
    }
  }
  let out = '';
  for (const [key, d] of buckets) {
    const [w, o] = key.split('|');
    out += `<path d="${d}" stroke-width="${w}" stroke-opacity="${o}"/>`;
  }
  if (fills) out += `<path d="${fills}" fill="currentColor" stroke="none" fill-opacity="0.92"/>`;
  return out;
}
