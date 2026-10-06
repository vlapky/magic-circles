// Промежуточная геометрия: слои выдают фигуры в абсолютных координатах,
// рендеры (чистый / мел) превращают их в SVG.

export type Pt = [number, number];
export type Fill = 'none' | 'ink' | 'bg';

export interface CircleShape {
  t: 'c';
  x: number;
  y: number;
  r: number;
  w: number;
  fill?: Fill;
}
export interface PolyShape {
  t: 'p';
  pts: Pt[];
  closed?: boolean;
  smooth?: boolean;
  w: number;
  fill?: Fill;
}
/** Дуга от a0 до a1 (a1 > a0), углы в радианах, рост угла — по часовой на экране. */
export interface ArcShape {
  t: 'a';
  x: number;
  y: number;
  r: number;
  a0: number;
  a1: number;
  w: number;
}
export type Shape = CircleShape | PolyShape | ArcShape;

export const TAU = Math.PI * 2;

export const circle = (x: number, y: number, r: number, w: number, fill?: Fill): CircleShape =>
  fill ? { t: 'c', x, y, r, w, fill } : { t: 'c', x, y, r, w };

export const line = (x1: number, y1: number, x2: number, y2: number, w: number): PolyShape => ({
  t: 'p',
  pts: [
    [x1, y1],
    [x2, y2],
  ],
  w,
});

export const seg = (a: Pt, b: Pt, w: number): PolyShape => ({ t: 'p', pts: [a, b], w });

export function poly(pts: Pt[], w: number, closed = false, fill?: Fill): PolyShape {
  const s: PolyShape = { t: 'p', pts, w };
  if (closed) s.closed = true;
  if (fill) s.fill = fill;
  return s;
}

export const smooth = (pts: Pt[], w: number): PolyShape => ({ t: 'p', pts, w, smooth: true });

export const arc = (x: number, y: number, r: number, a0: number, a1: number, w: number): ArcShape => ({
  t: 'a',
  x,
  y,
  r,
  a0,
  a1,
  w,
});

/** Меньшая дуга окружности с центром (cx, cy) между точками A и B. */
export function arcThrough(cx: number, cy: number, A: Pt, B: Pt, w: number): ArcShape {
  const r = Math.hypot(A[0] - cx, A[1] - cy);
  let a0 = Math.atan2(A[1] - cy, A[0] - cx);
  let d = Math.atan2(B[1] - cy, B[0] - cx) - a0;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  if (d < 0) {
    a0 += d;
    d = -d;
  }
  return { t: 'a', x: cx, y: cy, r, a0, a1: a0 + d, w };
}

export interface Xf {
  x?: number;
  y?: number;
  rot?: number;
  scale?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** множитель толщины штриха (у глифов толщина относительная) */
  wMul?: number;
}

/** Порядок: отражение → масштаб → поворот → перенос. */
export function xform(shapes: Shape[], t: Xf): Shape[] {
  const { x = 0, y = 0, rot = 0, scale = 1, flipX = false, flipY = false, wMul = 1 } = t;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const sx = flipX ? -scale : scale;
  const sy = flipY ? -scale : scale;
  const P = (px: number, py: number): Pt => {
    const ax = px * sx;
    const ay = py * sy;
    return [x + ax * cos - ay * sin, y + ax * sin + ay * cos];
  };
  return shapes.map((s): Shape => {
    if (s.t === 'c') {
      const [cx, cy] = P(s.x, s.y);
      return { ...s, x: cx, y: cy, r: s.r * scale, w: s.w * wMul };
    }
    if (s.t === 'p') {
      return { ...s, pts: s.pts.map(([px, py]) => P(px, py)), w: s.w * wMul };
    }
    const [cx, cy] = P(s.x, s.y);
    let { a0, a1 } = s;
    if (flipX) [a0, a1] = [Math.PI - a1, Math.PI - a0];
    if (flipY) [a0, a1] = [-a1, -a0];
    return { ...s, x: cx, y: cy, r: s.r * scale, a0: a0 + rot, a1: a1 + rot, w: s.w * wMul };
  });
}

/** Наибольшее удаление геометрии от начала координат. */
export function extent(shapes: Shape[]): number {
  let m = 0;
  for (const s of shapes) {
    if (s.t === 'p') {
      for (const [x, y] of s.pts) m = Math.max(m, Math.hypot(x, y));
    } else if (s.t === 'c') {
      m = Math.max(m, Math.hypot(s.x, s.y) + s.r);
    } else {
      // у дуги центр может лежать далеко за пределами рисунка — меряем саму дугу
      for (const [x, y] of arcPts(s, 12)) m = Math.max(m, Math.hypot(x, y));
    }
  }
  return m;
}

export function arcPts(a: ArcShape, step = 5): Pt[] {
  const n = Math.max(2, Math.ceil(((a.a1 - a.a0) * a.r) / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a.a0 + ((a.a1 - a.a0) * i) / n;
    out.push([a.x + a.r * Math.cos(t), a.y + a.r * Math.sin(t)]);
  }
  return out;
}

/** Catmull-Rom → плотная ломаная. */
export function smoothPts(pts: Pt[], per = 6): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
