import { cloneConfig, randomizeConfig } from '../core/config';
import { randomSeed } from '../core/rng';
import { downloadBlob, downloadText, fileName, svgToPng } from '../export/export';
import { circleSvg } from '../render/compose';
import { linksMarkup, nodeTransform, systemSvg } from '../system/build';
import { addNode, applyLayout, removeNode } from '../system/layouts';
import { LAYOUTS, uid, type SystemNode } from '../system/types';
import { button, check, range, section, select, text, type Bind } from './controls';
import { colorControls } from './circleTab';
import { h, toast } from './dom';
import { app, persist, persistLibrary } from './state';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

type Drag =
  | { kind: 'move'; node: SystemNode; dx: number; dy: number }
  | { kind: 'scale'; node: SystemNode }
  | { kind: 'rotate'; node: SystemNode };

let pngSize = 2048;
let pick = '';

export function mountSystemTab(root: HTMLElement, openCircle: () => void): void {
  const stage = h('div', { class: 'canvas editor', 'aria-label': 'Холст системы' });
  const info = h('div', { class: 'stage-info' });
  const panel = h('aside', { class: 'panel', 'aria-label': 'Настройки системы' });
  root.replaceChildren(h('div', { class: 'stage' }, stage, info), panel);

  const sys = (): typeof app.sys => app.sys;
  const selected = (): SystemNode | undefined => sys().nodes.find((n) => n.id === app.selected);
  let drag: Drag | null = null;
  let wheelTimer = 0;

  // ---------- холст

  const point = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
    const svg = stage.querySelector('svg') as SVGSVGElement;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  };

  function drawOverlay(): void {
    const svg = stage.querySelector('svg') as SVGSVGElement | null;
    if (!svg) return;
    svg.querySelector('[data-overlay]')?.remove();
    const n = selected();
    if (!n) return;
    const unit = svg.viewBox.baseVal.width / Math.max(1, svg.clientWidth);
    const r = 250 * n.scale;
    const g = svgEl('g', { 'data-overlay': 1, transform: `translate(${n.x} ${n.y}) rotate(${n.rot})`, color: '#fff' });
    g.append(
      svgEl('circle', { r, 'stroke-width': unit * 1.2, 'stroke-dasharray': `${unit * 5} ${unit * 5}`, 'stroke-opacity': 0.7, 'pointer-events': 'none' }),
      svgEl('line', { x1: 0, y1: -r, x2: 0, y2: -r - unit * 26, 'stroke-width': unit * 1.2, 'stroke-opacity': 0.7, 'pointer-events': 'none' }),
    );
    const rot = svgEl('circle', { cx: 0, cy: -r - unit * 26, r: unit * 7, fill: '#fff', stroke: '#000', 'stroke-width': unit, 'data-handle': 'rotate' });
    const k = r * Math.SQRT1_2;
    const sc = svgEl('rect', { x: k - unit * 7, y: k - unit * 7, width: unit * 14, height: unit * 14, fill: '#fff', stroke: '#000', 'stroke-width': unit, 'data-handle': 'scale' });
    rot.append(svgEl('title', {}));
    rot.firstChild!.textContent = 'Поворот';
    sc.append(svgEl('title', {}));
    sc.firstChild!.textContent = 'Масштаб';
    g.append(rot, sc);
    svg.append(g);
  }

  function render(): void {
    const { svg, vb } = systemSvg(sys(), 's', { editor: true });
    stage.innerHTML = svg;
    stage.style.background = sys().color.transparent ? '' : sys().color.bg;
    drawOverlay();
    const n = sys().nodes.length;
    info.textContent = n
      ? `${n} ${plural(n, 'круг', 'круга', 'кругов')} · ${Math.round(vb[2])}×${Math.round(vb[3])} · тяните круг, колесо — масштаб, Shift+клик — связать`
      : 'Система пуста — добавьте круги из библиотеки или текущий круг';
  }

  /** Быстрое обновление во время перетаскивания: только transform узла, связи и рамка выделения. */
  function live(n: SystemNode): void {
    const g = stage.querySelector(`[data-node="${n.id}"]`);
    g?.setAttribute('transform', nodeTransform(n));
    const links = stage.querySelector('[data-links]');
    if (links) links.innerHTML = linksMarkup(sys(), 's');
    drawOverlay();
  }

  function toggleLink(a: string, b: string): void {
    const s = sys();
    const i = s.links.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (i >= 0) s.links.splice(i, 1);
    else s.links.push({ a, b });
    if (s.linkKind === 'none') s.linkKind = 'line';
  }

  stage.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle');
    const cur = selected();
    if (handle && cur) {
      drag = { kind: handle as 'scale' | 'rotate', node: cur };
    } else {
      const id = target.closest('[data-node]')?.getAttribute('data-node') ?? null;
      const node = sys().nodes.find((n) => n.id === id);
      if (node && e.shiftKey && cur && cur.id !== node.id) {
        toggleLink(cur.id, node.id);
        persist();
        render();
        return;
      }
      const was = app.selected;
      app.selected = node?.id ?? null;
      if (node) {
        const p = point(e);
        drag = { kind: 'move', node, dx: node.x - p.x, dy: node.y - p.y };
      }
      if (was !== app.selected) {
        drawOverlay();
        rebuild();
      }
    }
    if (drag) {
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
      e.preventDefault();
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = point(e);
    const n = drag.node;
    if (drag.kind === 'move') {
      n.x = Math.round(p.x + drag.dx);
      n.y = Math.round(p.y + drag.dy);
    } else if (drag.kind === 'scale') {
      n.scale = Math.min(4, Math.max(0.08, Math.hypot(p.x - n.x, p.y - n.y) / 250));
    } else {
      n.rot = Math.round((Math.atan2(p.y - n.y, p.x - n.x) * 180) / Math.PI + 90);
      if (e.shiftKey) n.rot = Math.round(n.rot / 15) * 15;
    }
    sys().manual = true;
    live(n);
  });

  const endDrag = (): void => {
    if (!drag) return;
    drag = null;
    stage.classList.remove('dragging');
    persist();
    render();
    rebuild();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'wheel',
    (e) => {
      const id = (e.target as Element).closest('[data-node]')?.getAttribute('data-node');
      const n = sys().nodes.find((x) => x.id === id);
      if (!n) return;
      e.preventDefault();
      n.scale = Math.min(4, Math.max(0.08, n.scale * Math.exp(-e.deltaY * 0.0015)));
      sys().manual = true;
      if (app.selected !== n.id) app.selected = n.id;
      live(n);
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        persist();
        render();
        rebuild();
      }, 250);
    },
    { passive: false },
  );

  stage.tabIndex = 0;
  stage.addEventListener('keydown', (e) => {
    const n = selected();
    if (!n) return;
    const step = e.shiftKey ? 10 : 1;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) {
      n.x += move[e.key][0];
      n.y += move[e.key][1];
      sys().manual = true;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      removeNode(sys(), n.id);
      app.selected = null;
    } else return;
    e.preventDefault();
    persist();
    render();
    rebuild();
  });

  // ---------- панель

  const update = (rebuildPanel: boolean): void => {
    persist();
    render();
    if (rebuildPanel) rebuild();
  };

  const add = (name: string, config: SystemNode['config']): void => {
    const node: SystemNode = { id: uid(), name, config: cloneConfig(config), x: 0, y: 0, scale: 1, rot: 0, opaque: false };
    addNode(sys(), node);
    app.selected = node.id;
    update(true);
  };

  function rebuild(): void {
    const scroll = panel.scrollTop;
    const s = sys();
    const bind: Bind = {
      obj: s,
      onChange: (path, re) => {
        // пока круги не двигали вручную, шаблон и разлёт применяются сразу
        if ((path === 'layout' || path === 'spread') && !s.manual) applyLayout(s);
        update(re);
      },
    };
    const sec = (id: string, title: string, ...body: (HTMLElement | null | false)[]): HTMLElement =>
      section(id, title, app.open, persist, ...body);

    const layoutSec = sec(
      'layout',
      'Раскладка',
      select(bind, 'layout', 'Шаблон', LAYOUTS.map(([id, name]) => [id, name] as const), true),
      h('p', { class: 'note' }, LAYOUTS.find(([id]) => id === s.layout)?.[2] ?? ''),
      range(bind, 'spread', 'Разлёт', 0.5, 1.8, 0.05, '×'),
      h(
        'div',
        { class: 'row' },
        button(
          'Применить раскладку',
          () => {
            applyLayout(s);
            update(true);
          },
          'primary',
        ),
      ),
      s.manual && h('p', { class: 'note' }, 'Круги расставлены вручную. «Применить раскладку» вернёт их на места шаблона.'),
      select(bind, 'linkKind', 'Связи', [
        ['line', 'Линия'],
        ['double', 'Двойная дорожка'],
        ['none', 'Скрыть'],
      ]),
      select(bind, 'frame', 'Рамка', [
        ['none', 'Нет'],
        ['circle', 'Окружность'],
        ['ring', 'Кольцо с письмом'],
      ]),
      text(bind, 'seed', 'Сид рамки и раскладки'),
    );

    // список кругов
    const rows = s.nodes.map((n, i) => {
      const sel = n.id === app.selected;
      const move = (d: number): void => {
        const j = i + d;
        if (j < 0 || j >= s.nodes.length) return;
        [s.nodes[i], s.nodes[j]] = [s.nodes[j], s.nodes[i]];
        if (!s.manual) applyLayout(s);
        update(true);
      };
      const thumb = h('span', { class: 'thumb', 'aria-hidden': 'true' });
      thumb.innerHTML = circleSvg(n.config, `st${i}`, { lite: true });
      return h(
        'li',
        { class: `node-row${sel ? ' sel' : ''}` },
        h(
          'button',
          {
            type: 'button',
            class: 'node-pick',
            'aria-pressed': String(sel),
            onclick: () => {
              app.selected = sel ? null : n.id;
              drawOverlay();
              rebuild();
            },
          },
          thumb,
          h('span', { class: 'node-name' }, n.name),
        ),
        h('button', { type: 'button', class: 'icon', title: 'Ниже по слоям', 'aria-label': `${n.name}: ниже по слоям`, disabled: i === 0, onclick: () => move(-1) }, '↑'),
        h('button', { type: 'button', class: 'icon', title: 'Выше по слоям', 'aria-label': `${n.name}: выше по слоям`, disabled: i === s.nodes.length - 1, onclick: () => move(1) }, '↓'),
        h(
          'button',
          {
            type: 'button',
            class: 'icon',
            title: 'Убрать из системы',
            'aria-label': `${n.name}: убрать из системы`,
            onclick: () => {
              removeNode(s, n.id);
              if (app.selected === n.id) app.selected = null;
              update(true);
            },
          },
          '✕',
        ),
      );
    });

    const cur = selected();
    let nodeControls: HTMLElement | false = false;
    if (cur) {
      const nb: Bind = {
        obj: cur,
        onChange: (path) => {
          if (path !== 'opaque' && path !== 'name') s.manual = true;
          update(false);
        },
      };
      nodeControls = h(
        'div',
        { class: 'node-edit' },
        text(nb, 'name', 'Название', '', () => rebuild()),
        range(nb, 'x', 'X', -1500, 1500, 1),
        range(nb, 'y', 'Y', -1500, 1500, 1),
        range(nb, 'scale', 'Масштаб', 0.08, 3, 0.01, '×'),
        range(nb, 'rot', 'Поворот', -180, 180, 1, '°'),
        check(nb, 'opaque', 'Перекрывает круги под собой'),
        h(
          'div',
          { class: 'row' },
          button('Заменить текущим кругом', () => {
            cur.config = cloneConfig(app.cfg);
            update(true);
          }),
          button('Открыть в редакторе', () => {
            app.cfg = cloneConfig(cur.config);
            persist();
            openCircle();
          }),
        ),
      );
    }

    if (!app.lib.circles.some((c) => c.id === pick)) pick = app.lib.circles[0]?.id ?? '';
    const libSel = h(
      'select',
      {
        'aria-label': 'Круг из библиотеки',
        onchange: () => {
          pick = libSel.value;
        },
      },
      ...app.lib.circles.map((c) => h('option', { value: c.id, selected: c.id === pick }, c.name)),
    );
    const nodesSec = sec(
      'nodes',
      `Круги системы (${s.nodes.length})`,
      rows.length
        ? h(
            'ul',
            { class: 'node-list' },
            // параметры выбранного круга раскрываются прямо под его строкой
            ...rows.flatMap((row, i) => (nodeControls && s.nodes[i].id === app.selected ? [row, h('li', null, nodeControls)] : [row])),
          )
        : h('p', { class: 'note' }, 'Пока пусто. Первый круг становится главным в раскладках «На ободе», «Вложенные» и «Спутники».'),
      app.lib.circles.length
        ? h(
            'div',
            { class: 'row' },
            libSel,
            button('Добавить', () => {
              const c = app.lib.circles.find((x) => x.id === pick);
              if (c) add(c.name, c.config);
            }),
          )
        : h('p', { class: 'note' }, 'В библиотеке пока нет сохранённых кругов.'),
      h(
        'div',
        { class: 'row' },
        button('Добавить текущий круг', () => add(`Круг ${app.cfg.seed}`, app.cfg)),
        button('Добавить случайный', () => {
          const seed = randomSeed();
          const cfg = randomizeConfig(app.cfg, seed, { layers: false, script: false, style: true, color: true });
          cfg.phrase = '';
          add(`Круг ${seed}`, cfg);
        }),
      ),
    );

    const styleSec = sec(
      'sys-style',
      'Стиль системы',
      check(bind, 'unify', 'Единый стиль и цвет линий у всех кругов', true),
      select(bind, 'style.mode', s.unify ? 'Линии' : 'Линии связей и рамки', [
        ['clean', 'Чистые'],
        ['chalk', 'Мел'],
      ], true),
      range(bind, 'style.weight', 'Толщина', 0.5, 2, 0.05, '×'),
      s.style.mode === 'chalk' && range(bind, 'style.rough', 'Грубость мела', 0.3, 2.5, 0.1),
      ...colorControls(bind, s.color, () => update(true)),
    );

    const sizeSel = h(
      'select',
      {
        'aria-label': 'Размер PNG по длинной стороне',
        onchange: () => {
          pngSize = Number(sizeSel.value);
        },
      },
      ...[1024, 2048, 4096].map((v) => h('option', { value: String(v), selected: v === pngSize }, `${v} px`)),
    );
    const saveSec = sec(
      'sys-save',
      'Сохранить и экспорт',
      text(bind, 'name', 'Название'),
      h(
        'div',
        { class: 'row' },
        button(
          'В библиотеку',
          () => {
            if (!s.nodes.length) return toast('В системе нет кругов', 'err');
            app.lib.systems.unshift({ id: uid(), name: s.name || 'Система', createdAt: Date.now(), system: JSON.parse(JSON.stringify(s)) });
            persistLibrary();
            toast(`Система «${s.name || 'Система'}» сохранена`);
          },
          'primary',
        ),
        button('Очистить', () => {
          if (s.nodes.length && !confirm('Убрать все круги из системы?')) return;
          s.nodes = [];
          s.links = [];
          s.manual = false;
          app.selected = null;
          update(true);
        }),
      ),
      h(
        'div',
        { class: 'row' },
        button('Скачать SVG', () => downloadText(`${fileName(s.name, 'system')}.svg`, systemSvg(s, 'x').svg, 'image/svg+xml')),
        button('Скачать PNG', () => {
          const out = systemSvg(s, 'x', { px: pngSize });
          const k = pngSize / Math.max(out.vb[2], out.vb[3]);
          svgToPng(out.svg, Math.round(out.vb[2] * k), Math.round(out.vb[3] * k))
            .then((blob) => downloadBlob(`${fileName(s.name, 'system')}.png`, blob))
            .catch((e: Error) => toast(e.message, 'err'));
        }),
        sizeSel,
      ),
    );

    panel.replaceChildren(layoutSec, nodesSec, styleSec, saveSec);
    panel.scrollTop = scroll;
  }

  rebuild();
  render();
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
