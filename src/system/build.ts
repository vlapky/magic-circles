import { buildRing } from '../core/build';
import { cloneConfig, defaultConfig, type CircleConfig } from '../core/config';
import { clamp } from '../core/geom';
import { circle, seg, xform, type Shape } from '../core/ir';
import { LW, R0 } from '../layers/ctx';
import { chalkFilterId, circleParts, svgDoc, type CircleParts } from '../render/compose';
import { f, renderShapes } from '../render/svg';
import type { SystemConfig, SystemNode } from './types';

/** Тонкие линии не должны исчезать у уменьшенных кругов. */
const weightFor = (scale: number): number => clamp(Math.pow(1 / scale, 0.6), 0.6, 2.6);

/** Конфиг круга с учётом общего стиля системы. */
export function effectiveConfig(sys: SystemConfig, node: SystemNode): CircleConfig {
  if (!sys.unify) return node.config;
  return { ...node.config, style: sys.style, color: { ...node.config.color, ink: sys.color.ink } };
}

const cache = new Map<string, CircleParts>();

function nodeParts(sys: SystemConfig, node: SystemNode, idp: string, lite: boolean): CircleParts {
  const cfg = effectiveConfig(sys, node);
  const wm = Math.round(weightFor(node.scale) * 20) / 20;
  const key = `${idp}|${wm}|${lite}|${JSON.stringify(cfg)}`;
  let p = cache.get(key);
  if (!p) {
    if (cache.size > 80) cache.clear();
    p = circleParts(cfg, idp, { weightMul: wm, lite });
    cache.set(key, p);
  }
  return p;
}

export const nodeTransform = (n: SystemNode): string =>
  `translate(${f(n.x)} ${f(n.y)}) rotate(${f(n.rot)}) scale(${Math.round(n.scale * 1000) / 1000})`;

