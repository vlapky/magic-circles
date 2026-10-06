import { TAU, polar, ringAngles } from '../core/geom';
import { arcThrough, circle, seg, type Pt, type Shape } from '../core/ir';
import { arcText } from '../glyphs/text';
import { LW, type Ctx } from './ctx';

/** Две дуги, образующие «лист» между точками A и B. bulge — относительная толщина. */
function leaf(A: Pt, B: Pt, bulge: number, w: number): Shape[] {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const d = Math.hypot(dx, dy);
  if (d < 1) return [];
  const s = (bulge * d) / 2;
  const rho = (d * d) / 4 / (2 * s) + s / 2;
  const mx = (A[0] + B[0]) / 2;
  const my = (A[1] + B[1]) / 2;
  const nx = -dy / d;
  const ny = dx / d;
  const off = rho - s;
  return [arcThrough(mx + nx * off, my + ny * off, A, B, w), arcThrough(mx - nx * off, my - ny * off, A, B, w)];
}

/**
 * Лепестки:
 *  vertex — дуги с центрами в вершинах, проходящие через соседние вершины;
 *  arch   — полукруглые арки, сидящие на окружности между вершинами;
 *  leaf   — листья от центра к окружности.
 */
export function petals(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.petals;
  const W = ctx.W;
  const R = ctx.polyR;
  const n = Math.max(3, o.count);
  const out: Shape[] = [];

  if (o.type === 'vertex') {
    const span = Math.max(1, Math.min(o.span, Math.floor((n - 1) / 2)));
    const pts = ringAngles(n, ctx.rot).map((a) => polar(R, a));
    for (let i = 0; i < n; i++) {
      const c = pts[i];
      const A = pts[(i - span + n) % n];
      const B = pts[(i + span) % n];
      out.push(arcThrough(c[0], c[1], A, B, LW.ring * W));
      if (o.double) {
        const k = 0.9;
        out.push(arcThrough(c[0], c[1], [c[0] + (A[0] - c[0]) * k, c[1] + (A[1] - c[1]) * k], [c[0] + (B[0] - c[0]) * k, c[1] + (B[1] - c[1]) * k], LW.hair * W));
      }
    }
    return out;
  }

  if (o.type === 'arch') {
    const angles = ringAngles(n, ctx.rot + Math.PI / n);
    const rho = o.depth * R * Math.sin(Math.PI / n);
    const band = Math.min(16, rho * 0.3);
    angles.forEach((a, i) => {
      const c = polar(R, a);
      const ends = (rr: number): [Pt, Pt] => {
        const phi = 2 * Math.asin(Math.min(1, rr / (2 * R)));
        return [polar(R, a - phi), polar(R, a + phi)];
      };
      const [A, B] = ends(rho);
      out.push(arcThrough(c[0], c[1], A, B, LW.ring * W));
      if (o.double && rho - band > 6) {
        const [A2, B2] = ends(rho - band);
        const inner = arcThrough(c[0], c[1], A2, B2, LW.hair * W);
        out.push(inner);
        if (o.text && band >= 9) {
          const pad = 0.12;
          out.push(
            ...arcText(ctx, {
              cx: c[0],
              cy: c[1],
              r: rho - band / 2,
              size: band * 0.42,
              alphabet: ctx.cfg.layers.innerRing.alphabet,
              key: `arch${ctx.cfg.mirror === 'none' ? i : 0}`,
              a0: inner.a0 + pad,
              a1: inner.a1 - pad,
              flip: true,
            }),
          );
        }
      }
    });
    return out;
  }

  // leaf
  const angles = ringAngles(n, ctx.rot);
  const r1 = R * Math.max(0.3, o.depth);
  for (const a of angles) {
    out.push(...leaf([0, 0], polar(r1, a), 0.16 + 0.5 / n, LW.ring * W));
    if (o.double) out.push(seg([0, 0], polar(r1, a), LW.thin * W));
  }
  return out;
}

/**
 * Розетка:
 *  circles — венок пересекающихся окружностей;
 *  chords  — полный граф хорд между точками на окружности;
 *  flower  — «цветок жизни» из 19 окружностей.
 */
export function rosette(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.rosette;
  const W = ctx.W;
  const R = ctx.polyR * o.radius;
  const out: Shape[] = [];

  if (o.type === 'circles') {
    const rho = R * o.size;
    for (const a of ringAngles(Math.max(2, o.count), ctx.rot)) {
      const [x, y] = polar(R - rho, a);
      out.push(circle(x, y, rho, LW.hair * 1.2 * W));
    }
    return out;
  }

  if (o.type === 'chords') {
    const n = Math.min(16, Math.max(5, o.count));
    const pts = ringAngles(n, ctx.rot).map((a) => polar(R, a));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push(seg(pts[i], pts[j], LW.thin * W));
    out.push(circle(0, 0, R, LW.hair * W));
    return out;
  }

  const rho = R / 3;
  out.push(circle(0, 0, rho, LW.hair * W));
  for (let i = 0; i < 6; i++) {
    const a = ctx.rot + (i * TAU) / 6;
    for (const [d, da] of [[rho, 0], [rho * Math.sqrt(3), Math.PI / 6], [rho * 2, 0]] as const) {
      const [x, y] = polar(d, a + da);
      out.push(circle(x, y, rho, LW.hair * W));
    }
  }
  out.push(circle(0, 0, R, LW.hair * 1.2 * W));
  return out;
}
