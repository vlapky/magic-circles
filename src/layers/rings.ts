import { TAU, TOP, polar } from '../core/geom';
import { circle, seg, type Shape } from '../core/ir';
import type { Layers } from '../core/config';
import { arcText, ringSlots } from '../glyphs/text';
import { LW, R0, type Ctx } from './ctx';

const BAND = [28, 22, 22];
const GLYPH = [10.8, 8.4, 8.4];
/** Зазор между внешним кольцом и описанной окружностью полиграммы. */
export const RING_GAP = 16;

/** Радиус внутренней кромки внешнего кольца. */
export function outerRingEdge(o: Layers['outerRing']): number {
  let r = R0 - 6;
  for (let i = 0; i < o.bands; i++) r -= BAND[i];
  return r;
}

function ticks(r0: number, r1: number, n: number, w: number): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const a = TOP + (i * TAU) / n;
    out.push(seg(polar(r0, a), polar(r1, a), w));
  }
  return out;
}

/** Внешнее кольцо: двойной обод и 1–3 полосы письма. R — внешний радиус (у рамки системы он свой). */
export function outerRing(ctx: Ctx, R = R0): Shape[] {
  const o = ctx.cfg.layers.outerRing;
  const W = ctx.W;
  const out: Shape[] = [circle(0, 0, R, LW.rim * W), circle(0, 0, R - 6, LW.hair * W)];
  if (o.ticks) out.push(...ticks(R - 6, R, Math.round((144 * R) / R0), LW.thin * W));

  let r = R - 6;
  for (let i = 0; i < o.bands; i++) {
    const h = BAND[i];
    const size = GLYPH[i];
    const rt = r - h / 2;
    if (o.cells) {
      const N = ringSlots(rt, size, o.density, ctx.cfg.mirror);
      for (let k = 0; k < N; k++) {
        const a = TOP + ((k + 0.5) * TAU) / N;
        out.push(seg(polar(r - h, a), polar(r, a), LW.thin * W));
      }
    }
    out.push(
      ...arcText(ctx, {
        r: rt,
        size,
        alphabet: o.alphabet,
        key: `outer${i}`,
        density: o.density,
        flip: o.flip,
        reverse: o.reverse !== (i % 2 === 1),
      }),
    );
    r -= h;
    out.push(circle(0, 0, r, (i === o.bands - 1 ? LW.ring : LW.hair) * W));
  }
  return out;
}

/** Внутреннее кольцо: перекрывает линии под собой, несёт вторую строку письма. */
export function innerRing(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.innerRing;
  const W = ctx.W;
  const ro = o.radius * ctx.polyR;
  const out: Shape[] = [circle(0, 0, ro, LW.star * W, o.fillBg ? 'bg' : undefined)];
  if (o.ticks) out.push(...ticks(ro, ro + 5, 72, LW.thin * W));
  if (o.band && ro > 50) {
    const size = Math.min(10.8, ro * 0.075 + 2.5);
    const h = size * 2.05;
    out.push(...arcText(ctx, { r: ro - h / 2, size, alphabet: o.alphabet, key: 'inner' }));
    out.push(circle(0, 0, ro - h, 1.1 * W));
  }
  return out;
}

/** Радиус свободной области внутри внутреннего кольца. */
export function innerRingCore(o: Layers['innerRing'], polyR: number): number {
  const ro = o.radius * polyR;
  if (!(o.band && ro > 50)) return ro - 4;
  return ro - Math.min(10.8, ro * 0.075 + 2.5) * 2.05 - 4;
}
