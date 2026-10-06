import { polar, ringAngles } from './geom';
import type { CircleConfig, LayerId } from './config';
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

export interface LayerShapes {
  id: LayerId;
  shapes: Shape[];
}

/** Геометрия по слоям в порядке отрисовки: поздние слои перекрывают ранние. */
export function buildLayers(cfg: CircleConfig, weightMul = 1): LayerShapes[] {
  const L = cfg.layers;
  const ctx = makeCtx(cfg, weightMul);
  const out: LayerShapes[] = [];
  const add = (id: LayerId, on: boolean, make: (c: Ctx) => Shape[]): void => {
    if (on) out.push({ id, shapes: make(ctx) });
  };
  add('rays', L.rays.on, rays);
  add('rosette', L.rosette.on, rosette);
  add('petals', L.petals.on, petals);
  add('polygram', L.polygram.on, polygram);
  add('outerRing', L.outerRing.on, outerRing);
  add('innerRing', L.innerRing.on, innerRing);
  add('edgeText', L.polygram.on && L.edgeText.on, edgeText);
  add('spiral', L.spiral.on, spiral);
  add('nodes', L.nodes.on, nodes);
  add('center', L.center.on, center);
  add('outside', L.outside.on, outside);
  return out;
}

/** Собирает геометрию круга из включённых слоёв одним списком. */
export function buildCircle(cfg: CircleConfig, weightMul = 1): Shape[] {
  return buildLayers(cfg, weightMul).flatMap((l) => l.shapes);
}
