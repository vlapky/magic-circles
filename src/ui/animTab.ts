import { BeatDetector } from '../anim/beat';
import { Motion, motionPlan, tempoBeat, tempoSignals, type MotionPlan, type Signals } from '../anim/motion';
import { getPlayer } from '../audio/player';
import { cloneConfig, type CircleConfig, type LayerId, type Locks } from '../core/config';
import { mutateConfig } from '../core/evolve';
import { makeRng, randomSeed } from '../core/rng';
import { LAYERS } from '../core/schema';
import { circleSvg } from '../render/compose';
import { uid } from '../system/types';
import { button, check, range, select, type Bind } from './controls';
import { h, toast } from './dom';
import { app, persist, persistLibrary, type Tab } from './state';

const LOCKS: [keyof Locks, string][] = [
  ['layers', 'слои'],
  ['script', 'письмо'],
  ['style', 'стиль'],
  ['color', 'цвет'],
];

/** Запас поля вокруг круга, чтобы пульсация не упиралась в край. */
const ZOOM = 1.1;

export function mountAnimTab(root: HTMLElement, go: (tab: Tab) => void): () => void {
  const player = getPlayer();
  const anim = app.anim;
  const stage = h('div', { class: 'canvas', 'aria-label': 'Анимированный круг' });
  const dot = h('span', { class: 'beat-dot', 'aria-hidden': 'true' });
  const audioBar = h('div', { class: 'audio-bar' }, player.el);
  const info = h('div', { class: 'stage-info' });
  const panel = h('aside', { class: 'panel', 'aria-label': 'Настройки анимации' });
  root.replaceChildren(h('div', { class: 'stage' }, h('div', { class: 'anim-wrap' }, stage, dot), audioBar, info), panel);

  // ---------- что показываем: оригинал либо его эволюционировавший вариант

  let shown: CircleConfig = cloneConfig(app.cfg);
  let variant = 0;
  let plan: MotionPlan = {};
  let layerEls = new Map<string, { el: Element; mask: boolean }[]>();
  let glowEls: Element[] = [];
  const motion = new Motion();

  function render(): void {
    stage.innerHTML = circleSvg(shown, 'an', { layered: true, zoom: ZOOM });
    stage.style.background = shown.color.transparent ? '' : shown.color.bg;
    layerEls = new Map();
    stage.querySelectorAll('[data-layer],[data-mask]').forEach((el) => {
      const mask = el.hasAttribute('data-mask');
      const id = el.getAttribute(mask ? 'data-mask' : 'data-layer')!;
      const list = layerEls.get(id) ?? [];
      list.push({ el, mask });
      layerEls.set(id, list);
    });
    glowEls = [...stage.querySelectorAll('filter[id$="glow"] feFuncA')];
    plan = motionPlan(shown, anim.pattern);
  }

  const restore = (): void => {
    shown = cloneConfig(app.cfg);
    variant = 0;
    render();
  };

  /** Шаг эволюции в такт: меняется только показанный вариант, не круг пользователя. */
  function evolve(): void {
    const from = anim.evoWalk === 'drift' ? shown : app.cfg;
    const m = mutateConfig(from, anim.evoStrength / 100, makeRng(`anim/${randomSeed()}`), app.locks);
    if (!m.changes.length) return;
    shown = m.config;
    variant++;
    render();
  }

  // ---------- кадры

  const detector = new BeatDetector();
  // без музыки: уважаем системную настройку «меньше движения» — старт на паузе
  let tempoOn = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clock = 0;
  let lastBeat = -1;
  let beats = 0;
  let pulse = 0;
  let raf = 0;
  let prev = performance.now();
  let frames = 0;
  let fps = 0;
  let fpsAt = prev;

  function onBeat(): void {
    beats++;
    if (anim.evoOn && beats % Math.max(1, anim.evoEvery) === 0) evolve();
  }

  /** Сигналы текущего кадра либо null, если анимация стоит. */
  function signals(now: number, dt: number): Signals | null {
    if (anim.mode === 'tempo') {
      if (!tempoOn) return null;
      clock += dt;
      const b = tempoBeat(clock, anim.bpm);
      if (b !== lastBeat) {
        lastBeat = b;
        onBeat();
      }
      return tempoSignals(clock, anim.bpm);
    }
    const bands = player.bands();
    if (!bands) return null;
    if (detector.update(bands.bass, now / 1000, dt, anim.sens / 100)) {
      pulse = 1;
      onBeat();
    } else {
      pulse *= Math.exp(-dt / 0.16);
    }
    return { beat: pulse, bass: bands.bass, mid: bands.mid, treble: bands.treble, speed: 0.25 + 1.3 * bands.level };
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    frames++;
    if (now - fpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      status();
    }
    const sig = signals(now, dt);
    if (!sig) {
      dot.style.opacity = '0';
      return;
    }
    const frame = motion.step(dt, sig, anim, plan);
    for (const [id, pose] of Object.entries(frame.layers)) {
      const els = layerEls.get(id);
      if (!els || !pose) continue;
      const tf = `rotate(${pose.rot.toFixed(2)}) scale(${pose.scale.toFixed(4)})`;
      for (const { el, mask } of els) {
        el.setAttribute('transform', tf);
        if (!mask) el.setAttribute('opacity', pose.opacity.toFixed(3));
      }
    }
    const slope = (shown.color.glowStrength * frame.glow).toFixed(3);
    for (const el of glowEls) el.setAttribute('slope', slope);
    dot.style.opacity = sig.beat.toFixed(2);
  }

  function status(): void {
    const what =
      anim.mode === 'tempo'
        ? tempoOn
          ? `свой темп · ${anim.bpm} уд/мин`
          : 'свой темп · пауза'
        : player.playing
          ? `под музыку · ${player.name}`
          : 'под музыку · нажмите «плей» в плеере';
    info.textContent = `${what} · ${fps} к/с${variant ? ` · вариант ${variant}, оригинал не тронут` : ''}`;
  }

  // ---------- панель

  const ensureTrack = (): void => {
    if (player.kind !== 'none') return;
    player
      .useBase()
      .then(() => rebuild())
      .catch(() => toast('Не удалось собрать базовый трек — загрузите свой', 'err'));
  };

  function rebuild(): void {
    const scroll = panel.scrollTop;
    const bind: Bind = {
      obj: anim,
      onChange: (path, re) => {
        if (path === 'pattern') plan = motionPlan(shown, anim.pattern);
        if (path === 'evoOn' && !anim.evoOn) restore();
        if (path === 'mode') {
          if (anim.mode === 'music') ensureTrack();
          else player.el.pause();
          detector.reset();
        }
        persist();
        if (re) rebuild();
      },
    };
    audioBar.hidden = anim.mode !== 'music';

    // --- режим и источник ритма
    const playBtn = button(tempoOn ? 'Пауза' : 'Запустить', () => {
      tempoOn = !tempoOn;
      rebuild();
    });
    const file = h('input', {
      type: 'file',
      accept: 'audio/*',
      hidden: true,
      onchange: () => {
        const f = file.files?.[0];
        if (!f) return;
        player.useFile(f);
        detector.reset();
        file.value = '';
        rebuild();
      },
    });
    const source =
      anim.mode === 'tempo'
        ? [range(bind, 'bpm', 'Темп', 40, 200, 1, ' уд/мин'), h('div', { class: 'row' }, playBtn)]
        : [
            h('p', { class: 'note lead' }, player.kind === 'none' ? 'Готовлю базовый трек…' : `Трек: ${player.name}`),
            h(
              'div',
              { class: 'row' },
              button('Загрузить трек…', () => file.click(), 'primary'),
              button('Базовый трек', () => {
                player
                  .useBase()
                  .then(() => {
                    detector.reset();
                    rebuild();
                  })
                  .catch(() => toast('Не удалось собрать базовый трек', 'err'));
              }),
              file,
            ),
            h('p', { class: 'note' }, 'Плеер — под кругом. Базовый трек синтезируется прямо в браузере; свой файл никуда не отправляется и после перезагрузки страницы его нужно выбрать снова.'),
            range(bind, 'sens', 'Чувствительность к биту', 0, 100, 5, '%'),
          ];
    const modeSec = h(
      'section',
      { class: 'section static' },
      h('h2', null, 'Анимация'),
      h(
        'div',
        { class: 'section-body' },
        select(
          bind,
          'mode',
          'Ритм задаёт',
          [
            ['tempo', 'Свой темп'],
            ['music', 'Музыка'],
          ],
          true,
        ),
        ...source,
      ),
    );

    // --- движение слоёв
    const active = LAYERS.filter((l) => app.cfg.layers[l.id].on);
    const moveSec = h(
      'section',
      { class: 'section static' },
      h('h2', null, 'Движение слоёв'),
      h(
        'div',
        { class: 'section-body' },
        range(bind, 'rot', 'Вращение', 0, 100, 5, '%'),
        range(bind, 'pulse', 'Пульс на удар', 0, 100, 5, '%'),
        range(bind, 'flicker', 'Мерцание', 0, 100, 5, '%'),
        range(bind, 'glow', 'Вспышка свечения', 0, 100, 5, '%'),
        h(
          'div',
          { class: 'row' },
          button('Перемешать движение', () => {
            anim.pattern = 1 + Math.floor(Math.random() * 99999);
            plan = motionPlan(shown, anim.pattern);
            persist();
            rebuild();
          }),
          anim.pattern !== 0 &&
            button('Стандартное', () => {
              anim.pattern = 0;
              plan = motionPlan(shown, 0);
              persist();
              rebuild();
            }),
        ),
        h(
          'fieldset',
          { class: 'chips' },
          h('legend', null, 'Какие слои движутся'),
          ...active.map((l) => {
            const id = `anim-move-${l.id}`;
            const box = h('input', {
              type: 'checkbox',
              id,
              checked: !anim.still.includes(l.id),
              onchange: () => {
                anim.still = box.checked ? anim.still.filter((x) => x !== l.id) : [...anim.still, l.id];
                if (!box.checked) freeze(l.id);
                persist();
              },
            });
            return h('label', { class: 'chip', for: id }, box, h('span', null, l.title.toLowerCase()));
          }),
        ),
      ),
    );

    // --- эволюция в такт
    const name = (): string => `Круг ${shown.seed} · вариант ${variant}`;
    const evoSec = h(
      'section',
      { class: 'section static' },
      h('h2', null, 'Эволюция в такт'),
      h(
        'div',
        { class: 'section-body' },
        check(bind, 'evoOn', 'Круг случайно меняется под ритм', true),
        h('p', { class: 'note' }, 'Меняется только то, что на экране. Круг на вкладке «Круг» остаётся прежним, пока вы сами не нажмёте «Сделать текущим».'),
        anim.evoOn && range(bind, 'evoStrength', 'Сила изменений', 0, 100, 5, '%'),
        anim.evoOn &&
          select(bind, 'evoEvery', 'Менять', [
            [1, 'каждый удар'],
            [2, 'каждые 2 удара'],
            [4, 'каждые 4 удара'],
            [8, 'каждые 8 ударов'],
            [16, 'каждые 16 ударов'],
          ]),
        anim.evoOn &&
          select(bind, 'evoWalk', 'Как', [
            ['around', 'Вариации оригинала'],
            ['drift', 'Дрейф — всё дальше'],
          ]),
        anim.evoOn &&
          h(
            'fieldset',
            { class: 'locks' },
            h('legend', null, 'Эволюция не меняет'),
            ...LOCKS.map(([key, label]) => {
              const box = h('input', {
                type: 'checkbox',
                id: `anim-lock-${key}`,
                checked: app.locks[key],
                onchange: () => {
                  app.locks[key] = box.checked;
                  persist();
                },
              });
              return h('label', { class: 'chip', for: `anim-lock-${key}` }, box, h('span', null, label));
            }),
          ),
        anim.evoOn &&
          h(
            'div',
            { class: 'row' },
            button('Вернуть оригинал', restore),
            button('Сделать текущим', () => {
              if (!variant) return toast('Сейчас показан оригинал');
              app.cfg = cloneConfig(shown);
              variant = 0;
              persist();
              toast('Вариант стал текущим кругом');
              rebuild();
            }),
            button('В библиотеку', () => {
              app.lib.circles.unshift({ id: uid(), name: name(), createdAt: Date.now(), config: cloneConfig(shown) });
              persistLibrary();
              toast(`«${name()}» сохранён в библиотеку`);
            }),
          ),
      ),
    );

    const editSec = h(
      'section',
      { class: 'section static' },
      h('div', { class: 'section-body' }, h('div', { class: 'row' }, button('Изменить круг в редакторе', () => go('circle')))),
    );

    panel.replaceChildren(modeSec, moveSec, evoSec, editSec);
    panel.scrollTop = scroll;
    status();
  }

  /** Остановленный слой возвращается в спокойное состояние, сохраняя набранный угол. */
  function freeze(id: LayerId): void {
    for (const { el, mask } of layerEls.get(id) ?? []) {
      const rot = /rotate\(([-\d.]+)\)/.exec(el.getAttribute('transform') ?? '')?.[1] ?? '0';
      el.setAttribute('transform', `rotate(${rot}) scale(1)`);
      if (!mask) el.setAttribute('opacity', '1');
    }
  }

  const onAudio = (): void => status();
  player.el.addEventListener('play', onAudio);
  player.el.addEventListener('pause', onAudio);

  render();
  rebuild();
  if (anim.mode === 'music') ensureTrack();
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    player.el.pause();
    player.el.removeEventListener('play', onAudio);
    player.el.removeEventListener('pause', onAudio);
  };
}