function linkShapes(sys: SystemConfig): Shape[] {
  if (sys.linkKind === 'none') return [];
  const byId = new Map(sys.nodes.map((n) => [n.id, n]));
  const w = LW.ring * sys.style.weight;
  const out: Shape[] = [];
  for (const l of sys.links) {
    const a = byId.get(l.a);
    const b = byId.get(l.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const ra = R0 * a.scale;
    const rb = R0 * b.scale;
    if (d <= ra + rb + 2) continue;
    const ux = dx / d;
    const uy = dy / d;
    const offs = sys.linkKind === 'double' ? [-5, 5] : [0];
    for (const o of offs) {
      // линия обрезается по ободам кругов
      const ka = Math.sqrt(Math.max(0, ra * ra - o * o));
      const kb = Math.sqrt(Math.max(0, rb * rb - o * o));
      out.push(seg([a.x + ux * ka - uy * o, a.y + uy * ka + ux * o], [b.x - ux * kb - uy * o, b.y - uy * kb + ux * o], w));
    }
  }
  return out;
}

/** Разметка связей — отдельно, чтобы редактор мог перерисовывать их во время перетаскивания. */
export function linksMarkup(sys: SystemConfig, idp: string): string {
  const shapes = linkShapes(sys);
  if (!shapes.length) return '';
  const mode = sys.unify ? sys.style.mode : 'clean';
  const { body } = renderShapes(shapes, { mode, rough: sys.style.rough, seed: sys.seed, idp: `${idp}l` });
  return body;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function frameConfig(sys: SystemConfig): CircleConfig {
  const c = cloneConfig(sys.nodes[0]?.config ?? defaultConfig());
  c.seed = sys.seed;
  c.style = sys.style;
  c.mirror = 'none';
  for (const k of Object.keys(c.layers) as (keyof CircleConfig['layers'])[]) c.layers[k].on = false;
  c.layers.outerRing.on = true;
  c.layers.outerRing.bands = 1;
  return c;
}

export interface SystemRender {
  svg: string;
  vb: [number, number, number, number];
}

/**
 * Собирает систему в один SVG. В режиме редактора у узлов есть data-node и невидимая
 * область захвата, а связи лежат в группе data-links.
 */
export function systemSvg(sys: SystemConfig, idp: string, o: { editor?: boolean; px?: number; lite?: boolean } = {}): SystemRender {
  const lite = !!o.lite;
  let defs = '';
  let anyChalk = false;
  const box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x: number, y: number, r: number): void => {
    box.x0 = Math.min(box.x0, x - r);
    box.y0 = Math.min(box.y0, y - r);
    box.x1 = Math.max(box.x1, x + r);
    box.y1 = Math.max(box.y1, y + r);
  };

  const parts = sys.nodes.map((n, i) => {
    const p = nodeParts(sys, n, `${idp}n${i}`, lite);
    grow(n.x, n.y, Math.max(R0, p.extent) * n.scale);
    return p;
  });
  if (!sys.nodes.length) grow(0, 0, 250);

  // рамка охватывает все круги
  let frame = '';
  if (sys.frame !== 'none' && sys.nodes.length) {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    let ext = 0;
    sys.nodes.forEach((n, i) => {
      ext = Math.max(ext, Math.hypot(n.x - cx, n.y - cy) + Math.max(R0, parts[i].extent) * n.scale);
    });
    let shapes: Shape[];
    let outer: number;
    if (sys.frame === 'circle') {
      outer = ext + 14;
      const w = sys.style.weight;
      shapes = [circle(cx, cy, outer, LW.rim * w), circle(cx, cy, outer - 6, LW.hair * w)];
    } else {
      // кольцо письма строится сразу нужного радиуса; у крупной системы знаки чуть крупнее
      const k = clamp(ext / 420, 1, 1.9);
      const R = (ext + 10) / k + 34;
      outer = R * k;
      shapes = xform(buildRing(frameConfig(sys), R), { x: cx, y: cy, scale: k, wMul: Math.sqrt(k) });
    }
    const fr = renderShapes(shapes, { mode: sys.style.mode, rough: sys.style.rough, seed: sys.seed, idp: `${idp}f` });
    frame = sys.style.mode === 'chalk' && !lite ? `<g filter="url(#${chalkFilterId(idp)})">${fr.body}</g>` : fr.body;
    anyChalk ||= sys.style.mode === 'chalk';
    grow(cx, cy, outer + 2);
  }

  const linkBody = linksMarkup(sys, idp);
  let body = frame + `<g data-links="1"${sys.unify && sys.style.mode === 'chalk' && !lite ? ` filter="url(#${chalkFilterId(idp)})"` : ''}>${linkBody}</g>`;
  if (linkBody && sys.unify && sys.style.mode === 'chalk') anyChalk = true;

  sys.nodes.forEach((n, i) => {
    const p = parts[i];
    const cfg = effectiveConfig(sys, n);
    if (cfg.style.mode === 'chalk') anyChalk = true;
    defs += p.defs;
    if (n.opaque) {
      const id = `${idp}o${i}`;
      const B = 20000;
      defs +=
        `<mask id="${id}" maskUnits="userSpaceOnUse" x="${-B}" y="${-B}" width="${B * 2}" height="${B * 2}">` +
        `<rect x="${-B}" y="${-B}" width="${B * 2}" height="${B * 2}" fill="#fff" stroke="none"/>` +
        `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(R0 * n.scale)}" fill="#000" stroke="none"/></mask>`;
      body = `<g mask="url(#${id})">${body}</g>`;
    }
    const inner = p.body.replace(chalkFilterId(`${idp}n${i}`), chalkFilterId(idp));
    const hit = o.editor ? `<circle r="250" fill="#000" fill-opacity="0" stroke="none" pointer-events="all"/>` : '';
    const col = sys.unify ? '' : ` color="${cfg.color.ink}"`;
    body += `<g${o.editor ? ` data-node="${n.id}"` : ''} transform="${nodeTransform(n)}"${col}>${hit}${inner}</g>`;
  });

  const pad = lite ? 8 : 14 + (sys.color.glow ? sys.color.glowRadius * 4 : 0);
  const vb: SystemRender['vb'] = [box.x0 - pad, box.y0 - pad, box.x1 - box.x0 + pad * 2, box.y1 - box.y0 + pad * 2];
  let px: [number, number] | undefined;
  if (o.px) {
    const k = o.px / Math.max(vb[2], vb[3]);
    px = [Math.round(vb[2] * k), Math.round(vb[3] * k)];
  }
  const svg = svgDoc({
    idp,
    vb,
    color: sys.color,
    body,
    defs,
    chalk: anyChalk,
    rough: sys.style.rough,
    seed: sys.seed,
    px,
    lite,
  });
  return { svg, vb };
}
