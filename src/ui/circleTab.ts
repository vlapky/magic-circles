import {
  ALPHABETS,
  PALETTES,
  SYM_CATS,
  cloneConfig,
  randomizeConfig,
  type CircleConfig,
  type LayerId,
  type Locks,
} from '../core/config';
import { starSteps } from '../core/geom';
import { phraseToSeed, randomSeed } from '../core/rng';
import { downloadBlob, downloadText, fileName, svgToPng } from '../export/export';
import { circleSvg } from '../render/compose';
import { addNode } from '../system/layouts';
import { uid } from '../system/types';
import { button, check, color, range, section, select, type Bind } from './controls';
import { h, toast } from './dom';
import { app, persist, persistLibrary } from './state';

type Show = (c: CircleConfig) => boolean;
type Ctl =
  | { k: 'check'; p: string; label: string; re?: boolean; show?: Show }
  | { k: 'range'; p: string; label: string; min: number; max: number; step: number; unit?: string; show?: Show }
  | { k: 'select'; p: string; label: string; opts: (c: CircleConfig) => readonly (readonly [string | number, string])[]; re?: boolean; show?: Show };

interface LayerDef {
  id: LayerId;
  title: string;
  hint: string;
  ctl: Ctl[];
}

const abc = (): typeof ALPHABETS => ALPHABETS;
const nums = (a: number, b: number): [number, string][] => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);

