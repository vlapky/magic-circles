export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const phraseToSeed = (phrase: string): string =>
  cyrb53(phrase.trim().toLowerCase().replace(/\s+/g, ' ')).toString(36);

export const randomSeed = (): string =>
  Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');

export interface Rng {
  (): number;
  range(lo: number, hi: number): number;
  /** integer in [lo, hi], both inclusive */
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  weighted<T>(items: readonly (readonly [T, number])[]): T;
}

export function makeRng(key: string): Rng {
  let a = cyrb53(key) >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.weighted = (items) => {
    let total = 0;
    for (const [, w] of items) total += w;
    let x = next() * total;
    for (const [v, w] of items) {
      x -= w;
      if (x < 0) return v;
    }
    return items[items.length - 1][0];
  };
  return next;
}

/** Независимый поток для слоя: включение одного слоя не сдвигает случайность остальных. */
export const subRng = (seed: string, name: string): Rng => makeRng(`${seed}/${name}`);
