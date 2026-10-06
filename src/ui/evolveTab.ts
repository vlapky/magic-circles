import { cloneConfig, type CircleConfig, type Locks } from '../core/config';
import { mutateConfig, type Mutant } from '../core/evolve';
import { makeRng, randomSeed } from '../core/rng';
import { circleSvg } from '../render/compose';
import { addNode } from '../system/layouts';
import { uid } from '../system/types';
import { button, range, type Bind } from './controls';
import { h, toast } from './dom';
import { app, persist, persistLibrary, type Tab } from './state';

const LOCKS: [keyof Locks, string][] = [
  ['layers', 'слои'],
  ['script', 'письмо'],
  ['style', 'стиль'],
  ['color', 'цвет'],
];

/** Потомков вокруг текущего круга — сетка 3×3 с родителем в центре. */
const CHILDREN = 8;
const HISTORY_MAX = 60;

/** Родословная: пройденные поколения, от старых к новым. Живёт до перезагрузки страницы. */
const history: CircleConfig[] = [];
let raf = 0;

export function mountEvolveTab(root: HTMLElement, go: (tab: Tab) => void): void {
  const grid = h('div', { class: 'evo-grid' });
  const info = h('div', { class: 'stage-info' });
  const panel = h('aside', { class: 'panel', 'aria-label': 'Настройки эволюции' });
  root.replaceChildren(h('div', { class: 'stage' }, h('div', { class: 'evo-wrap' }, grid), info), panel);

  let mutants: Mutant[] = [];

  const breed = (): void => {
    mutants = Array.from({ length: CHILDREN }, (_, i) =>
      mutateConfig(app.cfg, app.evo.strength / 100, makeRng(`${app.evo.nonce}/${i}`), app.locks),
    );
  };

  /** Потомок становится текущим кругом, прежний уходит в родословную. */
  const choose = (m: Mutant): void => {
    history.push(cloneConfig(app.cfg));
    if (history.length > HISTORY_MAX) history.shift();
    app.cfg = cloneConfig(m.config);
    app.evo.nonce = randomSeed();
    persist();
    draw();
    rebuild();
    // фокус остаётся в сетке — можно выбирать дальше с клавиатуры
    grid.querySelector<HTMLElement>('.evo-cell')?.focus();
  };

  const backTo = (index: number): void => {
    const cfg = history[index];
    if (!cfg) return;
    history.length = index;
    app.cfg = cloneConfig(cfg);
    app.evo.nonce = randomSeed();
    persist();
    draw();
    rebuild();
  };

  function draw(): void {
    breed();
    const frozen = mutants.every((m) => !m.changes.length);
    const cells: HTMLElement[] = mutants.map((m, i) => {
      const art = h('span', { class: 'evo-art', 'aria-hidden': 'true' });
      art.innerHTML = circleSvg(m.config, `e${i}`);
      const what = m.changes.length ? m.changes.join(' · ') : 'без изменений';
      return h(
        'button',
        {
          type: 'button',
          class: 'evo-cell',
          style: `background:${m.config.color.transparent ? 'transparent' : m.config.color.bg}`,
          title: what,
          'aria-label': `Вариант ${i + 1}. Изменено: ${what}`,
          disabled: !m.changes.length,
          onclick: () => choose(m),
        },
        art,
        h('span', { class: 'evo-what' }, what),
      );
    });

    const parentArt = h('span', { class: 'evo-art', 'aria-hidden': 'true' });
    parentArt.innerHTML = circleSvg(app.cfg, 'ep');
    const parent = h(
      'div',
      {
        class: 'evo-cell evo-parent',
        style: `background:${app.cfg.color.transparent ? 'transparent' : app.cfg.color.bg}`,
        role: 'img',
        'aria-label': 'Текущий круг',
      },
      parentArt,
      h('span', { class: 'evo-what' }, `Текущий · поколение ${history.length + 1}`),
    );
    cells.splice(4, 0, parent);
    grid.replaceChildren(...cells);
    info.textContent = frozen
      ? 'Все группы под замком — менять нечего. Снимите хотя бы один замок.'
      : `поколение ${history.length + 1} · сила ${app.evo.strength}% · выберите потомка — он встанет в центр`;
  }

  const redraw = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  };

  function rebuild(): void {
    const bind: Bind = {
      obj: app.evo,
      onChange: () => {
        persist();
        redraw();
      },
    };
    const name = (): string => `Круг ${app.cfg.seed} · пок. ${history.length + 1}`;

    const back = button('Шаг назад', () => backTo(history.length - 1));
    back.disabled = !history.length;

    const controls = h(
      'section',
      { class: 'section static' },
      h('h2', null, 'Эволюция'),
      h(
        'div',
        { class: 'section-body' },
        h('p', { class: 'note lead' }, 'Вокруг текущего круга — восемь его потомков. Выберите понравившегося: он встанет в центр и даст новое поколение.'),
        range(bind, 'strength', 'Сила изменений', 0, 100, 5, '%'),
        h('p', { class: 'note' }, strengthHint(app.evo.strength)),
        h(
          'div',
          { class: 'row' },
          button(
            'Новые варианты',
            () => {
              app.evo.nonce = randomSeed();
              persist();
              draw();
            },
            'primary',
          ),
          back,
        ),
        h(
          'fieldset',
          { class: 'locks' },
          h('legend', null, 'Эволюция не меняет'),
          ...LOCKS.map(([key, label]) => {
            const box = h('input', {
              type: 'checkbox',
              id: `evo-lock-${key}`,
              checked: app.locks[key],
              onchange: () => {
                app.locks[key] = box.checked;
                persist();
                draw();
              },
            });
            return h('label', { class: 'chip', for: `evo-lock-${key}` }, box, h('span', null, label));
          }),
        ),
      ),
    );
    // подсказка под ползунком обновляется без пересборки панели
    const hint = controls.querySelectorAll<HTMLElement>('.note')[1];
    controls.querySelector('input[type=range]')!.addEventListener('input', () => {
      hint.textContent = strengthHint(app.evo.strength);
    });

    const current = h(
      'section',
      { class: 'section static' },
      h('h2', null, 'Текущий круг'),
      h(
        'div',
        { class: 'section-body' },
        h(
          'div',
          { class: 'row' },
          button('Открыть в редакторе', () => go('circle')),
          button('В библиотеку', () => {
            app.lib.circles.unshift({ id: uid(), name: name(), createdAt: Date.now(), config: cloneConfig(app.cfg) });
            persistLibrary();
            toast(`«${name()}» сохранён в библиотеку`);
          }),
          button('В систему', () => {
            addNode(app.sys, { id: uid(), name: name(), config: cloneConfig(app.cfg), x: 0, y: 0, scale: 1, rot: 0, opaque: false });
            persist();
            toast(`«${name()}» добавлен в систему (${app.sys.nodes.length})`);
          }),
        ),
      ),
    );

    const line = history.map((cfg, i) => {
      const thumb = h('button', {
        type: 'button',
        class: 'evo-step',
        title: `Вернуться к поколению ${i + 1}`,
        'aria-label': `Вернуться к поколению ${i + 1}`,
        style: `background:${cfg.color.bg}`,
        onclick: () => backTo(i),
      });
      thumb.innerHTML = circleSvg(cfg, `eh${i}`, { lite: true });
      return h('li', null, thumb);
    });
    const lineage = h(
      'section',
      { class: 'section static' },
      h('h2', null, `Родословная · ${history.length}`),
      h(
        'div',
        { class: 'section-body' },
        line.length
          ? h('ol', { class: 'evo-line' }, ...line)
          : h('p', { class: 'note' }, 'Пройденные поколения появятся здесь. К любому можно вернуться и пойти по другой ветке.'),
      ),
    );

    panel.replaceChildren(controls, current, lineage);
  }

  rebuild();
  draw();
}

function strengthHint(v: number): string {
  if (v <= 15) return 'Едва заметно: сдвигаются радиусы, плотность, оттенок.';
  if (v <= 45) return 'Умеренно: меняются детали, изредка появляется или исчезает слой.';
  if (v <= 75) return 'Заметно: перестраиваются фигуры, письмо и состав слоёв.';
  return 'Резко: потомок может мало походить на родителя.';
}
