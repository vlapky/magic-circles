import { TAU, TOP, polar } from '../core/geom';
import { makeRng } from '../core/rng';
import { R0 } from '../layers/ctx';
import type { SystemConfig, SystemLink, SystemNode } from './types';

// Древо: позиции десяти сфер (колонка, ряд) и 22 пути между ними.
const TREE_POS: [number, number][] = [
  [0, 0], [1, 1], [-1, 1], [1, 3], [-1, 3], [0, 4], [1, 5], [-1, 5], [0, 6], [0, 7.6],
];
const TREE_LINKS: [number, number][] = [
  [0, 1], [0, 2], [0, 5], [1, 2], [1, 3], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5], [3, 6],
  [4, 5], [4, 7], [5, 6], [5, 7], [5, 8], [6, 7], [6, 8], [6, 9], [7, 8], [7, 9], [8, 9],
];

/** Расставляет круги системы по шаблону и строит связи. Ручные правки после этого сохраняются. */
export function applyLayout(sys: SystemConfig): void {
  const nodes = sys.nodes;
  const n = nodes.length;
  const s = sys.spread;
  const links: SystemLink[] = [];
  const rng = makeRng(`${sys.seed}/layout`);
  sys.manual = false;
  nodes.forEach((nd) => {
    nd.rot = 0;
    nd.opaque = false;
  });
  if (!n) {
    sys.links = links;
    return;
  }

  switch (sys.layout) {
    case 'chain': {
      const step = R0 * 1.5 * s;
      nodes.forEach((nd, i) => {
        nd.x = 0;
        nd.y = (i - (n - 1) / 2) * step;
        nd.scale = 1;
      });
      break;
    }
    case 'orbit':
    case 'nested':
    case 'satellites': {
      const host = nodes[0];
      host.x = 0;
      host.y = 0;
      host.scale = 1;
      const m = n - 1;
      const base = sys.layout === 'nested' ? Math.min(0.34, 1.5 / Math.max(3, m)) : Math.min(0.32, 2.2 / Math.max(4, m));
      for (let i = 0; i < m; i++) {
        const nd = nodes[i + 1];
        const a = TOP + (i * TAU) / m;
        if (sys.layout === 'orbit') {
          nd.scale = base;
          [nd.x, nd.y] = polar(R0 * s, a);
          nd.opaque = true;
        } else if (sys.layout === 'nested') {
          nd.scale = base * rng.range(0.75, 1.15);
          [nd.x, nd.y] = polar(R0 * 0.52 * s * rng.range(0.9, 1.1), a + rng.range(-0.12, 0.12));
          nd.opaque = true;
        } else {
          nd.scale = base;
          [nd.x, nd.y] = polar((R0 + R0 * base + 46) * s, a);
          links.push({ a: host.id, b: nd.id });
        }
      }
      break;
    }
    case 'tree': {
      const sc = 0.27;
      const dx = 158 * s;
      const dy = 98 * s;
      nodes.forEach((nd, i) => {
        const [cx, cy] = TREE_POS[i % TREE_POS.length];
        const lap = Math.floor(i / TREE_POS.length);
        nd.x = cx * dx + lap * dx * 3.4;
        nd.y = (cy - 3.8) * dy;
        nd.scale = sc;
      });
      for (const [a, b] of TREE_LINKS) if (a < n && b < n) links.push({ a: nodes[a].id, b: nodes[b].id });
      break;
    }
    case 'star': {
      const sc = Math.min(0.42, 2.4 / Math.max(5, n));
      const r = R0 * 1.35 * s;
      nodes.forEach((nd, i) => {
        [nd.x, nd.y] = polar(r, TOP + (i * TAU) / n);
        nd.scale = sc;
      });
      const k = n >= 5 ? 2 : 1;
      const seen = new Set<string>();
      for (let i = 0; i < n && n > 1; i++) {
        const j = (i + k) % n;
        const key = [Math.min(i, j), Math.max(i, j)].join('-');
        if (i === j || seen.has(key)) continue;
        seen.add(key);
        links.push({ a: nodes[i].id, b: nodes[j].id });
      }
      break;
    }
  }
  sys.links = links;
}

/** Добавляет круг: по раскладке, а если круги уже двигали вручную — рядом, ничего не трогая. */
export function addNode(sys: SystemConfig, node: SystemNode): void {
  if (sys.manual && sys.nodes.length) {
    let right = -Infinity;
    for (const n of sys.nodes) right = Math.max(right, n.x + R0 * n.scale);
    node.scale = 0.3;
    node.x = right + R0 * 0.3 + 20;
    node.y = 0;
    sys.nodes.push(node);
    return;
  }
  sys.nodes.push(node);
  applyLayout(sys);
}

export function removeNode(sys: SystemConfig, id: string): void {
  sys.nodes = sys.nodes.filter((n) => n.id !== id);
  sys.links = sys.links.filter((l) => l.a !== id && l.b !== id);
  if (!sys.manual) applyLayout(sys);
}
