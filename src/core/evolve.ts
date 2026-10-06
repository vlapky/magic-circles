import { SYM_CATS, cloneConfig, type CircleConfig, type Locks, type MirrorMode } from './config';
import { clamp } from './geom';
import type { Rng } from './rng';
import { LAYERS, sanitize, type Ctl } from './schema';

/**
 * Ген — одно возможное изменение круга. apply меняет конфиг и возвращает подпись
 * изменения либо null, если менять было нечего.
 * impact: 0 — тонкая подстройка, 1 — заметная деталь, 2 — перестройка структуры.
 */
interface Gene {
  impact: 0 | 1 | 2;
  apply: (c: CircleConfig, rng: Rng, s: number) => string | null;
}

type Bag = Record<string, unknown>;

const fix = (v: number): number => +v.toFixed(4);

/** Сдвиг числа в пределах диапазона: размах растёт с силой, но не меньше одного шага. */
function nudge(cur: number, min: number, max: number, step: number, rng: Rng, s: number): number {
  const mag = (max - min) * (0.06 + 0.45 * s) * rng.range(0.5, 1);
  const d = Math.max(step, Math.round(mag / step) * step) * (rng.chance(0.5) ? 1 : -1);
  let v = clamp(cur + d, min, max);
  if (v === cur) v = clamp(cur - d, min, max);
  return fix(Math.round(v / step) * step);
}

// Что перестраивает круг, а что лишь уточняет его.
const STRUCTURAL = new Set(['n', 'type', 'mode', 'place', 'bands']);

function ctlGene(layerTitle: string, bag: Bag, ctl: Ctl): Gene {
  const label = `${layerTitle}: ${ctl.label.toLowerCase()}`;
  if (ctl.k === 'check') {
    return {
      impact: 1,
      apply: () => {
        bag[ctl.p] = !bag[ctl.p];
        return label;
      },
    };
  }
  if (ctl.k === 'range') {
    // целочисленные счётчики (копии, витки, количество) заметнее плавных величин
    const coarse = ctl.step >= 1 && ctl.max - ctl.min <= 16;
    return {
      impact: coarse ? 1 : 0,
      apply: (_c, rng, s) => {
        const cur = Number(bag[ctl.p]);
        const v = nudge(cur, ctl.min, ctl.max, ctl.step, rng, s);
        if (v === cur) return null;
        bag[ctl.p] = v;
        return label;
      },
    };
  }
  return {
    impact: STRUCTURAL.has(ctl.p) ? 2 : 1,
    apply: (c, rng, s) => {
      const opts = ctl.opts(c).map(([v]) => v);
      const cur = bag[ctl.p];
      const i = opts.findIndex((v) => v === cur);
      if (opts.length < 2) return null;
      let j: number;
      if (typeof cur === 'number' && i >= 0) {
        // числовые списки (вершины, шаг звезды) меняются на соседнее значение
        const reach = 1 + Math.round(2 * s * rng());
        j = clamp(i + (rng.chance(0.5) ? reach : -reach), 0, opts.length - 1);
        if (j === i) j = i === 0 ? 1 : i - 1;
      } else {
        j = rng.int(0, opts.length - 2);
        if (j >= i && i >= 0) j++;
      }
      bag[ctl.p] = opts[j];
      return label;
    },
  };
}

// ---------- цвет

function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0.5];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const sat = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [(h + 360) % 360, sat, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number): string => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rotateHue(hex: string, deg: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((((h + deg) % 360) + 360) % 360, s, l);
}

// ---------- набор генов

