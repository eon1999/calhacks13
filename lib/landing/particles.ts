// Pure maths for the landing-page particle field: 3D point clouds for each
// story beat, perspective projection, and the cursor push/spring-back physics.
// The renderer (components/landing/particle-field.tsx) owns the frame loop.

export const SHAPES = ["ecg", "capsule", "wave", "heart", "sphere"] as const;
export type ShapeName = (typeof SHAPES)[number];

export interface Stage {
  cx: number;
  cy: number;
  scale: number;
  fov: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Perspective factor: >1 nearer the viewer, <1 further away. */
  k: number;
}

export interface Force {
  fx: number;
  fy: number;
}

export interface Spring {
  offset: number;
  velocity: number;
}

type Rng = () => number;
type PointFn = (rand: Rng) => [number, number, number];

// mulberry32: tiny seeded PRNG so every render of a shape is identical.
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}

// One heartbeat as an ECG trace (x, y) over u in [0, 1]: P wave, QRS spike, T wave.
// Screen y points down, so the R peak is negative.
const BEAT: [number, number][] = [
  [0, 0], [0.08, 0], [0.13, -0.12], [0.18, 0], [0.28, 0], [0.31, 0.12], [0.36, -0.95],
  [0.41, 0.32], [0.45, 0], [0.58, 0], [0.66, -0.24], [0.74, 0], [1, 0],
];
const BEATS = 2;
const TRACE: [number, number][] = Array.from({ length: BEATS }, (_, b) =>
  BEAT.slice(b === 0 ? 0 : 1).map(([u, y]): [number, number] => [-1.4 + ((b + u) / BEATS) * 2.8, y]),
).flat();
const TRACE_LEN: number[] = TRACE.reduce<number[]>((acc, p, i) => {
  const prev = i === 0 ? 0 : acc[i - 1] + Math.hypot(p[0] - TRACE[i - 1][0], (p[1] - TRACE[i - 1][1]) * 0.4);
  return [...acc, prev];
}, []);

// The heartbeat line: particles spread along the trace by arc length, with
// vertical travel weighted down (0.4) so the baseline stays solid instead of
// most particles piling onto the tall spikes.
const ecg: PointFn = (rand) => {
  const d = rand() * TRACE_LEN[TRACE_LEN.length - 1];
  let i = 1;
  while (i < TRACE_LEN.length - 1 && TRACE_LEN[i] < d) i++;
  const t = (d - TRACE_LEN[i - 1]) / (TRACE_LEN[i] - TRACE_LEN[i - 1] || 1);
  const x = TRACE[i - 1][0] + (TRACE[i][0] - TRACE[i - 1][0]) * t;
  const y = TRACE[i - 1][1] + (TRACE[i][1] - TRACE[i - 1][1]) * t;
  const spread = 0.045 * Math.sqrt(rand());
  const angle = rand() * Math.PI * 2;
  return [x + Math.cos(angle) * spread * 0.5, y + Math.sin(angle) * spread, (rand() - 0.5) * 0.18];
};

// A medication capsule: cylinder with hemispherical caps, laid diagonally.
const capsule: PointFn = (rand) => {
  const radius = 0.42;
  const half = 0.62;
  const theta = rand() * Math.PI * 2;
  const along = (rand() * 2 - 1) * (half + radius);
  let rr = radius;
  if (Math.abs(along) > half) {
    const cap = Math.abs(along) - half;
    rr = Math.sqrt(Math.max(0, radius * radius - cap * cap));
  }
  rr *= 0.92 + rand() * 0.08;
  const px = along;
  const py = rr * Math.cos(theta);
  const pz = rr * Math.sin(theta);
  const tilt = -Math.PI / 5;
  return [px * Math.cos(tilt) - py * Math.sin(tilt), px * Math.sin(tilt) + py * Math.cos(tilt), pz];
};

// A spoken waveform: stacked sine ribbons fading out at the edges.
const wave: PointFn = (rand) => {
  const x = rand() * 2.8 - 1.4;
  const envelope = Math.cos((x / 1.4) * (Math.PI / 2)) ** 1.5;
  const band = Math.floor(rand() * 3);
  const y = Math.sin(x * 5 + band * 0.9) * 0.55 * envelope * (1 - band * 0.25);
  const jitter = (rand() - 0.5) * 0.12;
  return [x, y + jitter, (band - 1) * 0.18 + (rand() - 0.5) * 0.1];
};

// A filled, slightly puffy heart.
const heart: PointFn = (rand) => {
  const t = rand() * Math.PI * 2;
  const fill = Math.sqrt(rand());
  const hx = 16 * Math.sin(t) ** 3;
  const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  const depth = (rand() * 2 - 1) * 0.35 * Math.sqrt(1 - fill * fill * 0.9);
  return [(hx / 17) * fill * 1.05, (-hy / 17) * fill * 1.05 - 0.05, depth];
};

// A soft sphere shell, denser at the surface.
const sphere: PointFn = (rand) => {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const r = 0.75 + 0.3 * Math.cbrt(rand());
  const s = Math.sqrt(1 - u * u);
  return [r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)];
};

const GENERATORS: Record<ShapeName, PointFn> = { ecg, capsule, wave, heart, sphere };

/** Interleaved xyz coordinates for `count` particles, roughly within the unit ball. */
export function makeShape(shape: ShapeName, count: number): Float32Array {
  const rand = seeded(hash(shape));
  const out = new Float32Array(count * 3);
  const gen = GENERATORS[shape];
  for (let i = 0; i < count; i++) {
    const [x, y, z] = gen(rand);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

export function project(x: number, y: number, z: number, stage: Stage): Projected {
  const k = stage.fov / (stage.fov + z);
  return { x: stage.cx + x * stage.scale * k, y: stage.cy + y * stage.scale * k, k };
}

/** Push away from the pointer; (dx, dy) is particle minus pointer. */
export function repel(dx: number, dy: number, radius: number, strength: number): Force {
  const d = Math.hypot(dx, dy);
  if (d >= radius) return { fx: 0, fy: 0 };
  if (d === 0) return { fx: 0, fy: -strength };
  const f = (1 - d / radius) ** 2 * strength;
  return { fx: (dx / d) * f, fy: (dy / d) * f };
}

/** One damped-spring step pulling `offset` back towards 0. */
export function springStep(
  offset: number,
  velocity: number,
  force: number,
  stiffness: number,
  damping: number,
): Spring {
  const v = (velocity + force - offset * stiffness) * damping;
  return { offset: offset + v, velocity: v };
}
