import type { AlphabetId } from '../core/config';
import { arc, circle, line, poly, smooth, type Pt, type Shape } from '../core/ir';
import { cyrb53, makeRng, type Rng } from '../core/rng';
import { LATIN_CHARS, latinGlyph } from './latin';

/**
 * Глиф в единичной клетке: x ∈ [-0.5, 0.5], y ∈ [-0.7, 0.7], верх — отрицательный y.
 * Толщина штриха относительная (1 = обычная), итоговая задаётся при размещении.
 */
export type Glyph = Shape[];

const GX = [-0.5, 0, 0.5];
const GY = [-0.7, 0, 0.7];

/** Разделитель слов — залитый ромб, как в образце. */
export const SEP: Glyph = [poly([[0, -0.28], [0.21, 0], [0, 0.28], [-0.21, 0]], 0, true, 'ink')];

// Угловатые руны на сетке 3×3: 2–3 коротких ломаных, иногда ствол, кружок, точка.
function runic(rng: Rng): Glyph {
  const g: Glyph = [];
  if (rng.chance(0.5)) {
    const x = rng.pick(GX);
    g.push(line(x, -0.7, x, 0.7, 1));
  }
  const strokes = rng.int(2, 3);
  for (let s = 0; s < strokes; s++) {
    let cx = rng.int(0, 2);
    let cy = rng.int(0, 2);
    const pts: Pt[] = [[GX[cx], GY[cy]]];
    const len = rng.int(1, 2);
    for (let i = 0; i < len; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const nx = Math.min(2, Math.max(0, cx + rng.int(-1, 1)));
        const ny = Math.min(2, Math.max(0, cy + rng.int(-1, 1)));
        if (nx !== cx || ny !== cy) {
          cx = nx;
          cy = ny;
          pts.push([GX[cx], GY[cy]]);
          break;
        }
      }
    }
    if (pts.length > 1) g.push(poly(pts, 1));
  }
  if (rng.chance(0.3)) g.push(circle(rng.pick(GX), rng.pick(GY), 0.22, 1));
  if (rng.chance(0.25)) g.push(circle(rng.pick(GX), rng.pick(GY), 0.15, 0, 'ink'));
  return g;
}

// Блочные знаки: перекладины, рамки, наклонные ноги.
function block(rng: Rng): Glyph {
  const g: Glyph = [];
  const W = 1.25;
  if (rng.chance(0.7)) {
    const y = rng.pick([-0.7, -0.3]);
    g.push(line(-0.5, y, 0.5, y, W));
  }
  switch (rng.int(0, 4)) {
    case 0:
      g.push(poly([[-0.36, -0.3], [0.36, -0.3], [0.36, 0.4], [-0.36, 0.4]], W, true));
      break;
    case 1:
      g.push(poly([[-0.4, -0.7], [-0.4, 0.35], [0.4, 0.35], [0.4, -0.7]], W));
      break;
    case 2:
      g.push(poly([[0, -0.5], [0.45, 0.5], [-0.45, 0.5]], W, true));
      break;
    case 3:
      g.push(line(-0.3, -0.7, -0.3, 0.7, W), line(0.3, -0.7, 0.3, 0.3, W));
      break;
    default:
      g.push(line(0, -0.7, 0, 0.7, W));
  }
  if (rng.chance(0.55)) {
    const sx = rng.pick([-1, 1]);
    g.push(line(rng.pick([0, 0.3]) * sx, rng.pick([-0.1, 0.2]), 0.5 * sx, 0.7, W));
  }
  if (rng.chance(0.5)) {
    const y = rng.pick([0.05, 0.7]);
    g.push(line(-0.36, y, 0.36, y, W));
  }
  if (rng.chance(0.2)) g.push(circle(rng.pick([-0.5, 0.5]), rng.pick([-0.5, 0.55]), 0.13, 0, 'ink'));
  return g;
}

