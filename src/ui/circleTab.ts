import { PALETTES, SYM_CATS, cloneConfig, randomizeConfig, type CircleConfig, type Locks } from '../core/config';
import { LAYERS, sanitize } from '../core/schema';
import { phraseToSeed, randomSeed } from '../core/rng';
import { downloadBlob, downloadText, fileName, svgToPng } from '../export/export';
import { circleSvg } from '../render/compose';
import { addNode } from '../system/layouts';
import { uid } from '../system/types';
import { button, check, color, range, section, select, type Bind } from './controls';
import { h, toast } from './dom';
import { app, persist, persistLibrary } from './state';

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
