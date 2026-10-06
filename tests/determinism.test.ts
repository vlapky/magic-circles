import { describe, expect, it } from 'vitest';
import { BeatDetector, readBands } from '../src/anim/beat';
import { Motion, motionPlan, tempoBeat, tempoSignals } from '../src/anim/motion';
import { encodeWav } from '../src/audio/wav';
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

describe('анимация', () => {
  const settings = { rot: 100, pulse: 100, flicker: 100, glow: 100, pattern: 0, still: [] as string[] };

  it('послойная разметка помечает слои и их маски, обычная — нет', () => {
    const c = defaultConfig();
    const layered = circleSvg(c, 'a', { layered: true });
    for (const id of ['outerRing', 'polygram', 'innerRing', 'nodes', 'center']) expect(layered).toContain(`data-layer="${id}"`);
    expect(layered).toContain('data-mask="innerRing"');
    expect(layered).toContain('data-mask="nodes"');
    expect(layered).not.toContain('data-layer="petals"');
    expect(circleSvg(c, 'a')).not.toContain('data-layer');
  });

  it('малые круги на вершинах движутся вместе с полиграммой', () => {
    const c = defaultConfig();
    const plan = motionPlan(c, 0);
    expect(plan.nodes?.follow).toBe('polygram');
    const m = new Motion();
    let frame = m.step(0.016, tempoSignals(0, 120), settings, plan);
    for (let i = 1; i < 90; i++) frame = m.step(0.016, tempoSignals(i * 0.016, 120), settings, plan);
    expect(frame.layers.nodes?.rot).toBe(frame.layers.polygram?.rot);
    expect(frame.layers.nodes?.scale).toBe(frame.layers.polygram?.scale);
    expect(frame.layers.polygram?.rot).not.toBe(0);
    // кольца вращаются навстречу друг другу
    expect(frame.layers.outerRing!.rot).toBeLessThan(180);
    expect(frame.layers.innerRing!.rot).toBeGreaterThan(180);
  });

  it('удар даёт пульс и вспышку, а между ударами они затухают', () => {
    const plan = motionPlan(defaultConfig(), 0);
    const on = new Motion().step(0.016, tempoSignals(0, 120), settings, plan);
    const off = new Motion().step(0.016, tempoSignals(0.45, 120), settings, plan);
    expect(on.layers.center!.scale).toBeGreaterThan(off.layers.center!.scale);
    expect(on.glow).toBeGreaterThan(off.glow);
    expect(off.layers.center!.scale).toBeGreaterThanOrEqual(1);
  });

  it('остановленный слой и нулевые силы не двигают круг', () => {
    const plan = motionPlan(defaultConfig(), 0);
    const still = new Motion().step(0.5, tempoSignals(0, 120), { ...settings, still: ['outerRing'] }, plan);
    expect(still.layers.outerRing).toEqual({ rot: 0, scale: 1, opacity: 1 });
    const zero = new Motion().step(0.5, tempoSignals(0, 120), { rot: 0, pulse: 0, flicker: 0, glow: 0, pattern: 0, still: [] }, plan);
    for (const pose of Object.values(zero.layers)) expect(pose).toEqual({ rot: 0, scale: 1, opacity: 1 });
    expect(zero.glow).toBe(1);
  });

  it('рисунок движения воспроизводим и меняется от зерна', () => {
    const c = defaultConfig();
    expect(motionPlan(c, 7)).toEqual(motionPlan(c, 7));
    const differs = [1, 2, 3, 4, 5].some((p) => JSON.stringify(motionPlan(c, p)) !== JSON.stringify(motionPlan(c, 0)));
    expect(differs).toBe(true);
  });

  it('свой темп отсчитывает удары', () => {
    expect(tempoBeat(0, 120)).toBe(0);
    expect(tempoBeat(0.49, 120)).toBe(0);
    expect(tempoBeat(0.51, 120)).toBe(1);
    expect(tempoBeat(60, 100)).toBe(100);
  });

  it('детектор находит удары в ровном бите и молчит на тишине и ровном гуле', () => {
    const run = (bass: (t: number) => number): number => {
      const d = new BeatDetector();
      let hits = 0;
      const dt = 1 / 60;
      for (let i = 0; i < 60 * 10; i++) if (d.update(bass(i * dt), i * dt, dt, 0.5)) hits++;
      return hits;
    };
    // 120 уд/мин: короткий всплеск баса дважды в секунду на фоне тихого гула
    const kicks = run((t) => 0.15 + 0.7 * Math.exp(-12 * (t * 2 - Math.floor(t * 2))));
    expect(kicks).toBeGreaterThanOrEqual(18);
    expect(kicks).toBeLessThanOrEqual(21);
    expect(run(() => 0)).toBe(0);
    expect(run(() => 0.6)).toBe(0);
    // басовая нота между бочками слабее удара и ударом не считается
    const withBassNotes = run((t) => {
      const beat = t * 2 - Math.floor(t * 2);
      const off = beat >= 0.5 ? 0.3 * Math.exp(-10 * (beat - 0.5)) : 0;
      return 0.15 + 0.7 * Math.exp(-12 * beat) + off;
    });
    expect(withBassNotes).toBeGreaterThanOrEqual(18);
    expect(withBassNotes).toBeLessThanOrEqual(21);
  });

  it('полосы спектра разделяют бас и верх', () => {
    const spectrum = new Uint8Array(1024);
    const binHz = 44100 / 2048;
    // полоса баса включает бин, накрывающий её верхнюю границу, поэтому заполняем с запасом
    for (let i = 0; i < spectrum.length; i++) spectrum[i] = i * binHz < 200 ? 255 : 0;
    const b = readBands(spectrum, 44100, 2048);
    expect(b.bass).toBe(1);
    expect(b.treble).toBe(0);
    expect(b.mid).toBe(0);
  });

  it('WAV получает верный заголовок и чередует каналы', () => {
    const buf = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 2])], 44100);
    const v = new DataView(buf);
    const tag = (o: number): string => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(buf.byteLength).toBe(44 + 3 * 2 * 2);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(16384);
    expect(v.getInt16(48, true)).toBe(32767);
    // значения вне −1…1 обрезаются
    expect(v.getInt16(54, true)).toBe(32767);
  });
});
