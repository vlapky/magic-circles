import { buildCircle } from '../core/build';
import type { CircleConfig, ColorCfg } from '../core/config';
import { extent } from '../core/ir';
import { cyrb53 } from '../core/rng';
import { f, renderShapes } from './svg';

export interface DocOpts {
  idp: string;
  /** x, y, width, height */
  vb: [number, number, number, number];
  color: ColorCfg;
  body: string;
  defs: string;
  /** добавить фильтр зерна мела в defs */
  chalk: boolean;
  rough: number;
  seed: string;
  /** размер в пикселях (для растеризации) */
  px?: [number, number];
  /** без фильтров — для миниатюр */
  lite?: boolean;
}

export const chalkFilterId = (idp: string): string => `${idp}chalk`;

function chalkFilter(idp: string, rough: number, seed: string): string {
  const s = cyrb53(seed) % 9973;
  const disp = f(1.4 + rough * 1.1);
  // смещение рвёт край штриха, вторая турбулентность выедает зерно
  return (
    `<filter id="${chalkFilterId(idp)}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="${s}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="${disp}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
    `<feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${s + 7}" result="g"/>` +
    `<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${f(2.6 + rough * 0.8)} 0 0 0 ${f(-0.55 - rough * 0.3)}" result="gm"/>` +
    `<feComposite in="d" in2="gm" operator="in"/>` +
    `</filter>`
  );
}

function glowFilter(idp: string, c: ColorCfg, vb: DocOpts['vb']): string {
  const r = c.glowRadius;
  const pad = r * 12;
  const tint = !c.glowLinked;
  const blur = (dev: number, name: string): string => {
    let s = `<feGaussianBlur in="SourceGraphic" stdDeviation="${f(dev)}" result="${name}b"/>`;
    if (tint) s += `<feComposite in="flood" in2="${name}b" operator="in" result="${name}t"/>`;
    return s + `<feComponentTransfer in="${name}${tint ? 't' : 'b'}" result="${name}"><feFuncA type="linear" slope="${f(c.glowStrength)}"/></feComponentTransfer>`;
  };
  return (
    `<filter id="${idp}glow" filterUnits="userSpaceOnUse" x="${f(vb[0] - pad)}" y="${f(vb[1] - pad)}" width="${f(vb[2] + pad * 2)}" height="${f(vb[3] + pad * 2)}" color-interpolation-filters="sRGB">` +
    (tint ? `<feFlood flood-color="${c.glowColor}" result="flood"/>` : '') +
    blur(r * 3.2, 'wide') +
    blur(r, 'near') +
    `<feMerge><feMergeNode in="wide"/><feMergeNode in="near"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter>`
  );
}

/** Оборачивает разметку в самодостаточный SVG-документ с фоном, ореолом и фильтрами. */
export function svgDoc(o: DocOpts): string {
  const [x, y, w, h] = o.vb;
  const c = o.color;
  const glow = c.glow && !o.lite;
  let defs = o.defs;
  let back = '';
  if (!c.transparent) back += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${c.bg}" stroke="none"/>`;
  if (c.halo) {
    const hc = c.glowLinked ? c.ink : c.glowColor;
    defs +=
      `<radialGradient id="${o.idp}halo" gradientUnits="userSpaceOnUse" cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" r="${f(Math.max(w, h) / 2)}">` +
      `<stop offset="0" stop-color="${hc}" stop-opacity=".13"/><stop offset=".75" stop-color="${hc}" stop-opacity="0"/></radialGradient>`;
    back += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${o.idp}halo)" stroke="none"/>`;
  }
  if (o.chalk && !o.lite) defs += chalkFilter(o.idp, o.rough, o.seed);
  if (glow) defs += glowFilter(o.idp, c, o.vb);
  const size = o.px ? ` width="${o.px[0]}" height="${o.px[1]}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}"${size} color="${c.ink}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">` +
    `<defs>${defs}</defs>${back}` +
    `<g${glow ? ` filter="url(#${o.idp}glow)"` : ''}>${o.body}</g></svg>`
  );
}

export interface CircleParts {
  body: string;
  defs: string;
  /** наибольший радиус геометрии */
  extent: number;
}

/** Разметка одного круга без обёртки — для превью и для узлов системы. */
export function circleParts(cfg: CircleConfig, idp: string, o: { weightMul?: number; lite?: boolean } = {}): CircleParts {
  const shapes = buildCircle(cfg, o.weightMul ?? 1);
  const chalk = cfg.style.mode === 'chalk';
  const { body, defs } = renderShapes(shapes, { mode: cfg.style.mode, rough: cfg.style.rough, seed: cfg.seed, idp });
  return {
    body: chalk && !o.lite ? `<g filter="url(#${chalkFilterId(idp)})">${body}</g>` : body,
    defs,
    extent: extent(shapes),
  };
}

/** Готовый SVG круга. */
export function circleSvg(cfg: CircleConfig, idp: string, o: { px?: number; lite?: boolean } = {}): string {
  const parts = circleParts(cfg, idp, { lite: o.lite });
  const pad = o.lite ? 6 : 8 + (cfg.color.glow ? cfg.color.glowRadius * 4 : 0);
  const half = Math.max(250, Math.ceil(parts.extent + pad));
  return svgDoc({
    idp,
    vb: [-half, -half, half * 2, half * 2],
    color: cfg.color,
    body: parts.body,
    defs: parts.defs,
    chalk: cfg.style.mode === 'chalk',
    rough: cfg.style.rough,
    seed: cfg.seed,
    px: o.px ? [o.px, o.px] : undefined,
    lite: o.lite,
  });
}
