import type { CircleConfig } from '../core/config';
import type { Pt } from '../core/ir';
import type { Sym } from '../glyphs/symbols';

/** Внешний радиус круга в единицах холста. */
export const R0 = 242;

/** Базовые толщины линий — как в образце imgs/styles/lines.svg. */
export const LW = { rim: 2.8, hair: 1, ring: 1.7, edge: 1.8, star: 2.2, glyph: 1.3, thin: 0.8 };

export interface Ctx {
  cfg: CircleConfig;
  seed: string;
  /** общий множитель толщины */
  W: number;
  /** свободный радиус внутри внешнего кольца */
  edge: number;
  /** описанный радиус полиграммы */
  polyR: number;
  n: number;
  /** поворот полиграммы в радианах */
  rot: number;
  verts: Pt[];
  angles: number[];
  /** радиус свободной области в центре */
  coreR: number;
  syms: Sym[];
}
