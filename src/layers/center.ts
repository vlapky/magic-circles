import { gcd, polar, ringAngles } from '../core/geom';
import { circle, poly, seg, type Shape } from '../core/ir';
import { subRng } from '../core/rng';
import { symbolById } from '../glyphs/symbols';
import { placeSym } from '../glyphs/text';
import { LW, type Ctx } from './ctx';

/** Центральный элемент. */
export function center(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.center;
  const W = ctx.W;
  const rng = subRng(ctx.seed, 'center');
  const R = Math.max(8, ctx.coreR * o.size);
  const out: Shape[] = [];

  switch (o.type) {
    case 'dot':
      out.push(circle(0, 0, Math.min(R, 14 + R * 0.08), LW.ring * W), circle(0, 0, Math.min(R * 0.4, 5), 0, 'ink'));
      break;
    case 'symbol':
      out.push(...placeSym(rng.pick(ctx.syms), [0, 0], R * 0.82, LW.star * W));
      break;
    case 'seal':
      out.push(circle(0, 0, R, LW.star * W, 'bg'), circle(0, 0, R * 0.88, LW.hair * W));
      out.push(...placeSym(rng.pick(ctx.syms), [0, 0], R * 0.55, LW.ring * W));
      break;
    case 'eye':
      out.push(...placeSym(symbolById('eye'), [0, 0], R * 0.95, LW.star * W));
      for (const a of ringAngles(12, 0)) {
        const s = Math.abs(Math.sin(a));
        if (s < 0.3) continue;
        out.push(seg(polar(R * (0.62 + 0.1 * s), a), polar(R * (0.82 + 0.16 * s), a), LW.hair * W));
      }
      break;
    case 'polygram': {
      const [n, k] = rng.pick([[3, 1], [5, 2], [6, 2], [7, 3], [8, 3]] as const);
      const pts = ringAngles(n, ctx.rot).map((a) => polar(R, a));
      out.push(circle(0, 0, R, LW.ring * W));
      if (gcd(n, k) === 1) {
        out.push(poly(Array.from({ length: n }, (_, i) => pts[(i * k) % n]), LW.edge * W, true));
      } else {
        for (let i = 0; i < n; i++) out.push(seg(pts[i], pts[(i + k) % n], LW.edge * W));
      }
      out.push(circle(0, 0, Math.min(4, R * 0.12), 0, 'ink'));
      break;
    }
    case 'rings': {
      const rings = rng.int(2, 4);
      for (let i = 0; i < rings; i++) {
        out.push(circle(0, 0, R * (1 - i / (rings + 0.6)), (i === 0 ? LW.star : LW.hair) * W));
      }
      out.push(circle(0, 0, Math.min(5, R * 0.15), 0, 'ink'));
      break;
    }
  }
  return out;
}
