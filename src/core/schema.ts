import { ALPHABETS, type CircleConfig, type LayerId } from './config';
import { starSteps } from './geom';

export type Show = (c: CircleConfig) => boolean;
export type Ctl =
  | { k: 'check'; p: string; label: string; re?: boolean; show?: Show }
  | { k: 'range'; p: string; label: string; min: number; max: number; step: number; unit?: string; show?: Show }
  | { k: 'select'; p: string; label: string; opts: (c: CircleConfig) => readonly (readonly [string | number, string])[]; re?: boolean; show?: Show };

export interface LayerDef {
  id: LayerId;
  title: string;
  hint: string;
  ctl: Ctl[];
}

const abc = (): typeof ALPHABETS => ALPHABETS;
const nums = (a: number, b: number): [number, string][] => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);

/** Слои круга и их параметры: по этой схеме строится панель и идут мутации. */
export const LAYERS: LayerDef[] = [
  {
    id: 'outerRing',
    title: 'Внешнее кольцо с письмом',
    hint: 'Двойной обод и полосы знаков',
    ctl: [
      { k: 'select', p: 'bands', label: 'Полос письма', opts: () => nums(1, 3) },
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'density', label: 'Плотность', min: 0.6, max: 1.5, step: 0.05 },
      { k: 'check', p: 'cells', label: 'Ячейки между знаками' },
      { k: 'check', p: 'ticks', label: 'Насечки на ободе' },
    ],
  },
  {
    id: 'polygram',
    title: 'Полиграмма',
    hint: 'Многоугольник и звезда',
    ctl: [
      { k: 'select', p: 'n', label: 'Вершин', opts: () => nums(3, 12), re: true },
      { k: 'select', p: 'mode', label: 'Фигура', opts: () => [['polygon', 'Многоугольник'], ['star', 'Звезда'], ['both', 'Оба']], re: true },
      {
        k: 'select',
        p: 'k',
        label: 'Шаг звезды',
        opts: (c) => starSteps(c.layers.polygram.n).map((k) => [k, `через ${k}`] as const),
        show: (c) => c.layers.polygram.mode !== 'polygon' && starSteps(c.layers.polygram.n).length > 0,
      },
      { k: 'range', p: 'nested', label: 'Вложенных копий', min: 0, max: 4, step: 1 },
      { k: 'range', p: 'twist', label: 'Вписанность', min: 0, max: 1, step: 0.05 },
      { k: 'check', p: 'double', label: 'Двойная линия' },
      { k: 'check', p: 'circum', label: 'Описанная окружность' },
    ],
  },
  {
    id: 'nodes',
    title: 'Малые круги',
    hint: 'На вершинах, рёбрах или орбите',
    ctl: [
      { k: 'select', p: 'place', label: 'Где', opts: () => [['vertices', 'На вершинах'], ['mids', 'На серединах рёбер'], ['orbit', 'На орбите']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 12, step: 1, show: (c) => c.layers.nodes.place === 'orbit' || !c.layers.polygram.on },
      { k: 'range', p: 'orbit', label: 'Радиус орбиты', min: 0.2, max: 1, step: 0.02, show: (c) => c.layers.nodes.place === 'orbit' },
      { k: 'range', p: 'r', label: 'Размер', min: 8, max: 42, step: 1 },
      { k: 'select', p: 'content', label: 'Внутри', opts: () => [['symbol', 'Символ'], ['glyph', 'Буква'], ['none', 'Пусто']] },
      { k: 'check', p: 'double', label: 'Двойной контур' },
      { k: 'check', p: 'radial', label: 'Повернуть от центра' },
    ],
  },
  {
    id: 'petals',
    title: 'Лепестки',
    hint: 'Дуги, арки, листья',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['vertex', 'Дуги от вершин'], ['arch', 'Арки у обода'], ['leaf', 'Листья из центра']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 16, step: 1 },
      { k: 'range', p: 'span', label: 'Размах', min: 1, max: 5, step: 1, show: (c) => c.layers.petals.type === 'vertex' },
      { k: 'range', p: 'depth', label: 'Глубина', min: 0.3, max: 1, step: 0.05, show: (c) => c.layers.petals.type !== 'vertex' },
      { k: 'check', p: 'double', label: 'Двойная линия' },
      { k: 'check', p: 'text', label: 'Письмо в арке', show: (c) => c.layers.petals.type === 'arch' },
    ],
  },
  {
    id: 'rosette',
    title: 'Розетка',
    hint: 'Пересекающиеся окружности и хорды',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['circles', 'Венок окружностей'], ['chords', 'Все хорды'], ['flower', 'Цветок жизни']], re: true },
      { k: 'range', p: 'count', label: 'Сколько', min: 3, max: 16, step: 1, show: (c) => c.layers.rosette.type !== 'flower' },
      { k: 'range', p: 'radius', label: 'Радиус', min: 0.3, max: 1, step: 0.05 },
      { k: 'range', p: 'size', label: 'Размер окружностей', min: 0.15, max: 0.6, step: 0.05, show: (c) => c.layers.rosette.type === 'circles' },
    ],
  },
  {
    id: 'innerRing',
    title: 'Внутреннее кольцо',
    hint: 'Вторая строка письма',
    ctl: [
      { k: 'range', p: 'radius', label: 'Радиус', min: 0.25, max: 0.95, step: 0.01 },
      { k: 'check', p: 'band', label: 'Полоса письма' },
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'check', p: 'fillBg', label: 'Перекрывает линии под собой' },
      { k: 'check', p: 'ticks', label: 'Насечки' },
    ],
  },
  {
    id: 'center',
    title: 'Центр',
    hint: 'Символ, печать, глаз',
    ctl: [
      { k: 'select', p: 'type', label: 'Вид', opts: () => [['symbol', 'Символ'], ['seal', 'Печать'], ['eye', 'Глаз'], ['polygram', 'Малая полиграмма'], ['rings', 'Концентрические круги'], ['dot', 'Точка']] },
      { k: 'range', p: 'size', label: 'Размер', min: 0.2, max: 1, step: 0.05 },
    ],
  },
  {
    id: 'rays',
    title: 'Лучи и оси',
    hint: 'Линии наружу с навершиями',
    ctl: [
      { k: 'range', p: 'count', label: 'Сколько', min: 1, max: 16, step: 1 },
      { k: 'range', p: 'from', label: 'Начало (0 — центр)', min: 0, max: 1, step: 0.05 },
      { k: 'range', p: 'extend', label: 'Вылет за обод', min: 0, max: 90, step: 1 },
      { k: 'select', p: 'ends', label: 'Навершие', opts: () => [['none', 'Нет'], ['cross', 'Крест'], ['dot', 'Кружок'], ['arrow', 'Стрела'], ['symbol', 'Символ']] },
      { k: 'check', p: 'offset', label: 'Между вершинами' },
    ],
  },
  {
    id: 'edgeText',
    title: 'Надписи на рёбрах',
    hint: 'Письмо вдоль сторон полиграммы',
    ctl: [
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'size', label: 'Размер', min: 5, max: 11, step: 0.5 },
    ],
  },
  {
    id: 'outside',
    title: 'Знаки снаружи',
    hint: 'Символы вокруг круга',
    ctl: [
      { k: 'range', p: 'count', label: 'Сколько', min: 1, max: 16, step: 1 },
      { k: 'select', p: 'content', label: 'Что', opts: () => [['symbol', 'Символ'], ['glyph', 'Буква']] },
      { k: 'range', p: 'dist', label: 'Отступ', min: 18, max: 90, step: 1 },
      { k: 'range', p: 'size', label: 'Размер', min: 8, max: 26, step: 1 },
      { k: 'check', p: 'ringed', label: 'В кружке' },
      { k: 'check', p: 'offset', label: 'Между вершинами' },
    ],
  },
  {
    id: 'spiral',
    title: 'Спираль письма',
    hint: 'Строка, закрученная к центру',
    ctl: [
      { k: 'select', p: 'alphabet', label: 'Письмо', opts: abc },
      { k: 'range', p: 'turns', label: 'Витков', min: 1, max: 6, step: 1 },
      { k: 'range', p: 'start', label: 'Начальный радиус', min: 0.4, max: 1, step: 0.05 },
      { k: 'range', p: 'size', label: 'Размер', min: 6, max: 12, step: 0.5 },
    ],
  },
];

/** Приводит зависимые параметры в допустимое состояние. */
export function sanitize(c: CircleConfig): void {
  const p = c.layers.polygram;
  const steps = starSteps(p.n);
  if (!steps.length) p.mode = 'polygon';
  else if (!steps.includes(p.k)) p.k = steps[0];
}
