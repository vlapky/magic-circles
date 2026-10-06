import { polar, ringAngles } from './geom';
import type { CircleConfig } from './config';
import type { Shape } from './ir';
import { symbolPool } from '../glyphs/symbols';
import { center } from '../layers/center';
import { R0, type Ctx } from '../layers/ctx';
import { nodes } from '../layers/nodes';
import { petals, rosette } from '../layers/petals';
import { polygram } from '../layers/polygram';
import { outside, rays } from '../layers/rays';
import { RING_GAP, innerRing, innerRingCore, outerRing, outerRingEdge } from '../layers/rings';
import { edgeText, spiral } from '../layers/script';

function makeCtx(cfg: CircleConfig, weightMul: number): Ctx {
  const L = cfg.layers;
  const edge = L.outerRing.on ? outerRingEdge(L.outerRing) : R0;
  const polyR = edge - (L.outerRing.on && L.polygram.on && L.polygram.circum ? RING_GAP : 0);
  const n = L.polygram.on ? L.polygram.n : Math.max(3, L.nodes.count);
  const rot = L.polygram.on ? (L.polygram.rotation * Math.PI) / 180 + (L.polygram.flip ? Math.PI : 0) : 0;
  const angles = ringAngles(n, rot);
  return {
    cfg,
    seed: cfg.seed,
    W: cfg.style.weight * weightMul,
    edge,
    polyR,
    n,
    rot,
    angles,
    verts: angles.map((a) => polar(polyR, a)),
    coreR: L.innerRing.on ? innerRingCore(L.innerRing, polyR) : polyR * 0.34,
    syms: symbolPool(cfg.script.symbols),
  };
}

/** Кольцо письма произвольного радиуса — рамка системы. */
export function buildRing(cfg: CircleConfig, R: number, weightMul = 1): Shape[] {
  return outerRing(makeCtx(cfg, weightMul), R);
}

/** Собирает геометрию круга из включённых слоёв. Порядок важен: поздние слои перекрывают ранние. */
export function buildCircle(cfg: CircleConfig, weightMul = 1): Shape[] {
  const L = cfg.layers;
  const ctx = makeCtx(cfg, weightMul);

  const out: Shape[] = [];
  if (L.rays.on) out.push(...rays(ctx));
  if (L.rosette.on) out.push(...rosette(ctx));
  if (L.petals.on) out.push(...petals(ctx));
  if (L.polygram.on) out.push(...polygram(ctx));
  if (L.outerRing.on) out.push(...outerRing(ctx));
  if (L.innerRing.on) out.push(...innerRing(ctx));
  if (L.polygram.on && L.edgeText.on) out.push(...edgeText(ctx));
  if (L.spiral.on) out.push(...spiral(ctx));
  if (L.nodes.on) out.push(...nodes(ctx));
  if (L.center.on) out.push(...center(ctx));
  if (L.outside.on) out.push(...outside(ctx));
  return out;
}