// Сигилы: ствол с перекладинами, кольцами, навершием и крюком.
function sigil(rng: Rng): Glyph {
  const g: Glyph = [];
  const ringTop = rng.chance(0.35);
  const ringBot = !ringTop && rng.chance(0.28);
  const y0 = ringTop ? -0.36 : -0.7;
  const y1 = ringBot ? 0.36 : 0.7;
  g.push(line(0, y0, 0, y1, 1));
  if (ringTop) g.push(circle(0, -0.53, 0.17, 1));
  if (ringBot) g.push(circle(0, 0.53, 0.17, 1));

  const slots = [-0.42, -0.14, 0.14, 0.42].filter((y) => y > y0 + 0.05 && y < y1 - 0.05);
  const bars = Math.min(slots.length, rng.int(1, 3));
  for (let i = 0; i < bars; i++) {
    const y = slots.splice(rng.int(0, slots.length - 1), 1)[0];
    let l = rng.pick([0, 0.25, 0.45]);
    const r = rng.pick([0, 0.25, 0.45]);
    if (l + r === 0) l = 0.35;
    g.push(line(-l, y, r, y, 1));
    if (r > 0 && rng.chance(0.25)) g.push(line(r, y, r, y + 0.2, 1));
    if (l > 0 && rng.chance(0.2)) g.push(circle(-l - 0.1, y, 0.1, 1));
  }
  if (!ringTop) {
    const cap = rng.int(0, 3);
    if (cap === 1) g.push(poly([[-0.35, -0.7], [0, -0.42], [0.35, -0.7]], 1));
    if (cap === 2) g.push(arc(0, -0.7, 0.3, 0, Math.PI, 1));
    if (cap === 3) g.push(line(-0.3, -0.7, 0.3, -0.7, 1));
  }
  if (!ringBot) {
    const foot = rng.int(0, 3);
    if (foot === 1) g.push(smooth([[0, 0.7], [0.22, 0.7], [0.4, 0.52], [0.36, 0.34]], 1));
    if (foot === 2) g.push(poly([[-0.32, 0.7], [0, 0.44], [0.32, 0.7]], 1));
    if (foot === 3) g.push(line(-0.3, 0.7, 0.3, 0.7, 1));
  }
  if (rng.chance(0.2)) g.push(circle(rng.pick([-0.38, 0.38]), rng.pick([-0.3, 0, 0.3]), 0.1, 0, 'ink'));
  return g;
}