const LAYERS: LayerDef[] = [
  {
    id: 'outerRing',
    title: 'Внешнее кольцо с письмом',
    hint: 'Двойной обод и полосы знаков',
    ctl: [
      { k: 'select', p: 'bands', label: 'Полос письма', opts: () => nums(1, 3) },
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'density', label: 'Плотность', min: 0.6, max: 1.5, step: 0.05 },
      { k: 'check', p: 'cells', label: 'Ячейки между знаками' },
      { k: 'check', p: 'ticks', label: 'Насечки на ободе' },
    ],
  },
  {
    id: 'polygram',
    title: 'Полиграмма',
    hint: 'Многоугольник и звезда',
    ctl: [
      { k: 'select', p: 'n', label: 'Вершин', opts: () => nums(3, 12), re: true },
      { k: 'select', p: 'mode', label: 'Фигура', opts: () => [['polygon', 'Многоугольник'], ['star', 'Звезда'], ['both', 'Оба']], re: true },
      {
        k: 'select',
        p: 'k',
        label: 'Шаг звезды',
        opts: (c) => starSteps(c.layers.polygram.n).map((k) => [k, `через ${k}`] as const),
        show: (c) => c.layers.polygram.mode !== 'polygon' && starSteps(c.layers.polygram.n).length > 0,
      },
      { k: 'range', p: 'nested', label: 'Вложенных копий', min: 0, max: 4, step: 1 },
      { k: 'range', p: 'twist', label: 'Вписанность', min: 0, max: 1, step: 0.05 },
      { k: 'check', p: 'double', label: 'Двойная линия' },
      { k: 'check', p: 'circum', label: 'Описанная окружность' },
    ],
  },
  {
    id: 'nodes',
    title: 'Малые круги',
    hint: 'На вершинах, рёбрах или орбите',
    ctl: [
      { k: 'select', p: 'place', label: 'Где', opts: () => [['vertices', 'На вершинах'], ['mids', 'На серединах рёбер'], ['orbit', 'На орбите']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 12, step: 1, show: (c) => c.layers.nodes.place === 'orbit' || !c.layers.polygram.on },
      { k: 'range', p: 'orbit', label: 'Радиус орбиты', min: 0.2, max: 1, step: 0.02, show: (c) => c.layers.nodes.place === 'orbit' },
      { k: 'range', p: 'r', label: 'Размер', min: 8, max: 42, step: 1 },
      { k: 'select', p: 'content', label: 'Внутри', opts: () => [['symbol', 'Символ'], ['glyph', 'Буква'], ['none', 'Пусто']] },
      { k: 'check', p: 'double', label: 'Двойной контур' },
      { k: 'check', p: 'radial', label: 'Повернуть от центра' },
    ],
  },
  {
    id: 'petals',
    title: 'Лепестки',
    hint: 'Дуги, арки, листья',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['vertex', 'Дуги от вершин'], ['arch', 'Арки у обода'], ['leaf', 'Листья из центра']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 16, step: 1 },
      { k: 'range', p: 'span', label: 'Размах', min: 1, max: 5, step: 1, show: (c) => c.layers.petals.type === 'vertex' },
      { k: 'range', p: 'depth', label: 'Глубина', min: 0.3, max: 1, step: 0.05, show: (c) => c.layers.petals.type !== 'vertex' },
      { k: 'check', p: 'double', label: 'Двойная линия' },
      { k: 'check', p: 'text', label: 'Письмо в арке', show: (c) => c.layers.petals.type === 'arch' },
    ],
  },
  {
    id: 'rosette',
    title: 'Розетка',
    hint: 'Пересекающиеся окружности и хорды',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['circles', 'Венок окружностей'], ['chords', 'Все хорды'], ['flower', 'Цветок жизни']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 16, step: 1, show: (c) => c.layers.rosette.type !== 'flower' },
      { k: 'range', p: 'radius', label: 'Радиус', min: 0.3, max: 1, step: 0.05 },
      { k: 'range', p: 'size', label: 'Размер окружностей', min: 0.15, max: 0.6, step: 0.05, show: (c) => c.layers.rosette.type === 'circles' },
    ],
  },
  {
    id: 'innerRing',
    title: 'Внутреннее кольцо',
    hint: 'Вторая строка письма',
    ctl: [
      { k: 'range', p: 'radius', label: 'Радиус', min: 0.25, max: 0.95, step: 0.01 },
      { k: 'check', p: 'band', label: 'Полоса письма' },
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'check', p: 'fillBg', label: 'Перекрывает линии под собой' },
      { k: 'check', p: 'ticks', label: 'Насечки' },
    ],
  },
  {
    id: 'center',
    title: 'Центр',
    hint: 'Символ, печать, глаз',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['symbol', 'Символ'], ['seal', 'Печать'], ['eye', 'Глаз'], ['polygram', 'Малая полиграмма'], ['rings', 'Концентрические круги'], ['dot', 'Точка']] },
      { k: 'range', p: 'size', label: 'Размер', min: 0.2, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'rays',
    title: 'Лучи и оси',
    hint: 'Линии наружу с навершиями',
    ctl: [
      { k: 'range', p: 'count', label: 'Сколько', min: 1, max: 16, step: 1 },
      { k: 'range', p: 'from', label: 'Начало (0 — центр)', min: 0, max: 1, step: 0.05 },
      { k: 'range', p: 'extend', label: 'Вылет за обод', min: 0, max: 90, step: 1 },
      { k: 'select', p: 'ends', label: 'Навершие', opts: () => [['none', 'Нет'], ['cross', 'Крест'], ['dot', 'Кружок'], ['arrow', 'Стрела'], ['symbol', 'Символ']] },
      { k: 'check', p: 'offset', label: 'Между вершинами' },
    ],
  },
  {
    id: 'edgeText',
    title: 'Надписи на рёбрах',
    hint: 'Письмо вдоль сторон полиграммы',
    ctl: [
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'size', label: 'Размер', min: 5, max: 11, step: 0.5 },
    ],
  },
  {
    id: 'outside',
    title: 'Знаки снаружи',
    hint: 'Символы вокруг круга',
    ctl: [
      { k: 'range', p: 'count', label: 'Сколько', min: 1, max: 16, step: 1 },
      { k: 'select', p: 'content', label: 'Что', opts: () => [['symbol', 'Символ'], ['glyph', 'Буква']] },
      { k: 'range', p: 'dist', label: 'Отступ', min: 18, max: 90, step: 1 },
      { k: 'range', p: 'size', label: 'Размер', min: 8, max: 26, step: 1 },
      { k: 'check', p: 'ringed', label: 'В кружке' },
      { k: 'check', p: 'offset', label: 'Между вершинами' },
    ],
  },
  {
    id: 'spiral',
    title: 'Спираль письма',
    hint: 'Строка, закрученная к центру',
    ctl: [
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'turns', label: 'Витков', min: 1, max: 6, step: 1 },
      { k: 'range', p: 'start', label: 'Начальный радиус', min: 0.4, max: 1, step: 0.05 },
      { k: 'range', p: 'size', label: 'Размер', min: 6, max: 12, step: 0.5 },
    ],
  },
];

