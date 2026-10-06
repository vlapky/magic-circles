import type { Shape } from '../core/ir';
import { makeRng } from '../core/rng';
import { chalkRun } from './chalk';

export const f = (n: number): string => {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? '0' : String(v);
};

/** Контур фигуры как SVG-путь. */
export function pathOf(s: Shape): string {
  if (s.t === 'c') {
    const r = f(s.r);
    return `M${f(s.x - s.r)} ${f(s.y)}a${r} ${r} 0 1 0 ${f(s.r * 2)} 0a${r} ${r} 0 1 0 ${f(-s.r * 2)} 0`;
  }
  if (s.t === 'a') {
    const x0 = s.x + s.r * Math.cos(s.a0);
    const y0 = s.y + s.r * Math.sin(s.a0);
    const x1 = s.x + s.r * Math.cos(s.a1);
    const y1 = s.y + s.r * Math.sin(s.a1);
    return `M${f(x0)} ${f(y0)}A${f(s.r)} ${f(s.r)} 0 ${s.a1 - s.a0 > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
  }
  const p = s.pts;
  if (s.smooth && p.length > 2) {
    let d = `M${f(p[0][0])} ${f(p[0][1])}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(p.length - 1, i + 2)];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }
  let d = '';
  for (let i = 0; i < p.length; i++) d += `${i ? 'L' : 'M'}${f(p[i][0])} ${f(p[i][1])}`;
  return s.closed ? d + 'Z' : d;
}

/** Чистый стиль: штрихи одной толщины сливаются в один путь. */
function cleanRun(run: Shape[]): string {
  const byW = new Map<number, string>();
  let fills = '';
  for (const s of run) {
    if (s.t !== 'a' && s.fill === 'ink') {
      fills += pathOf(s);
      continue;
    }
    if (!s.w) continue;
    const w = Math.round(s.w * 100) / 100;
    byW.set(w, (byW.get(w) ?? '') + pathOf(s));
  }
  let out = '';
  for (const [w, d] of byW) out += `<path d="${d}" stroke-width="${w}"/>`;
  if (fills) out += `<path d="${fills}" fill="currentColor" stroke="none"/>`;
  return out;
}

export interface RenderOpts {
  mode: 'clean' | 'chalk';
  rough: number;
  seed: string;
  /** префикс id, уникальный в пределах документа */
  idp: string;
}

const isBg = (s: Shape): boolean => s.t !== 'a' && s.fill === 'bg';
const BIG = 4000;

/**
 * Фигуры → разметка. Заливка «фоном» реализована маской: всё нарисованное раньше
 * вырезается под фигурой, поэтому экспорт с прозрачным фоном остаётся честным.
 */
export function renderShapes(shapes: Shape[], o: RenderOpts): { body: string; defs: string } {
  let body = '';
  let defs = '';
  let run: Shape[] = [];
  let masks = 0;
  let runs = 0;
  const flush = (): void => {
    if (!run.length) return;
    body += o.mode === 'chalk' ? chalkRun(run, makeRng(`${o.seed}/chalk/${runs}`), o.rough) : cleanRun(run);
    runs++;
    run = [];
  };

  for (let i = 0; i < shapes.length; ) {
    if (!isBg(shapes[i])) {
      run.push(shapes[i++]);
      continue;
    }
    flush();
    const batch: Shape[] = [];
    while (i < shapes.length && isBg(shapes[i])) batch.push(shapes[i++]);
    const id = `${o.idp}m${masks++}`;
    defs +=
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="${-BIG}" y="${-BIG}" width="${BIG * 2}" height="${BIG * 2}">` +
      `<rect x="${-BIG}" y="${-BIG}" width="${BIG * 2}" height="${BIG * 2}" fill="#fff" stroke="none"/>` +
      `<path d="${batch.map(pathOf).join('')}" fill="#000" stroke="none"/></mask>`;
    body = `<g mask="url(#${id})">${body}</g>`;
    for (const b of batch) run.push({ ...b, fill: 'none' } as Shape);
  }
  flush();
  return { body, defs };
}
