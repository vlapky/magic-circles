import { defaultConfig, normalizeConfig, type CircleConfig, type ColorCfg, type StyleCfg } from '../core/config';

export type LayoutId = 'chain' | 'orbit' | 'nested' | 'satellites' | 'tree' | 'star';
export const LAYOUTS: [LayoutId, string, string][] = [
  ['chain', 'Цепочка', 'Круги на одной оси, соседние пересекаются'],
  ['orbit', 'На ободе', 'Малые круги сидят на ободе главного'],
  ['nested', 'Вложенные', 'Малые круги внутри большого'],
  ['satellites', 'Спутники', 'Малые круги снаружи, связаны с центром'],
  ['tree', 'Древо', 'Три колонны с соединительными дорожками'],
  ['star', 'Полиграмма', 'Круги на вершинах звезды'],
];

export interface SystemNode {
  id: string;
  name: string;
  config: CircleConfig;
  x: number;
  y: number;
  scale: number;
  /** градусы */
  rot: number;
  /** перекрывает то, что лежит под ним */
  opaque: boolean;
}

export interface SystemLink {
  a: string;
  b: string;
}

export interface SystemConfig {
  v: 1;
  name: string;
  seed: string;
  layout: LayoutId;
  spread: number;
  nodes: SystemNode[];
  links: SystemLink[];
  /** круги двигали вручную — раскладка больше не применяется автоматически */
  manual: boolean;
  linkKind: 'line' | 'double' | 'none';
  frame: 'none' | 'circle' | 'ring';
  /** единый стиль и цвет линий для всех кругов */
  unify: boolean;
  style: StyleCfg;
  color: ColorCfg;
}

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function defaultSystem(): SystemConfig {
  const d = defaultConfig();
  return {
    v: 1,
    name: 'Система',
    seed: 'conduit',
    layout: 'orbit',
    spread: 1,
    nodes: [],
    links: [],
    manual: false,
    linkKind: 'line',
    frame: 'none',
    unify: true,
    style: d.style,
    color: d.color,
  };
}

export function normalizeSystem(raw: unknown): SystemConfig {
  const base = defaultSystem();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SystemConfig>;
  const cfg = normalizeConfig({ style: r.style, color: r.color });
  return {
    ...base,
    ...r,
    v: 1,
    style: cfg.style,
    color: cfg.color,
    nodes: (r.nodes ?? []).map((n) => ({
      id: n.id ?? uid(),
      name: n.name ?? 'Круг',
      config: normalizeConfig(n.config),
      x: n.x ?? 0,
      y: n.y ?? 0,
      scale: n.scale ?? 1,
      rot: n.rot ?? 0,
      opaque: !!n.opaque,
    })),
    links: (r.links ?? []).filter((l) => l && l.a && l.b),
  };
}
