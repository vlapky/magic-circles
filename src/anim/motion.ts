import type { CircleConfig, LayerId } from '../core/config';
import { makeRng } from '../core/rng';

/** Настройки движения, все величины 0…100. */
export interface AnimSettings {
  rot: number;
  pulse: number;
  flicker: number;
  glow: number;
  /** рисунок движения: 0 — стандартный, иначе зерно случайного */
  pattern: number;
  /** слои, которые стоят на месте */
  still: string[];
}

/** Что «слышит» анимация в данный момент; всё в диапазоне 0…1, кроме speed. */
export interface Signals {
  /** удар: 1 в момент бита, затем затухает */
  beat: number;
  bass: number;
  mid: number;
  treble: number;
  /** базовая угловая скорость, рад/с */
  speed: number;
}

export interface LayerMotion {
  /** направление вращения: −1, 0 или 1 */
  dir: number;
  /** скорость относительно базовой */
  ratio: number;
  /** насколько слой отзывается на удар */
  pulse: number;
  /** насколько слой мерцает */
  flicker: number;
  /** слой повторяет поворот и масштаб другого (малые круги держатся за вершины) */
  follow?: LayerId;
}

export type MotionPlan = Partial<Record<LayerId, LayerMotion>>;

const BASE: Record<LayerId, LayerMotion> = {
  outerRing: { dir: 1, ratio: 1, pulse: 0.25, flicker: 0.6 },
  innerRing: { dir: -1, ratio: 1.5, pulse: 0.35, flicker: 0.8 },
  polygram: { dir: 1, ratio: 0.5, pulse: 0.6, flicker: 0.2 },
  nodes: { dir: -1, ratio: 0.75, pulse: 0.8, flicker: 0.3 },
  petals: { dir: -1, ratio: 0.75, pulse: 0.7, flicker: 0.4 },
  rosette: { dir: 1, ratio: 0.35, pulse: 0.9, flicker: 0.5 },
  center: { dir: 0, ratio: 1, pulse: 1, flicker: 0.1 },
  rays: { dir: -1, ratio: 0.25, pulse: 0.5, flicker: 0.5 },
  outside: { dir: -1, ratio: 0.25, pulse: 0.5, flicker: 0.7 },
  edgeText: { dir: 1, ratio: 0.5, pulse: 0.6, flicker: 1 },
  spiral: { dir: 1, ratio: 2, pulse: 0.2, flicker: 0.6 },
};

const RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/** Как движется каждый включённый слой круга. */
export function motionPlan(cfg: CircleConfig, pattern: number): MotionPlan {
  const L = cfg.layers;
  const rng = pattern ? makeRng(`motion/${pattern}`) : null;
  const plan: MotionPlan = {};
  for (const id of Object.keys(BASE) as LayerId[]) {
    // зерно тратится на каждый слой, включён он или нет: рисунок не зависит от набора слоёв
    const m: LayerMotion = { ...BASE[id] };
    if (rng) {
      m.dir = id === 'center' ? rng.pick([0, 0, -1, 1]) : rng.pick([-1, 1]);
      m.ratio = rng.pick(RATIOS);
    }
    if (L[id].on) plan[id] = m;
  }
  // слои, привязанные к вершинам полиграммы, движутся вместе с ней
  if (plan.polygram) {
    if (plan.nodes && L.nodes.place !== 'orbit') plan.nodes.follow = 'polygram';
    if (plan.edgeText) plan.edgeText.follow = 'polygram';
  } else {
    delete plan.edgeText;
  }
  if (plan.rays && plan.outside) plan.outside.follow = 'rays';
  return plan;
}

export interface Pose {
  /** градусы */
  rot: number;
  scale: number;
  opacity: number;
}

export interface Frame {
  layers: Partial<Record<LayerId, Pose>>;
  /** множитель силы свечения */
  glow: number;
}

/** Накопленное состояние движения: углы слоёв переживают перерисовку круга. */
export class Motion {
  private angles: Partial<Record<LayerId, number>> = {};

  reset(): void {
    this.angles = {};
  }

  step(dt: number, sig: Signals, set: AnimSettings, plan: MotionPlan): Frame {
    const kick = Math.min(1, 0.7 * sig.beat + 0.3 * sig.bass);
    const layers: Partial<Record<LayerId, Pose>> = {};
    const ids = Object.keys(plan) as LayerId[];

    for (const id of ids) {
      const m = plan[id]!;
      if (set.still.includes(id)) {
        layers[id] = { rot: this.angles[id] ?? 0, scale: 1, opacity: 1 };
        continue;
      }
      const a = (this.angles[id] ?? 0) + dt * sig.speed * (set.rot / 100) * m.dir * m.ratio * (1 + 0.8 * sig.mid) * (180 / Math.PI);
      this.angles[id] = ((a % 360) + 360) % 360;
      layers[id] = {
        rot: this.angles[id]!,
        scale: 1 + (set.pulse / 100) * 0.12 * m.pulse * kick,
        opacity: 1 - (set.flicker / 100) * 0.75 * m.flicker * (1 - sig.treble),
      };
    }
    for (const id of ids) {
      const lead = plan[id]!.follow;
      const own = layers[id];
      const to = lead && layers[lead];
      if (own && to && !set.still.includes(id)) {
        own.rot = to.rot;
        own.scale = to.scale;
      }
    }
    return { layers, glow: 1 + (set.glow / 100) * 1.5 * kick };
  }
}

/** Сигналы «своего темпа»: ровный бит без музыки. t — секунды, bpm — ударов в минуту. */
export function tempoSignals(t: number, bpm: number): Signals {
  const beats = (t * bpm) / 60;
  const phase = beats - Math.floor(beats);
  const eighth = beats * 2 - Math.floor(beats * 2);
  const beat = Math.exp(-5 * phase);
  return {
    beat,
    bass: beat,
    mid: 0,
    treble: Math.exp(-6 * eighth),
    // один оборот за 16 ударов при полной силе вращения и скорости слоя 1
    speed: (2 * Math.PI * bpm) / 60 / 16,
  };
}

/** Номер удара для момента t — по нему срабатывает эволюция в режиме своего темпа. */
export const tempoBeat = (t: number, bpm: number): number => Math.floor((t * bpm) / 60);
