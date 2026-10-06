import { makeRng } from './rng';
import { starSteps } from './geom';

export type AlphabetId = 'runic' | 'block' | 'sigil' | 'cursive' | 'latin';
export const ALPHABETS: [AlphabetId, string][] = [
  ['runic', 'Руны'],
  ['block', 'Блочные знаки'],
  ['sigil', 'Сигилы'],
  ['cursive', 'Вязь'],
  ['latin', 'Латиница'],
];

export type SymCat = 'planets' | 'elements' | 'alchemy' | 'seals' | 'signs';
export const SYM_CATS: [SymCat, string][] = [
  ['planets', 'Планеты'],
  ['elements', 'Стихии'],
  ['alchemy', 'Алхимия'],
  ['seals', 'Печати'],
  ['signs', 'Знаки'],
];

export type MirrorMode = 'none' | 'v' | 'both';

export interface StyleCfg {
  mode: 'clean' | 'chalk';
  weight: number;
  rough: number;
}

export interface ColorCfg {
  ink: string;
  bg: string;
  glow: boolean;
  glowLinked: boolean;
  glowColor: string;
  glowStrength: number;
  glowRadius: number;
  halo: boolean;
  transparent: boolean;
}

export interface Layers {
  outerRing: {
    on: boolean;
    bands: number;
    alphabet: AlphabetId;
    density: number;
    cells: boolean;
    ticks: boolean;
    flip: boolean;
    reverse: boolean;
  };
  polygram: {
    on: boolean;
    n: number;
    k: number;
    mode: 'polygon' | 'star' | 'both';
    nested: number;
    twist: number;
    double: boolean;
    circum: boolean;
    flip: boolean;
    rotation: number;
    mirrorCopy: boolean;
  };
  nodes: {
    on: boolean;
    place: 'vertices' | 'mids' | 'orbit';
    count: number;
    orbit: number;
    r: number;
    double: boolean;
    content: 'symbol' | 'glyph' | 'none';
    radial: boolean;
  };
  petals: {
    on: boolean;
    type: 'vertex' | 'arch' | 'leaf';
    count: number;
    span: number;
    depth: number;
    double: boolean;
    text: boolean;
  };
  rosette: {
    on: boolean;
    type: 'circles' | 'chords' | 'flower';
    count: number;
    radius: number;
    size: number;
  };
  innerRing: {
    on: boolean;
    radius: number;
    band: boolean;
    alphabet: AlphabetId;
    ticks: boolean;
    fillBg: boolean;
  };
  center: {
    on: boolean;
    type: 'dot' | 'symbol' | 'seal' | 'eye' | 'polygram' | 'rings';
    size: number;
  };
  rays: {
    on: boolean;
    count: number;
    from: number;
    extend: number;
    ends: 'none' | 'cross' | 'dot' | 'arrow' | 'symbol';
    offset: boolean;
  };
  edgeText: {
    on: boolean;
    alphabet: AlphabetId;
    size: number;
  };
  outside: {
    on: boolean;
    count: number;
    content: 'symbol' | 'glyph';
    dist: number;
    size: number;
    ringed: boolean;
    offset: boolean;
  };
  spiral: {
    on: boolean;
    alphabet: AlphabetId;
    turns: number;
    start: number;
    size: number;
  };
}

export type LayerId = keyof Layers;

export interface CircleConfig {
  v: 1;
  seed: string;
  phrase: string;
  textMode: 'seed' | 'phrase';
  script: { variant: number; symbols: Record<SymCat, boolean> };
  style: StyleCfg;
  color: ColorCfg;
  mirror: MirrorMode;
  layers: Layers;
}

export const PALETTES: { name: string; ink: string; bg: string }[] = [
  { name: 'Киноварь', ink: '#ff5b4a', bg: '#06090d' },
  { name: 'Золото', ink: '#f2c14e', bg: '#0a0806' },
  { name: 'Лазурь', ink: '#5fd4ff', bg: '#050a14' },
  { name: 'Мел', ink: '#f1efe6', bg: '#0b0b0c' },
  { name: 'Аметист', ink: '#c58bff', bg: '#0a0612' },
  { name: 'Изумруд', ink: '#5dffa0', bg: '#04100a' },
];