/** Завиток: спираль, сходящаяся к центру. */
function curl(cx: number, cy: number, r: number, a0: number, turns: number, dir: number): Pt[] {
  const out: Pt[] = [];
  const n = Math.ceil(turns * 7);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + dir * t * turns * Math.PI * 2;
    const rr = r * (1 - 0.82 * t);
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

// Вязь: плавные росчерки нескольких типов — волна, спираль, крюк, арка, петля, зигзаг.
function cursive(rng: Rng): Glyph {
  let pts: Pt[];
  switch (rng.int(0, 5)) {
    case 0: {
      // волна с завитком на конце
      pts = [[rng.range(-0.4, 0.4), -0.7]];
      const n = rng.int(2, 3);
      let x = 0;
      let y = -0.7;
      for (let i = 1; i <= n; i++) {
        x = (i % 2 ? 1 : -1) * rng.range(0.28, 0.5);
        y = -0.7 + (1.15 * i) / n;
        pts.push([x, y]);
      }
      const dir = x > 0 ? -1 : 1;
      pts.push(...curl(x + dir * 0.2, y, 0.2, dir > 0 ? Math.PI : 0, 0.8, -dir).slice(1));
      break;
    }
    case 1:
      // большая спираль
      pts = curl(rng.range(-0.06, 0.06), rng.range(-0.1, 0.1), 0.5, rng.range(0, 6.28), rng.range(1.3, 1.9), 1).map(([x, y]): Pt => [x, y * 1.3]);
      break;
    case 2: {
      // крюк с флажком
      const x0 = rng.range(-0.25, 0.05);
      pts = [...curl(x0 - 0.18, -0.52, 0.18, 0, 0.7, -1).reverse(), [x0, 0.3], [x0 + 0.22, 0.68], [x0 + 0.48, 0.42]];
      break;
    }
    case 3: {
      // арка с завитком внутрь
      const top = rng.range(-0.7, -0.5);
      pts = [[-0.42, 0.7], [-0.42, -0.15], [0, top], [0.42, -0.15], [0.42, 0.4]];
      pts.push(...curl(0.24, 0.4, 0.18, 0, 0.75, 1).slice(1));
      break;
    }
    case 4: {
      // ствол с петлёй наверху
      const r = rng.range(0.22, 0.3);
      pts = [[rng.range(-0.3, 0.3), 0.7], [0, 0.1]];
      for (let i = 0; i <= 7; i++) {
        const a = Math.PI / 2 + (i / 7) * Math.PI * 1.75;
        pts.push([Math.cos(a) * r, -0.7 + r + Math.sin(a) * r]);
      }
      pts.push([0.42, rng.range(-0.1, 0.25)]);
      break;
    }
    default:
      // мягкий зигзаг
      pts = [[-0.4, -0.66], [0.4, -0.7], [-0.15, rng.range(-0.15, 0.05)], [0.4, 0.25], [0.12, 0.7], [-0.38, 0.5]];
  }
  if (rng.chance(0.5)) pts = pts.map(([x, y]): Pt => [-x, y]);
  if (rng.chance(0.35)) pts = pts.map(([x, y]): Pt => [x, -y]);
  pts = pts.map(([x, y]): Pt => [Math.max(-0.52, Math.min(0.52, x)), Math.max(-0.72, Math.min(0.72, y))]);

  const g: Glyph = [smooth(pts, 1.15)];
  if (rng.chance(0.3)) {
    const ty = rng.range(-0.3, 0.3);
    g.push(line(-0.3, ty + 0.08, 0.3, ty - 0.08, 1));
  }
  if (rng.chance(0.3)) g.push(circle(rng.pick([-0.42, 0.42]), rng.pick([-0.6, 0.6]), 0.11, 0, 'ink'));
  if (rng.chance(0.15)) g.push(circle(rng.pick([-0.4, 0.4]), rng.range(-0.2, 0.2), 0.13, 1));
  return g;
}

/** Глиф должен занимать клетку, а не быть одиноким коротким штрихом. */
function fillsCell(g: Glyph): boolean {
  let x0 = 1;
  let x1 = -1;
  let y0 = 1;
  let y1 = -1;
  for (const s of g) {
    const pts: Pt[] = s.t === 'p' ? s.pts : [[s.x - s.r, s.y - s.r], [s.x + s.r, s.y + s.r]];
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return x1 - x0 >= 0.45 && y1 - y0 >= 1.0;
}

const GEN: Record<Exclude<AlphabetId, 'latin'>, (rng: Rng) => Glyph> = { runic, block, sigil, cursive };
const SIZE = 28;
const cache = new Map<string, Glyph[]>();

/** Алфавит — детерминированный набор глифов от «варианта письма». */
export function getAlphabet(id: AlphabetId, variant: number): Glyph[] {
  if (id === 'latin') {
    let lat = cache.get('latin');
    if (!lat) {
      lat = [...LATIN_CHARS].map((ch) => latinGlyph(ch)!);
      cache.set('latin', lat);
    }
    return lat;
  }
  const key = `${id}:${variant}`;
  let a = cache.get(key);
  if (!a) {
    const rng = makeRng(`alphabet/${key}`);
    a = [];
    const seen = new Set<string>();
    while (a.length < SIZE) {
      const g = GEN[id](rng);
      const sig = JSON.stringify(g);
      if (g.length === 0 || seen.has(sig) || !fillsCell(g)) continue;
      seen.add(sig);
      a.push(g);
    }
    cache.set(key, a);
  }
  return a;
}

/** Стабильное отображение символа фразы в номер глифа. */
export const charIndex = (ch: string, n: number): number => cyrb53(ch) % n;