/** Приводит зависимые параметры в допустимое состояние. */
function sanitize(c: CircleConfig): void {
  const p = c.layers.polygram;
  const steps = starSteps(p.n);
  if (!steps.length) p.mode = 'polygon';
  else if (!steps.includes(p.k)) p.k = steps[0];
}

const LOCKS: [keyof Locks, string][] = [
  ['layers', 'слои'],
  ['script', 'письмо'],
  ['style', 'стиль'],
  ['color', 'цвет'],
];

let circleName = '';
let pngSize = 2048;
let raf = 0;

export function mountCircleTab(root: HTMLElement): void {
  const stage = h('div', { class: 'canvas', 'aria-label': 'Превью круга' });
  const info = h('div', { class: 'stage-info' });
  const panel = h('aside', { class: 'panel', 'aria-label': 'Настройки круга' });
  root.replaceChildren(h('div', { class: 'stage' }, stage, info), panel);

  const refresh = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const svg = circleSvg(app.cfg, 'p');
      stage.innerHTML = svg;
      // шахматка под холстом остаётся только для прозрачного фона
      stage.style.background = app.cfg.color.transparent ? '' : app.cfg.color.bg;
      info.textContent = `сид ${app.cfg.seed || '—'} · ${app.cfg.style.mode === 'chalk' ? 'мел' : 'чистые линии'} · SVG ${Math.max(1, Math.round(svg.length / 1024))} КБ`;
    });
  };

  const changed = (rebuildPanel: boolean, keepFocus?: string): void => {
    sanitize(app.cfg);
    persist();
    refresh();
    if (rebuildPanel) rebuild(keepFocus);
  };

  const applySeed = (seed: string, structure: boolean): void => {
    if (structure) app.cfg = randomizeConfig(app.cfg, seed, app.locks);
    else app.cfg.seed = seed;
  };

  function rebuild(keepFocus?: string): void {
    const scroll = panel.scrollTop;
    const caret = keepFocus ? (document.getElementById(keepFocus) as HTMLInputElement | null)?.selectionStart : null;
    const bind: Bind = { obj: app.cfg, onChange: (_p, re) => changed(re) };
    const sec = (id: string, title: string, ...body: (HTMLElement | null | false)[]): HTMLElement =>
      section(id, title, app.open, persist, ...body);

    // --- Сид и фраза
    const phrase = h('input', {
      type: 'text',
      id: 'phrase',
      value: app.cfg.phrase,
      placeholder: 'например: огонь идёт со мной',
      spellcheck: false,
      autocomplete: 'off',
      oninput: () => {
        app.cfg.phrase = phrase.value;
        if (phrase.value.trim()) applySeed(phraseToSeed(phrase.value), app.auto);
        changed(true, 'phrase');
      },
    });
    const seed = h('input', {
      type: 'text',
      id: 'seed',
      value: app.cfg.seed,
      spellcheck: false,
      autocomplete: 'off',
      oninput: () => {
        app.cfg.seed = seed.value;
        changed(false);
      },
    });
    const autoBox = h('input', {
      type: 'checkbox',
      id: 'auto',
      checked: app.auto,
      onchange: () => {
        app.auto = autoBox.checked;
        persist();
      },
    });
    const textMode = h('input', {
      type: 'checkbox',
      id: 'text-mode',
      checked: app.cfg.textMode === 'phrase',
      onchange: () => {
        app.cfg.textMode = textMode.checked ? 'phrase' : 'seed';
        changed(false);
      },
    });
    const seedSec = sec(
      'seed',
      'Сид и фраза',
      h('div', { class: 'field text' }, h('label', { for: 'phrase' }, 'Фраза'), phrase),
      h('label', { class: 'field check', for: 'auto' }, autoBox, h('span', null, 'Фраза задаёт весь круг, а не только знаки')),
      h('label', { class: 'field check', for: 'text-mode' }, textMode, h('span', null, 'Писать фразу на кольцах')),
      h(
        'div',
        { class: 'field text with-btn' },
        h('label', { for: 'seed' }, 'Сид'),
        seed,
        button('Новый', () => {
          applySeed(randomSeed(), false);
          changed(true);
        }),
      ),
      h(
        'div',
        { class: 'row' },
        button(
          'Случайный круг',
          () => {
            applySeed(randomSeed(), true);
            changed(true);
          },
          'primary',
        ),
        button('Круг из сида', () => {
          applySeed(app.cfg.seed, true);
          changed(true);
        }),
      ),
      h(
        'fieldset',
        { class: 'locks' },
        h('legend', null, 'Рандомайзер не меняет'),
        ...LOCKS.map(([key, label]) => {
          const box = h('input', {
            type: 'checkbox',
            id: `lock-${key}`,
            checked: app.locks[key],
            onchange: () => {
              app.locks[key] = box.checked;
              persist();
            },
          });
          return h('label', { class: 'chip', for: `lock-${key}` }, box, h('span', null, label));
        }),
      ),
    );

    // --- Слои
    const layerEls = LAYERS.map((def) => {
      const on = app.cfg.layers[def.id].on;
      const base = `layers.${def.id}`;
      const id = `layer-${def.id}`;
      const box = h('input', {
        type: 'checkbox',
        id,
        checked: on,
        onchange: () => {
          app.cfg.layers[def.id].on = box.checked;
          changed(true);
        },
      });
      const params = on
        ? def.ctl
            .filter((c) => !c.show || c.show(app.cfg))
            .map((c) => {
              const p = `${base}.${c.p}`;
              if (c.k === 'check') return check(bind, p, c.label, c.re);
              if (c.k === 'range') return range(bind, p, c.label, c.min, c.max, c.step, c.unit);
              return select(bind, p, c.label, c.opts(app.cfg), c.re);
            })
        : [];
      return h(
        'div',
        { class: `layer${on ? ' on' : ''}` },
        h('label', { class: 'layer-head', for: id }, box, h('span', { class: 'layer-title' }, def.title), h('span', { class: 'layer-hint' }, def.hint)),
        on && h('div', { class: 'layer-body' }, ...params),
      );
    });

    // --- Письмо и символы
    const scriptSec = sec(
      'script',
      'Письмо и символы',
      h(
        'div',
        { class: 'with-btn' },
        range(bind, 'script.variant', 'Вариант письма', 0, 999, 1),
        button('Другой', () => {
          app.cfg.script.variant = Math.floor(Math.random() * 1000);
          changed(true);
        }),
      ),
      h('p', { class: 'note' }, 'Каждый вариант — свой набор знаков для рун, блочных знаков, сигилов и вязи.'),
      h('fieldset', { class: 'chips' }, h('legend', null, 'Какие символы использовать'), ...SYM_CATS.map(([key, label]) => chip(bind, `script.symbols.${key}`, label))),
    );

    // --- Зеркалирование
    const mirrorSec = sec(
      'mirror',
      'Зеркалирование',
      select(bind, 'mirror', 'Симметрия знаков', [
        ['none', 'Нет'],
        ['v', 'Лево ↔ право'],
        ['both', 'Четыре четверти'],
      ]),
      check(bind, 'layers.polygram.flip', 'Перевернуть полиграмму вершиной вниз'),
      range(bind, 'layers.polygram.rotation', 'Поворот полиграммы', 0, 90, 1, '°'),
      check(bind, 'layers.polygram.mirrorCopy', 'Зеркальная копия полиграммы'),
      check(bind, 'layers.outerRing.flip', 'Письмо верхом к центру'),
      check(bind, 'layers.outerRing.reverse', 'Письмо против часовой'),
    );

    // --- Стиль
    const styleSec = sec(
      'style',
      'Стиль линий',
      select(
        bind,
        'style.mode',
        'Линии',
        [
          ['clean', 'Чистые'],
          ['chalk', 'Мел'],
        ],
        true,
      ),
      range(bind, 'style.weight', 'Толщина', 0.5, 2, 0.05, '×'),
      app.cfg.style.mode === 'chalk' && range(bind, 'style.rough', 'Грубость мела', 0.3, 2.5, 0.1),
    );

    // --- Цвет и свечение
    const colorSec = sec('color', 'Цвет и свечение', ...colorControls(bind, app.cfg.color, () => changed(true)));

    // --- Сохранение
    const nameInput = h('input', {
      type: 'text',
      id: 'circle-name',
      value: circleName,
      placeholder: `Круг ${app.cfg.seed}`,
      oninput: () => {
        circleName = nameInput.value;
      },
    });
    const sizeSel = h(
      'select',
      {
        id: 'png-size',
        'aria-label': 'Размер PNG',
        onchange: () => {
          pngSize = Number(sizeSel.value);
        },
      },
      ...[1024, 2048, 4096].map((s) => h('option', { value: String(s), selected: s === pngSize }, `${s} px`)),
    );
    const name = (): string => circleName.trim() || `Круг ${app.cfg.seed}`;
    const saveSec = sec(
      'save',
      'Сохранить и экспорт',
      h('div', { class: 'field text' }, h('label', { for: 'circle-name' }, 'Название'), nameInput),
      h(
        'div',
        { class: 'row' },
        button(
          'В библиотеку',
          () => {
            app.lib.circles.unshift({ id: uid(), name: name(), createdAt: Date.now(), config: cloneConfig(app.cfg) });
            persistLibrary();
            toast(`«${name()}» сохранён в библиотеку`);
          },
          'primary',
        ),
        button('В систему', () => {
          addNode(app.sys, { id: uid(), name: name(), config: cloneConfig(app.cfg), x: 0, y: 0, scale: 1, rot: 0, opaque: false });
          persist();
          toast(`«${name()}» добавлен в систему (${app.sys.nodes.length})`);
        }),
      ),
      h(
        'div',
        { class: 'row' },
        button('Скачать SVG', () => downloadText(`${fileName(name(), 'circle')}.svg`, circleSvg(app.cfg, 'x'), 'image/svg+xml')),
        button('Скачать PNG', () => {
          svgToPng(circleSvg(app.cfg, 'x', { px: pngSize }), pngSize, pngSize)
            .then((blob) => downloadBlob(`${fileName(name(), 'circle')}.png`, blob))
            .catch((e: Error) => toast(e.message, 'err'));
        }),
        sizeSel,
      ),
    );

    panel.replaceChildren(seedSec, sec('layers', 'Слои', ...layerEls), scriptSec, mirrorSec, styleSec, colorSec, saveSec);
    panel.scrollTop = scroll;
    if (keepFocus) {
      const el = document.getElementById(keepFocus) as HTMLInputElement | null;
      el?.focus();
      if (el && caret != null) el.setSelectionRange(caret, caret);
    }
  }

  rebuild();
  refresh();
}