export function defaultConfig(): CircleConfig {
  return {
    v: 1,
    seed: 'arcanum',
    phrase: '',
    textMode: 'phrase',
    script: {
      variant: 7,
      symbols: { planets: true, elements: true, alchemy: true, seals: false, signs: false },
    },
    style: { mode: 'clean', weight: 1, rough: 1 },
    color: {
      ink: '#ff5b4a',
      bg: '#06090d',
      glow: true,
      glowLinked: true,
      glowColor: '#ff5b4a',
      glowStrength: 1,
      glowRadius: 3,
      halo: true,
      transparent: false,
    },
    mirror: 'none',
    layers: {
      outerRing: { on: true, bands: 1, alphabet: 'runic', density: 1, cells: false, ticks: false, flip: false, reverse: false },
      polygram: { on: true, n: 8, k: 2, mode: 'both', nested: 0, twist: 1, double: false, circum: true, flip: false, rotation: 0, mirrorCopy: false },
      nodes: { on: true, place: 'vertices', count: 6, orbit: 0.6, r: 26, double: true, content: 'symbol', radial: false },
      petals: { on: false, type: 'arch', count: 6, span: 1, depth: 0.8, double: true, text: false },
      rosette: { on: false, type: 'circles', count: 6, radius: 0.7, size: 0.5 },
      innerRing: { on: true, radius: 0.76, band: true, alphabet: 'runic', ticks: false, fillBg: true },
      center: { on: true, type: 'symbol', size: 0.6 },
      rays: { on: false, count: 4, from: 1, extend: 40, ends: 'cross', offset: false },
      edgeText: { on: false, alphabet: 'runic', size: 7 },
      outside: { on: false, count: 4, content: 'symbol', dist: 36, size: 14, ringed: false, offset: true },
      spiral: { on: false, alphabet: 'cursive', turns: 3, start: 0.95, size: 9 },
    },
  };
}

/** Подтягивает недостающие поля из значений по умолчанию (старые сохранения). */
export function normalizeConfig(raw: unknown): CircleConfig {
  const merge = (base: unknown, over: unknown): unknown => {
    if (base === null || typeof base !== 'object' || Array.isArray(base)) return over === undefined ? base : over;
    const out: Record<string, unknown> = {};
    const o = over && typeof over === 'object' ? (over as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(base as Record<string, unknown>)) out[k] = merge(v, o[k]);
    return out;
  };
  return merge(defaultConfig(), raw) as CircleConfig;
}

export const cloneConfig = (c: CircleConfig): CircleConfig => JSON.parse(JSON.stringify(c)) as CircleConfig;

export interface Locks {
  layers: boolean;
  script: boolean;
  style: boolean;
  color: boolean;
}

const round = (v: number, step: number): number => Math.round(v / step) * step;

