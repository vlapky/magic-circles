import { gcd, innerRatio, polar, ringAngles, starSteps } from '../core/geom';
import { circle, poly, seg, xform, type Shape } from '../core/ir';
import { LW, type Ctx } from './ctx';

function figure(n: number, k: number, mode: 'polygon' | 'star' | 'both', r: number, rot: number, W: number): Shape[] {
  const out: Shape[] = [];
  const pts = ringAngles(n, rot).map((a) => polar(r, a));
  const star = mode !== 'polygon' && starSteps(n).includes(k);
  if (mode !== 'star' || !star) out.push(poly(pts, LW.edge * W, true));
  if (star) {
    if (gcd(n, k) === 1) {
      // одна непрерывная линия
      const path = [];
      for (let i = 0; i < n; i++) path.push(pts[(i * k) % n]);
      out.push(poly(path, LW.star * W, true));
    } else {
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const j = (i + k) % n;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(seg(pts[i], pts[j], LW.star * W));
      }
    }
  }
  return out;
}

/** Полиграмма: полигон и/или звезда {n/k}, вложенные копии, двойная линия, зеркальная пара. */
export function polygram(ctx: Ctx): Shape[] {
  const o = ctx.cfg.layers.polygram;
  const W = ctx.W;
  const out: Shape[] = [];
  if (o.circum) out.push(circle(0, 0, ctx.polyR, 1.6 * W));

  // Следующая копия вписывается во внутренний многоугольник предыдущей.
  const star = o.mode !== 'polygon' && starSteps(o.n).includes(o.k);
  const half = Math.PI / o.n;
  let ratio = star ? innerRatio(o.n, o.k) / innerRatio(o.n, 1) : innerRatio(o.n, 1);
  let inscribed = star ? (o.k % 2 === 0 ? half : 0) : half;
  if (ratio < 0.15) {
    ratio = innerRatio(o.n, 1);
    inscribed = half;
  }
  const step = inscribed + (1 - o.twist) * half;

  const body: Shape[] = [];
  let r = ctx.polyR;
  let rot = ctx.rot;
  for (let i = 0; i <= o.nested; i++) {
    if (r < 12) break;
    body.push(...figure(o.n, o.k, o.mode, r, rot, W * (i ? 0.85 : 1)));
    if (o.double) body.push(...figure(o.n, o.k, o.mode, r * 0.93, rot, W * 0.55));
    r *= ratio;
    rot += step;
  }
  out.push(...body);
  if (o.mirrorCopy) out.push(...xform(body, { flipX: true }));
  return out;
}