function chip(b: Bind, path: string, label: string): HTMLElement {
  const el = check(b, path, label);
  el.className = 'chip';
  return el;
}

/** Контролы цвета и свечения — общие для круга и системы. */
export function colorControls(bind: Bind, c: CircleConfig['color'], onPalette: () => void, withInk = true): (HTMLElement | false)[] {
  return [
    withInk &&
      h(
        'div',
        { class: 'palettes', role: 'group', 'aria-label': 'Готовые палитры' },
        ...PALETTES.map((p) =>
          h('button', {
            type: 'button',
            class: 'swatch',
            title: p.name,
            'aria-label': `Палитра «${p.name}»`,
            style: `--ink:${p.ink};--bg:${p.bg}`,
            onclick: () => {
              c.ink = p.ink;
              c.bg = p.bg;
              if (c.glowLinked) c.glowColor = p.ink;
              onPalette();
            },
          }),
        ),
      ),
    withInk && color(bind, 'color.ink', 'Линии'),
    color(bind, 'color.bg', 'Фон'),
    check(bind, 'color.transparent', 'Прозрачный фон'),
    check(bind, 'color.glow', 'Свечение', true),
    c.glow && range(bind, 'color.glowStrength', 'Сила свечения', 0.2, 3, 0.1),
    c.glow && range(bind, 'color.glowRadius', 'Радиус свечения', 0.5, 10, 0.5),
    check(bind, 'color.glowLinked', 'Свечение цветом линий', true),
    !c.glowLinked && color(bind, 'color.glowColor', 'Цвет свечения'),
    check(bind, 'color.halo', 'Ореол на фоне'),
  ];
}
