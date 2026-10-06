import type { AlphabetId, MirrorMode } from '../core/config';
import { TAU, TOP, polar } from '../core/geom';
import { xform, type Pt, type Shape } from '../core/ir';
import { subRng } from '../core/rng';
import { LW, type Ctx } from '../layers/ctx';
import { SEP, charIndex, getAlphabet, type Glyph } from './alphabets';
import { LATIN_CHARS, toLatin } from './latin';
import type { Sym } from './symbols';

/** Отношение шага глифов к их ширине (в образце ≈ 1.6). */
const ADVANCE = 1.6;

/**
 * Симметричная позиция для слота i из N: зеркальные слоты получают один и тот же
 * глиф, отражённый по горизонтали.
 */
export function canon(i: number, N: number, mode: MirrorMode): { j: number; flip: boolean } {
  let j = ((i % N) + N) % N;
  let flip = false;
  if (mode !== 'none' && j > N / 2) {
    j = N - j;
    flip = !flip;
  }
  // вторая ось есть только при чётном N — иначе зеркальный слот не целый
  if (mode === 'both' && N % 2 === 0 && j > N / 4) {
    j = N / 2 - j;
    flip = !flip;
  }
  return { j, flip };
}

/** Последовательность глифов длины len: шифр фразы либо «слова» от сида. */
export function sequence(ctx: Ctx, key: string, len: number, alphabet: AlphabetId): Glyph[] {
  const abc = getAlphabet(alphabet, ctx.cfg.script.variant);
  const out: Glyph[] = [];
  const phrase = ctx.cfg.textMode === 'phrase' ? ctx.cfg.phrase.trim() : '';
  if (phrase) {
    const text = alphabet === 'latin' ? toLatin(phrase) : phrase.toLowerCase().replace(/\s+/g, ' ');
    const chars = [...text, ' '];
    if (chars.length > 1) {
      for (let i = 0; out.length < len; i++) {
        const ch = chars[i % chars.length];
        if (ch === ' ') out.push(SEP);
        else if (alphabet === 'latin') out.push(abc[Math.max(0, LATIN_CHARS.indexOf(ch))]);
        else out.push(abc[charIndex(ch, abc.length)]);
      }
      return out;
    }
  }
  const rng = subRng(ctx.seed, `text/${key}`);
  let word = rng.int(2, 6);
  while (out.length < len) {
    if (word === 0) {
      out.push(SEP);
      word = rng.int(2, 6);
    } else {
      out.push(rng.pick(abc));
      word--;
    }
  }
  return out;
}

export interface ArcTextOpts {
  cx?: number;
  cy?: number;
  r: number;
  /** ширина глифа */
  size: number;
  alphabet: AlphabetId;
  key: string;
  density?: number;
  /** верх глифа смотрит в центр */
  flip?: boolean;
  /** против часовой */
  reverse?: boolean;
  /** для дуги: диапазон углов; без него — полный круг от верха */
  a0?: number;
  a1?: number;
}

/** Сколько глифов помещается на полном кольце. */
export function ringSlots(r: number, size: number, density: number, mirror: MirrorMode): number {
  let n = Math.max(4, Math.round((TAU * r) / ((size * ADVANCE) / density)));
  if (mirror === 'v') n += n % 2;
  if (mirror === 'both') n = Math.ceil(n / 4) * 4;
  return n;
}

function place(g: Glyph, p: Pt, rot: number, size: number, w: number, flipX: boolean): Shape[] {
  return xform(g, { x: p[0], y: p[1], rot, scale: size, flipX, wMul: w });
}