function collectGenes(c: CircleConfig, locks: Locks): Gene[] {
  const genes: Gene[] = [];

  if (!locks.layers) {
    for (const def of LAYERS) {
      const layer = c.layers[def.id] as unknown as Bag;
      genes.push({
        impact: 2,
        apply: (cfg) => {
          const on = Object.values(cfg.layers).filter((l) => l.on).length;
          // не гасим последние слои — пустой круг не эволюция
          if (layer.on && on <= 2) return null;
          layer.on = !layer.on;
          return `${layer.on ? '+' : '−'} ${def.title.toLowerCase()}`;
        },
      });
      if (!layer.on) continue;
      for (const ctl of def.ctl) {
        if (ctl.show && !ctl.show(c)) continue;
        genes.push(ctlGene(def.title, layer, ctl));
      }
    }

    const mirrors: MirrorMode[] = ['none', 'v', 'both'];
    genes.push({
      impact: 2,
      apply: (cfg, rng) => {
        cfg.mirror = rng.pick(mirrors.filter((m) => m !== cfg.mirror));
        return 'Симметрия знаков';
      },
    });
    if (c.layers.polygram.on) {
      const p = c.layers.polygram;
      genes.push(
        { impact: 1, apply: () => ((p.flip = !p.flip), 'Полиграмма: переворот') },
        { impact: 1, apply: () => ((p.mirrorCopy = !p.mirrorCopy), 'Полиграмма: зеркальная копия') },
        {
          impact: 0,
          apply: (_c, rng, s) => {
            const v = nudge(p.rotation, 0, 90, 1, rng, s * 0.5);
            if (v === p.rotation) return null;
            p.rotation = v;
            return 'Полиграмма: поворот';
          },
        },
      );
    }
    if (c.layers.outerRing.on) {
      const o = c.layers.outerRing;
      genes.push(
        { impact: 1, apply: () => ((o.flip = !o.flip), 'Письмо: верхом к центру') },
        { impact: 1, apply: () => ((o.reverse = !o.reverse), 'Письмо: направление') },
      );
    }
  }

  if (!locks.script) {
    genes.push(
      {
        impact: 1,
        apply: (cfg, rng) => {
          cfg.seed = Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0');
          return 'Знаки и символы';
        },
      },
      {
        impact: 2,
        apply: (cfg, rng) => {
          cfg.script.variant = rng.int(0, 999);
          return 'Вариант письма';
        },
      },
      {
        impact: 1,
        apply: (cfg, rng) => {
          const s = cfg.script.symbols;
          const [key, label] = rng.pick(SYM_CATS);
          if (s[key] && Object.values(s).filter(Boolean).length <= 1) return null;
          s[key] = !s[key];
          return `${s[key] ? '+' : '−'} ${label.toLowerCase()}`;
        },
      },
    );
  }

  if (!locks.style) {
    const st = c.style;
    genes.push(
      {
        impact: 0,
        apply: (_c, rng, s) => {
          const v = nudge(st.weight, 0.5, 2, 0.05, rng, s * 0.6);
          if (v === st.weight) return null;
          st.weight = v;
          return 'Толщина линий';
        },
      },
      { impact: 2, apply: () => ((st.mode = st.mode === 'chalk' ? 'clean' : 'chalk'), 'Стиль линий') },
    );
    if (st.mode === 'chalk') {
      genes.push({
        impact: 0,
        apply: (_c, rng, s) => {
          const v = nudge(st.rough, 0.3, 2.5, 0.1, rng, s * 0.6);
          if (v === st.rough) return null;
          st.rough = v;
          return 'Грубость мела';
        },
      });
    }
  }

  if (!locks.color) {
    const col = c.color;
    genes.push(
      {
        impact: 0,
        apply: (_c, rng, s) => {
          const deg = (6 + 70 * s) * rng.range(0.5, 1) * (rng.chance(0.5) ? 1 : -1);
          col.ink = rotateHue(col.ink, deg);
          col.bg = rotateHue(col.bg, deg);
          col.glowColor = rotateHue(col.glowColor, deg);
          return 'Оттенок';
        },
      },
      { impact: 1, apply: () => ((col.glow = !col.glow), col.glow ? '+ свечение' : '− свечение') },
      { impact: 1, apply: () => ((col.halo = !col.halo), col.halo ? '+ ореол' : '− ореол') },
    );
    if (col.glow) {
      genes.push(
        {
          impact: 0,
          apply: (_c, rng, s) => {
            const v = nudge(col.glowStrength, 0.2, 3, 0.1, rng, s * 0.6);
            if (v === col.glowStrength) return null;
            col.glowStrength = v;
            return 'Сила свечения';
          },
        },
        {
          impact: 0,
          apply: (_c, rng, s) => {
            const v = nudge(col.glowRadius, 0.5, 10, 0.5, rng, s * 0.6);
            if (v === col.glowRadius) return null;
            col.glowRadius = v;
            return 'Радиус свечения';
          },
        },
      );
    }
  }

  return genes;
}

export interface Mutant {
  config: CircleConfig;
  /** подписи того, что изменилось */
  changes: string[];
}

/**
 * Потомок круга: несколько случайных генов меняются тем сильнее, чем выше strength (0…1).
 * При малой силе трогаются только тонкие параметры, при большой — перестраивается структура.
 */
export function mutateConfig(parent: CircleConfig, strength: number, rng: Rng, locks: Locks): Mutant {
  const s = clamp(strength, 0, 1);
  const before = JSON.stringify(parent);
  const config = cloneConfig(parent);
  const pool = collectGenes(config, locks).map((gene) => ({
    gene,
    // перестройка структуры почти исключена при малой силе и обычна при большой
    w: gene.impact === 0 ? 1 : gene.impact === 1 ? 0.05 + s : s * s,
  }));
  const changes: string[] = [];
  const want = Math.max(1, Math.round(1 + s * 8));

  // выбор без возвращения; пустые мутации не засчитываются
  for (let guard = 0; changes.length < want && pool.length && guard < 60; guard++) {
    let total = 0;
    for (const p of pool) total += p.w;
    if (total <= 0) break;
    let x = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      x -= pool[i].w;
      if (x < 0) break;
    }
    const [{ gene }] = pool.splice(i, 1);
    const label = gene.apply(config, rng, s);
    if (label) changes.push(label);
  }

  sanitize(config);
  if (JSON.stringify(config) === before) return { config, changes: [] };
  return { config, changes };
}
