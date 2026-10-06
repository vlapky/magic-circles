import { polar, ringAngles } from '../core/geom';
import { circle, poly, seg, type Pt, type Shape } from '../core/ir';
import { subRng } from '../core/rng';
import { getAlphabet } from '../glyphs/alphabets';
import { canon, placeGlyph, placeSym } from '../glyphs/text';
import { LW, R0, type Ctx } from './ctx';

/** Точка на луче под углом a: вдоль (along) и поперёк (across). */
const at = (a: number, along: number, across: number): Pt => {
  const [x, y] = polar(along, a);
  return [x - Math.sin(a) * across, y + Math.cos(a) * across];
};

/** Лучи и оси: от центра или от обода наружу, с навершиями. */
export function rays(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.rays;
  const W = ctx.W;
  const rng = subRng(ctx.seed, 'rays');
  const n = Math.max(1, o.count);
  const angles = ringAngles(n, ctx.rot + (o.offset ? Math.PI / n : 0));
  const r0 = o.from * R0;
  const r1 = R0 + o.extend;
  const out: Shape[] = [];
  const syms = Array.from({ length: n }, () => rng.pick(ctx.syms));
  const w = LW.ring * W;

  angles.forEach((a, i) => {
    if (r1 - r0 > 1) out.push(seg(polar(r0, a), polar(r1, a), w));
    switch (o.ends) {
      case 'cross':
        // костыльный крест, как на меловом образце
        out.push(seg(at(a, r1 - 12, -9), at(a, r1 - 12, 9), w));
        out.push(seg(at(a, r1, -4.5), at(a, r1, 4.5), w));
        out.push(seg(at(a, r1 - 16, -9), at(a, r1 - 8, -9), w), seg(at(a, r1 - 16, 9), at(a, r1 - 8, 9), w));
        break;
      case 'dot':
        out.push(circle(...polar(r1 + 5, a), 5, w));
        break;
      case 'arrow':
        out.push(poly([at(a, r1 - 10, -7), at(a, r1, 0), at(a, r1 - 10, 7)], w));
        break;
      case 'symbol': {
        const { j, flip } = canon(i, n, ctx.cfg.mirror);
        out.push(...placeSym(syms[j], polar(r1 + 15, a), 12, w, a + Math.PI / 2, flip));
        break;
      }
    }
  });
  return out;
}

/** Знаки снаружи круга. */
export function outside(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.outside;
  const W = ctx.W;
  const rng = subRng(ctx.seed, 'outside');
  const n = Math.max(1, o.count);
  const angles = ringAngles(n, ctx.rot + (o.offset ? Math.PI / n : 0));
  const abc = getAlphabet(ctx.cfg.layers.outerRing.alphabet, ctx.cfg.script.variant);
  const syms = Array.from({ length: n }, () => rng.pick(ctx.syms));
  const glyphs = Array.from({ length: n }, () => rng.pick(abc));
  const mirror = ctx.cfg.mirror;
  const out: Shape[] = [];

  angles.forEach((a, i) => {
    const p = polar(R0 + o.dist, a);
    const { j } = canon(i, n, mirror);
    const fx = mirror !== 'none' && i > n / 2;
    if (o.ringed) out.push(circle(p[0], p[1], o.size * 1.45, LW.hair * W));
    if (o.content === 'symbol') out.push(...placeSym(syms[j], p, o.size, LW.ring * W, 0, fx));
    else out.push(...placeGlyph(glyphs[j], p, o.size * 1.3, LW.ring * W, 0, fx));
  });
  return out;
}
