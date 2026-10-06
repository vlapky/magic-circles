import { defaultConfig, normalizeConfig, type CircleConfig, type Locks } from '../core/config';
import { loadLibrary, loadSession, saveLibrary, saveSession, type Library } from '../store/storage';
import { defaultSystem, normalizeSystem, type SystemConfig } from '../system/types';
import type { AnimSettings } from '../anim/motion';
import { toast } from './dom';

export type Tab = 'circle' | 'evolve' | 'anim' | 'system' | 'library';
const TABS: Tab[] = ['circle', 'evolve', 'anim', 'system', 'library'];

/** Настройки вкладки «Анимация»; силы и чувствительность — 0…100. */
export interface AnimState extends AnimSettings {
  mode: 'tempo' | 'music';
  bpm: number;
  sens: number;
  evoOn: boolean;
  evoStrength: number;
  /** мутация каждые N ударов */
  evoEvery: number;
  /** around — потомки оригинала, drift — каждый шаг от предыдущего */
  evoWalk: 'around' | 'drift';
}

const ANIM_DEFAULT: AnimState = {
  mode: 'tempo',
  bpm: 100,
  rot: 50,
  pulse: 60,
  flicker: 30,
  glow: 50,
  sens: 50,
  pattern: 0,
  still: [],
  evoOn: false,
  evoStrength: 25,
  evoEvery: 4,
  evoWalk: 'around',
};

export interface App {
  tab: Tab;
  cfg: CircleConfig;
  sys: SystemConfig;
  locks: Locks;
  /** фраза задаёт не только сид, но и структуру круга */
  auto: boolean;
  /** выбранный узел системы */
  selected: string | null;
  /** эволюция: сила изменений в процентах и зерно текущего набора вариантов */
  evo: { strength: number; nonce: string };
  anim: AnimState;
  /** раскрытые секции панелей */
  open: Set<string>;
  lib: Library;
}

const session = loadSession();

export const app: App = {
  tab: TABS.includes(session.tab as Tab) ? (session.tab as Tab) : 'circle',
  cfg: session.cfg ? normalizeConfig(session.cfg) : defaultConfig(),
  sys: session.sys ? normalizeSystem(session.sys) : defaultSystem(),
  locks: { layers: false, script: false, style: false, color: false, ...(session.locks as Partial<Locks> | undefined) },
  auto: session.auto ?? true,
  selected: null,
  evo: { strength: 30, nonce: 'first', ...session.evo },
  anim: { ...ANIM_DEFAULT, ...(session.anim as Partial<AnimState> | undefined) },
  open: new Set(session.open ?? ['seed', 'layers', 'layout', 'nodes', 'evo', 'evo-current']),
  lib: loadLibrary(),
};

let timer = 0;

/** Отложенное автосохранение текущей работы. */
export function persist(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    saveSession({ cfg: app.cfg, sys: app.sys, locks: app.locks, auto: app.auto, tab: app.tab, evo: app.evo, anim: app.anim, open: [...app.open] });
  }, 250);
}

export function persistLibrary(): void {
  if (!saveLibrary(app.lib)) toast('Не удалось сохранить: хранилище браузера переполнено', 'err');
}
