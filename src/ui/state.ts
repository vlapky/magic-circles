import { defaultConfig, normalizeConfig, type CircleConfig, type Locks } from '../core/config';
import { loadLibrary, loadSession, saveLibrary, saveSession, type Library } from '../store/storage';
import { defaultSystem, normalizeSystem, type SystemConfig } from '../system/types';
import { toast } from './dom';

export type Tab = 'circle' | 'system' | 'library';

export interface App {
  tab: Tab;
  cfg: CircleConfig;
  sys: SystemConfig;
  locks: Locks;
  /** фраза задаёт не только сид, но и структуру круга */
  auto: boolean;
  /** выбранный узел системы */
  selected: string | null;
  /** раскрытые секции панелей */
  open: Set<string>;
  lib: Library;
}

const session = loadSession();

export const app: App = {
  tab: session.tab === 'system' || session.tab === 'library' ? session.tab : 'circle',
  cfg: session.cfg ? normalizeConfig(session.cfg) : defaultConfig(),
  sys: session.sys ? normalizeSystem(session.sys) : defaultSystem(),
  locks: { layers: false, script: false, style: false, color: false, ...(session.locks as Partial<Locks> | undefined) },
  auto: session.auto ?? true,
  selected: null,
  open: new Set(session.open ?? ['seed', 'layers', 'layout', 'nodes']),
  lib: loadLibrary(),
};

let timer = 0;

/** Отложенное автосохранение текущей работы. */
export function persist(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    saveSession({ cfg: app.cfg, sys: app.sys, locks: app.locks, auto: app.auto, tab: app.tab, open: [...app.open] });
  }, 250);
}

export function persistLibrary(): void {
  if (!saveLibrary(app.lib)) toast('Не удалось сохранить: хранилище браузера переполнено', 'err');
}
