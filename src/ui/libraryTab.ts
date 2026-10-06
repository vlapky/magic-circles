import { cloneConfig } from '../core/config';
import { downloadText } from '../export/export';
import { circleSvg } from '../render/compose';
import { parseLibrary, type SavedCircle, type SavedSystem } from '../store/storage';
import { systemSvg } from '../system/build';
import { addNode } from '../system/layouts';
import { normalizeSystem, uid } from '../system/types';
import { button } from './controls';
import { h, toast } from './dom';
import { app, persist, persistLibrary, type Tab } from './state';

export function mountLibraryTab(root: HTMLElement, go: (tab: Tab) => void): void {
  const wrap = h('div', { class: 'lib' });
  root.replaceChildren(wrap);

  const rename = (item: SavedCircle | SavedSystem, input: HTMLInputElement): void => {
    item.name = input.value.trim() || item.name;
    input.value = item.name;
    persistLibrary();
  };

  const card = (item: SavedCircle | SavedSystem, svg: string, actions: HTMLElement[]): HTMLElement => {
    const thumb = h('div', { class: 'card-thumb', 'aria-hidden': 'true' });
    thumb.innerHTML = svg;
    const name = h('input', {
      type: 'text',
      class: 'card-name',
      value: item.name,
      'aria-label': 'Название',
      onchange: () => rename(item, name),
    });
    return h('li', { class: 'card' }, thumb, name, h('div', { class: 'card-actions' }, ...actions));
  };

  function render(): void {
    const { circles, systems } = app.lib;

    const circleCards = circles.map((c, i) =>
      card(c, circleSvg(c.config, `lc${i}`, { lite: true }), [
        button('Открыть', () => {
          app.cfg = cloneConfig(c.config);
          persist();
          go('circle');
        }),
        button('В систему', () => {
          addNode(app.sys, { id: uid(), name: c.name, config: cloneConfig(c.config), x: 0, y: 0, scale: 1, rot: 0, opaque: false });
          persist();
          toast(`«${c.name}» добавлен в систему (${app.sys.nodes.length})`);
        }),
        button('Копия', () => {
          circles.splice(i + 1, 0, { id: uid(), name: `${c.name} — копия`, createdAt: Date.now(), config: cloneConfig(c.config) });
          persistLibrary();
          render();
        }),
        button(
          'Удалить',
          () => {
            if (!confirm(`Удалить круг «${c.name}» из библиотеки?`)) return;
            circles.splice(i, 1);
            persistLibrary();
            render();
          },
          'danger',
        ),
      ]),
    );

    const systemCards = systems.map((s, i) =>
      card(s, systemSvg(s.system, `ls${i}`, { lite: true }).svg, [
        button('Открыть', () => {
          app.sys = normalizeSystem(JSON.parse(JSON.stringify(s.system)));
          app.selected = null;
          persist();
          go('system');
        }),
        button(
          'Удалить',
          () => {
            if (!confirm(`Удалить систему «${s.name}» из библиотеки?`)) return;
            systems.splice(i, 1);
            persistLibrary();
            render();
          },
          'danger',
        ),
      ]),
    );

    const file = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      hidden: true,
      onchange: async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          const lib = parseLibrary(await f.text());
          const known = new Set([...circles.map((c) => c.id), ...systems.map((s) => s.id)]);
          const fresh = <T extends { id: string }>(x: T): T => (known.has(x.id) ? { ...x, id: uid() } : x);
          circles.push(...lib.circles.map(fresh));
          systems.push(...lib.systems.map(fresh));
          persistLibrary();
          toast(`Импортировано: кругов ${lib.circles.length}, систем ${lib.systems.length}`);
          render();
        } catch (e) {
          toast(`Не удалось прочитать файл: ${(e as Error).message}`, 'err');
        }
        file.value = '';
      },
    });

    wrap.replaceChildren(
      h(
        'div',
        { class: 'lib-bar' },
        h('h2', null, 'Библиотека'),
        button('Экспорт JSON', () => downloadText('magic-circles-library.json', JSON.stringify(app.lib, null, 1), 'application/json')),
        button('Импорт JSON', () => file.click()),
        file,
      ),
      h('h3', null, `Круги · ${circles.length}`),
      circles.length
        ? h('ul', { class: 'cards' }, ...circleCards)
        : h('p', { class: 'empty' }, 'Здесь появятся сохранённые круги. Соберите круг на вкладке «Круг» и нажмите «В библиотеку».'),
      h('h3', null, `Системы · ${systems.length}`),
      systems.length
        ? h('ul', { class: 'cards' }, ...systemCards)
        : h('p', { class: 'empty' }, 'Здесь появятся сохранённые системы. Добавьте несколько кругов в систему и сохраните её на вкладке «Система».'),
    );
  }

  render();
}
