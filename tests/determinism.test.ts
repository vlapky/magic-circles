import { describe, expect, it } from 'vitest';
import { buildCircle } from '../src/core/build';
import { defaultConfig, normalizeConfig, randomizeConfig, type Locks } from '../src/core/config';
import { mutateConfig, rotateHue } from '../src/core/evolve';
import { cyrb53, makeRng, phraseToSeed } from '../src/core/rng';
import { canon } from '../src/glyphs/text';
import { circleSvg } from '../src/render/compose';
import { systemSvg } from '../src/system/build';
import { applyLayout } from '../src/system/layouts';
import { LAYOUTS, defaultSystem, uid } from '../src/system/types';

const OPEN: Locks = { layers: false, script: false, style: false, color: false };
const fromSeed = (seed: string) => randomizeConfig(defaultConfig(), seed, OPEN);

describe('сид и хэш фразы', () => {
  it('хэш стабилен и не зависит от регистра и лишних пробелов', () => {
    expect(cyrb53('abc')).toBe(cyrb53('abc'));
    expect(phraseToSeed('Огонь  идёт со мной ')).toBe(phraseToSeed('огонь идёт со мной'));
    expect(phraseToSeed('огонь')).not.toBe(phraseToSeed('вода'));
  });

  it('генератор воспроизводим', () => {
    const a = makeRng('k');
    const b = makeRng('k');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('круг', () => {
  it('один и тот же сид даёт побайтно одинаковый SVG в обоих стилях', () => {
    for (const mode of ['clean', 'chalk'] as const) {
      const c = fromSeed('same');
      c.style.mode = mode;
      expect(circleSvg(c, 'a')).toBe(circleSvg(JSON.parse(JSON.stringify(c)), 'a'));
    }
  });

  it('разные сиды дают разные круги', () => {
    expect(circleSvg(fromSeed('one'), 'a')).not.toBe(circleSvg(fromSeed('two'), 'a'));
  });

  it('выключение слоя не меняет знаки остальных слоёв', () => {
    const c = defaultConfig();
    c.color.glow = false;
    const ring = (cfg: typeof c): string => {
      const only = normalizeConfig(JSON.parse(JSON.stringify(cfg)));
      for (const k of Object.keys(only.layers) as (keyof typeof only.layers)[]) only.layers[k].on = k === 'outerRing';
      return JSON.stringify(buildCircle(only));
    };
    const before = ring(c);
    c.layers.nodes.on = false;
    c.layers.center.on = false;
    expect(ring(c)).toBe(before);
  });

  it('замки рандомайзера сохраняют заблокированные группы', () => {
    const base = defaultConfig();
    base.color.ink = '#123456';
    base.style.mode = 'chalk';
    const r = randomizeConfig(base, 'zzz', { layers: false, script: false, style: true, color: true });
    expect(r.color.ink).toBe('#123456');
    expect(r.style.mode).toBe('chalk');
    const l = randomizeConfig(base, 'zzz', { layers: true, script: true, style: false, color: false });
    expect(l.layers).toEqual(base.layers);
  });

  it('любой сид собирается без ошибок и без NaN', () => {
    for (let i = 0; i < 300; i++) {
      const c = fromSeed(`fuzz${i}`);
      if (i % 3 === 0) c.phrase = 'Проверка фразы 42';
      const svg = circleSvg(c, 'f');
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('зеркальные слоты целые при любом числе позиций', () => {
    for (const mode of ['v', 'both'] as const) {
      for (let n = 3; n <= 16; n++) {
        for (let i = 0; i < n; i++) {
          const { j } = canon(i, n, mode);
          expect(Number.isInteger(j)).toBe(true);
          expect(j).toBeGreaterThanOrEqual(0);
          expect(j).toBeLessThan(n);
        }
      }
    }
  });
});

describe('система', () => {
  it('все раскладки собираются и воспроизводимы', () => {
    for (const [layout] of LAYOUTS) {
      const sys = defaultSystem();
      sys.layout = layout;
      sys.frame = 'ring';
      for (let i = 0; i < 6; i++) {
        sys.nodes.push({ id: uid(), name: `n${i}`, config: fromSeed(`n${i}`), x: 0, y: 0, scale: 1, rot: 0, opaque: false });
      }
      applyLayout(sys);
      const a = systemSvg(sys, 's').svg;
      expect(a).toBe(systemSvg(JSON.parse(JSON.stringify(sys)), 's').svg);
      expect(a).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});

describe('эволюция', () => {
  const diff = (a: unknown, b: unknown): number => {
    // число различающихся листьев двух конфигов
    if (a === null || typeof a !== 'object') return a === b ? 0 : 1;
    let n = 0;
    for (const k of Object.keys(a as object)) n += diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
    return n;
  };

  it('потомок воспроизводим и всегда отличается от родителя', () => {
    const parent = fromSeed('evo');
    for (const s of [0, 0.3, 1]) {
      const a = mutateConfig(parent, s, makeRng('m/1'), OPEN);
      const b = mutateConfig(parent, s, makeRng('m/1'), OPEN);
      expect(a).toEqual(b);
      expect(a.changes.length).toBeGreaterThan(0);
      expect(a.config).not.toEqual(parent);
    }
  });

  it('родитель не изменяется', () => {
    const parent = fromSeed('evo');
    const snapshot = JSON.stringify(parent);
    mutateConfig(parent, 1, makeRng('m/2'), OPEN);
    expect(JSON.stringify(parent)).toBe(snapshot);
  });

  it('сила изменений управляет размахом мутаций', () => {
    const avg = (s: number): number => {
      let total = 0;
      for (let i = 0; i < 80; i++) {
        const parent = fromSeed(`p${i % 8}`);
        total += diff(parent, mutateConfig(parent, s, makeRng(`m/${i}`), OPEN).config);
      }
      return total / 80;
    };
    const weak = avg(0);
    const mid = avg(0.5);
    const strong = avg(1);
    expect(weak).toBeLessThan(mid);
    expect(mid).toBeLessThan(strong);
    expect(weak).toBeLessThanOrEqual(2);
  });

  it('при слабой силе слои не включаются и не выключаются', () => {
    for (let i = 0; i < 60; i++) {
      const parent = fromSeed(`q${i}`);
      const child = mutateConfig(parent, 0, makeRng(`m/${i}`), OPEN).config;
      for (const k of Object.keys(parent.layers) as (keyof typeof parent.layers)[]) {
        expect(child.layers[k].on).toBe(parent.layers[k].on);
      }
    }
  });

  it('замки уважаются, а полностью запертый круг не меняется', () => {
    const parent = fromSeed('locked');
    for (let i = 0; i < 40; i++) {
      const c = mutateConfig(parent, 1, makeRng(`m/${i}`), { layers: true, script: true, style: false, color: false }).config;
      expect(c.layers).toEqual(parent.layers);
      expect(c.mirror).toBe(parent.mirror);
      expect(c.seed).toBe(parent.seed);
      expect(c.script).toEqual(parent.script);
    }
    const frozen = mutateConfig(parent, 1, makeRng('m/x'), { layers: true, script: true, style: true, color: true });
    expect(frozen.changes).toEqual([]);
    expect(frozen.config).toEqual(parent);
  });

  it('длинная цепочка поколений остаётся рисуемой', () => {
    let cfg = fromSeed('chain');
    for (let g = 0; g < 150; g++) {
      cfg = mutateConfig(cfg, 0.2 + (g % 5) * 0.2, makeRng(`g/${g}`), OPEN).config;
      expect(circleSvg(cfg, 'c')).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it('поворот оттенка сохраняет формат цвета и обратим с точностью до округления', () => {
    expect(rotateHue('#ff5b4a', 0)).toBe('#ff5b4a');
    expect(rotateHue('#ff5b4a', 120)).toMatch(/^#[0-9a-f]{6}$/);
    const back = rotateHue(rotateHue('#3366cc', 90), -90);
    const ch = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    ch(back).forEach((v, i) => expect(Math.abs(v - ch('#3366cc')[i])).toBeLessThanOrEqual(2));
  });
});
