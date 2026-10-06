import { normalizeConfig, type CircleConfig } from '../core/config';
import { normalizeSystem, uid, type SystemConfig } from '../system/types';

export interface SavedCircle {
  id: string;
  name: string;
  createdAt: number;
  config: CircleConfig;
}

export interface SavedSystem {
  id: string;
  name: string;
  createdAt: number;
  system: SystemConfig;
}

export interface Library {
  circles: SavedCircle[];
  systems: SavedSystem[];
}

const KEY = { circles: 'mc.circles', systems: 'mc.systems', session: 'mc.session' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const asCircle = (c: Partial<SavedCircle>): SavedCircle => ({
  id: c.id ?? uid(),
  name: c.name ?? 'Круг',
  createdAt: c.createdAt ?? Date.now(),
  config: normalizeConfig(c.config),
});

const asSystem = (s: Partial<SavedSystem>): SavedSystem => ({
  id: s.id ?? uid(),
  name: s.name ?? 'Система',
  createdAt: s.createdAt ?? Date.now(),
  system: normalizeSystem(s.system),
});

export function loadLibrary(): Library {
  return {
    circles: read<Partial<SavedCircle>[]>(KEY.circles, []).map(asCircle),
    systems: read<Partial<SavedSystem>[]>(KEY.systems, []).map(asSystem),
  };
}

export function saveLibrary(lib: Library): boolean {
  const a = write(KEY.circles, lib.circles);
  const b = write(KEY.systems, lib.systems);
  return a && b;
}

/** Разбирает импортированный JSON библиотеки; бросает ошибку, если формат не тот. */
export function parseLibrary(text: string): Library {
  const raw = JSON.parse(text) as Partial<Library>;
  if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.circles) && !Array.isArray(raw.systems))) {
    throw new Error('В файле нет кругов и систем');
  }
  return {
    circles: (raw.circles ?? []).map(asCircle),
    systems: (raw.systems ?? []).map(asSystem),
  };
}

export interface Session {
  cfg?: unknown;
  sys?: unknown;
  locks?: unknown;
  auto?: boolean;
  tab?: string;
  evo?: { strength: number; nonce: string };
  open?: string[];
}

export const loadSession = (): Session => read<Session>(KEY.session, {});
export const saveSession = (s: Session): boolean => write(KEY.session, s);