/** Письмо по полному кольцу (с учётом зеркалирования) или по дуге. */
export function arcText(ctx: Ctx, o: ArcTextOpts): Shape[] {
  const { cx = 0, cy = 0, r, size, density = 1 } = o;
  const w = LW.glyph * ctx.W * Math.min(1, size / 10.8 + 0.15);
  const out: Shape[] = [];
  const full = o.a0 === undefined || o.a1 === undefined;
  const dir = o.reverse ? -1 : 1;
  const extra = o.flip ? Math.PI : 0;

  if (full) {
    const mirror = ctx.cfg.mirror;
    const N = ringSlots(r, size, density, mirror);
    const seq = sequence(ctx, o.key, N, o.alphabet);
    for (let i = 0; i < N; i++) {
      const { j, flip } = canon(i, N, mirror);
      // на осях симметрии глиф обязан быть симметричным — ставим разделитель
      const onAxis = mirror !== 'none' && (j === 0 || j * 2 === N || (mirror === 'both' && j * 4 === N));
      const a = TOP + (dir * i * TAU) / N;
      const [px, py] = polar(r, a);
      out.push(...place(onAxis ? SEP : seq[j], [cx + px, cy + py], a + Math.PI / 2 + extra, size, w, flip));
    }
    return out;
  }

  const a0 = o.a0!;
  const a1 = o.a1!;
  const span = a1 - a0;
  const N = Math.max(1, Math.floor((Math.abs(span) * r) / ((size * ADVANCE) / density)));
  const seq = sequence(ctx, o.key, N, o.alphabet);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const a = o.reverse ? a1 - span * t : a0 + span * t;
    const [px, py] = polar(r, a);
    out.push(...place(seq[i], [cx + px, cy + py], a + Math.PI / 2 + extra, size, w, false));
  }
  return out;
}

/** Письмо вдоль отрезка; верх глифов смотрит от центра круга. */
export function lineText(ctx: Ctx, A: Pt, B: Pt, o: { size: number; alphabet: AlphabetId; key: string }): Shape[] {
  let a = A;
  let b = B;
  let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  // «верх» глифа после поворота: (sin ang, -cos ang)
  if (Math.sin(ang) * mx - Math.cos(ang) * my < 0) {
    [a, b] = [b, a];
    ang += Math.PI;
  }
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const N = Math.floor(len / (o.size * ADVANCE));
  if (N < 1) return [];
  const seq = sequence(ctx, o.key, N, o.alphabet);
  const w = LW.glyph * ctx.W * Math.min(1, o.size / 10.8 + 0.15);
  const out: Shape[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    out.push(...place(seq[i], [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ang, o.size, w, false));
  }
  return out;
}

/** Письмо по спирали, закручивающейся внутрь. */
export function spiralText(
  ctx: Ctx,
  o: { r0: number; turns: number; size: number; alphabet: AlphabetId; key: string; rMin: number },
): Shape[] {
  const pitch = o.size * 2.4;
  const adv = o.size * ADVANCE;
  const pos: { a: number; r: number }[] = [];
  let a = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const r = o.r0 - (pitch * a) / TAU;
    if (r < o.rMin || a > o.turns * TAU) break;
    pos.push({ a, r });
    a += adv / r;
  }
  const seq = sequence(ctx, o.key, pos.length, o.alphabet);
  const w = LW.glyph * ctx.W * Math.min(1, o.size / 10.8 + 0.15);
  const out: Shape[] = [];
  pos.forEach((p, i) => {
    const ang = TOP + p.a;
    out.push(...place(seq[i], polar(p.r, ang), ang + Math.PI / 2, o.size, w, false));
  });
  return out;
}

/** Размещает символ: size — радиус, w — толщина штриха. */
export function placeSym(sym: Sym, p: Pt, size: number, w: number, rot = 0, flipX = false): Shape[] {
  return xform(sym.shapes, { x: p[0], y: p[1], rot, scale: size, flipX, wMul: w });
}

/** Размещает одиночный глиф: size — ширина. */
export const placeGlyph = (g: Glyph, p: Pt, size: number, w: number, rot = 0, flipX = false): Shape[] =>
  place(g, p, rot, size, w, flipX);