/** Структура круга, целиком выведенная из сида. Заблокированные группы берутся из prev. */
export function randomizeConfig(prev: CircleConfig, seed: string, locks: Locks): CircleConfig {
  const rng = makeRng(`${seed}/config`);
  const c = cloneConfig(prev);
  c.seed = seed;
  const abc = (): AlphabetId => rng.weighted<AlphabetId>([
    ['runic', 4],
    ['block', 2],
    ['sigil', 3],
    ['cursive', 3],
    ['latin', 1],
  ]);

  // потоки слоёв и остальных групп независимы: замок на одной группе не меняет другую
  const rs = makeRng(`${seed}/config/script`);
  const rc = makeRng(`${seed}/config/color`);
  const rt = makeRng(`${seed}/config/style`);

  if (!locks.layers) {
    const L = c.layers;
    const n = rng.weighted([
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
      [7, 2],
      [8, 2],
      [9, 1],
      [10, 1],
      [12, 1],
    ]);
    const steps = starSteps(n);

    L.outerRing = {
      on: rng.chance(0.85),
      bands: rng.weighted([
        [1, 6],
        [2, 3],
        [3, 1],
      ]),
      alphabet: abc(),
      density: round(rng.range(0.8, 1.2), 0.05),
      cells: rng.chance(0.15),
      ticks: rng.chance(0.25),
      flip: rng.chance(0.2),
      reverse: rng.chance(0.2),
    };
    L.polygram = {
      on: rng.chance(0.85),
      n,
      k: steps.length ? rng.pick(steps) : 2,
      mode: steps.length ? rng.weighted([['polygon', 3], ['star', 3], ['both', 3]] as const) : 'polygon',
      nested: rng.weighted([
        [0, 5],
        [1, 3],
        [2, 2],
        [3, 1],
      ]),
      twist: rng.chance(0.75) ? 1 : 0,
      double: rng.chance(0.25),
      circum: rng.chance(0.7),
      flip: rng.chance(0.2),
      rotation: 0,
      mirrorCopy: false,
    };
    if (rng.chance(0.12)) {
      L.polygram.rotation = round(rng.range(4, 180 / n - 2), 1);
      L.polygram.mirrorCopy = rng.chance(0.7);
    }
    L.nodes = {
      on: rng.chance(0.45),
      place: rng.weighted([['vertices', 5], ['mids', 2], ['orbit', 2]] as const),
      count: rng.pick([3, 4, 5, 6, 8]),
      orbit: round(rng.range(0.4, 0.8), 0.02),
      r: rng.int(14, 30),
      double: rng.chance(0.6),
      content: rng.weighted([['symbol', 6], ['glyph', 2], ['none', 1]] as const),
      radial: rng.chance(0.2),
    };
    L.petals = {
      on: rng.chance(0.3),
      type: rng.pick(['vertex', 'arch', 'leaf'] as const),
      count: rng.chance(0.7) ? n : rng.pick([n * 2, 6, 8, 12]),
      span: rng.int(1, 2),
      depth: round(rng.range(0.5, 1), 0.05),
      double: rng.chance(0.5),
      text: rng.chance(0.3),
    };
    L.rosette = {
      on: rng.chance(0.25),
      type: rng.pick(['circles', 'chords', 'flower'] as const),
      count: rng.chance(0.6) ? n : rng.pick([6, 8, 9, 12]),
      radius: round(rng.range(0.45, 1), 0.05),
      size: round(rng.range(0.3, 0.55), 0.05),
    };
    L.innerRing = {
      on: rng.chance(0.6),
      radius: round(rng.range(0.42, 0.8), 0.02),
      band: rng.chance(0.7),
      alphabet: abc(),
      ticks: rng.chance(0.2),
      fillBg: rng.chance(0.7),
    };
    L.center = {
      on: rng.chance(0.88),
      type: rng.weighted([['dot', 2], ['symbol', 4], ['seal', 2], ['eye', 1], ['polygram', 2], ['rings', 2]] as const),
      size: round(rng.range(0.45, 0.9), 0.05),
    };
    L.rays = {
      on: rng.chance(0.3),
      count: rng.chance(0.6) ? n : rng.pick([4, 6, 8]),
      from: rng.chance(0.7) ? 1 : 0,
      extend: rng.int(18, 60),
      ends: rng.pick(['none', 'cross', 'dot', 'arrow', 'symbol'] as const),
      offset: rng.chance(0.3),
    };
    L.edgeText = {
      on: L.polygram.on && L.polygram.mode !== 'star' && n <= 8 && rng.chance(0.25),
      alphabet: abc(),
      size: rng.int(6, 9),
    };
    L.outside = {
      on: rng.chance(0.2),
      count: rng.chance(0.6) ? n : 4,
      content: rng.pick(['symbol', 'glyph'] as const),
      dist: rng.int(28, 50),
      size: rng.int(10, 18),
      ringed: rng.chance(0.4),
      offset: rng.chance(0.5),
    };
    L.spiral = { on: rng.chance(0.04), alphabet: abc(), turns: rng.int(2, 4), start: 0.95, size: rng.int(7, 10) };
    c.mirror = rng.weighted([['none', 5], ['v', 4], ['both', 2]] as const);
  }

  if (!locks.script) {
    c.script.variant = rs.int(0, 999);
    const s = c.script.symbols;
    s.planets = rs.chance(0.6);
    s.elements = rs.chance(0.5);
    s.alchemy = rs.chance(0.6);
    s.seals = rs.chance(0.35);
    s.signs = rs.chance(0.35);
    if (!Object.values(s).some(Boolean)) s.alchemy = true;
  }

  if (!locks.color) {
    const p = rc.pick(PALETTES);
    c.color.ink = p.ink;
    c.color.bg = p.bg;
    c.color.glowLinked = true;
    c.color.glowColor = p.ink;
    c.color.glow = rc.chance(0.8);
    c.color.glowStrength = round(rc.range(0.7, 1.6), 0.1);
    c.color.glowRadius = round(rc.range(2, 5), 0.5);
    c.color.halo = rc.chance(0.7);
  }

  if (!locks.style) {
    c.style.mode = rt.chance(0.3) ? 'chalk' : 'clean';
    c.style.weight = round(rt.range(0.85, 1.25), 0.05);
    c.style.rough = round(rt.range(0.7, 1.4), 0.1);
  }

  return c;
}
