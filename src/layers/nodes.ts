import { polar, ringAngles } from '../core/geom';
import { circle, type Pt, type Shape } from '../core/ir';
import { subRng } from '../core/rng';
import { getAlphabet } from '../glyphs/alphabets';
import { canon, placeGlyph, placeSym } from '../glyphs/text';
import { LW, type Ctx } from './ctx';

/** Точки, в которых стоят малые круги. */
export function nodePoints(ctx: Ctx): { pts: Pt[]; angles: number[] } {
  const o = ctx.cfg.layers.nodes;
  let angles: number[];
  let r: number;
  if (o.place === 'orbit') {
    angles = ringAngles(o.count, 0);
    r = o.orbit * ctx.polyR;
  } else if (o.place === 'mids') {
    angles = ringAngles(ctx.n, ctx.rot + Math.PI / ctx.n);
    r = ctx.polyR * Math.cos(Math.PI / ctx.n);
  } else {
    angles = ctx.angles;
    r = ctx.polyR;
  }
  return { pts: angles.map((a) => polar(r, a)), angles };
}

/** Малые круги на вершинах / серединах рёбер / орбите, с символом внутри. */
export function nodes(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.nodes;
  const W = ctx.W;
  const { pts, angles } = nodePoints(ctx);
  const rng = subRng(ctx.seed, 'nodes');
  const N = pts.length;
  const out: Shape[] = [];

  if (o.place === 'orbit') out.push(circle(0, 0, o.orbit * ctx.polyR, LW.hair * W));
  // сначала все заливки фоном — они образуют одну маску
  for (const p of pts) out.push(circle(p[0], p[1], o.r, LW.star * W, 'bg'));

  const inner = o.double ? o.r - Math.max(3, o.r * 0.15) : o.r;
  if (o.double) for (const p of pts) out.push(circle(p[0], p[1], inner, LW.hair * W));
  if (o.content === 'none') return out;

  const abc = getAlphabet(ctx.cfg.layers.outerRing.alphabet, ctx.cfg.script.variant);
  const syms = Array.from({ length: N }, () => rng.pick(ctx.syms));
  const glyphs = Array.from({ length: N }, () => rng.pick(abc));
  const mirror = ctx.cfg.mirror;
  pts.forEach((p, i) => {
    const { j, flip } = canon(i, N, mirror);
    const rot = o.radial ? angles[i] + Math.PI / 2 : 0;
    // стоящие прямо символы отражаются только относительно вертикали: вверх ногами они не читаются
    const fx = o.radial ? flip : mirror !== 'none' && i > N / 2;
    if (o.content === 'symbol') out.push(...placeSym(syms[j], p, inner * 0.6, LW.ring * W, rot, fx));
    else out.push(...placeGlyph(glyphs[j], p, inner * 0.75, LW.ring * W, rot, fx));
  });
  return out;
}
