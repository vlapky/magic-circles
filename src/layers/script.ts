import { lerp } from '../core/geom';
import type { Pt, Shape } from '../core/ir';
import { lineText, spiralText } from '../glyphs/text';
import type { Ctx } from './ctx';

/** Надписи вдоль сторон полиграммы, со сдвигом внутрь. */
export function edgeText(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.edgeText;
  const out: Shape[] = [];
  const n = ctx.verts.length;
  if (n < 3) return out;
  const mirrored = ctx.cfg.mirror !== 'none';
  for (let i = 0; i < n; i++) {
    const A = ctx.verts[i];
    const B = ctx.verts[(i + 1) % n];
    // сдвиг к центру на высоту строки
    const mx = (A[0] + B[0]) / 2;
    const my = (A[1] + B[1]) / 2;
    const m = Math.hypot(mx, my) || 1;
    const d = o.size * 1.25;
    const shift = (p: Pt): Pt => [p[0] - (mx / m) * d, p[1] - (my / m) * d];
    out.push(
      ...lineText(ctx, shift(lerp(A, B, 0.22)), shift(lerp(A, B, 0.78)), {
        size: o.size,
        alphabet: o.alphabet,
        key: `edge${mirrored ? Math.min(i, n - 1 - i) : i}`,
      }),
    );
  }
  return out;
}

/** Спираль письма. */
export function spiral(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.spiral;
  return spiralText(ctx, {
    r0: o.start * ctx.edge - o.size,
    turns: o.turns,
    size: o.size,
    alphabet: o.alphabet,
    key: 'spiral',
    rMin: 14,
  });
}
