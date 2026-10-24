"use client";

import { useEffect, useRef, type Ref } from "react";
import { animate, createTimer, type JSAnimation } from "animejs";
import {
  SHAPES,
  heartbeat,
  makeShape,
  project,
  repel,
  springStep,
  type ShapeName,
} from "@/lib/landing/particles";

export interface ParticleFieldHandle {
  morphTo: (shape: ShapeName) => void;
}

interface ParticleFieldProps {
  ref?: Ref<ParticleFieldHandle>;
  initialShape?: ShapeName;
}

// Near particles are brighter: deep violet at the back, white-pink at the front.
const PALETTE = ["#5b23c7", "#8a3ffc", "#b26bff", "#e2b6ff", "#fff4fd"];
const BEAT_MS = 1100;
const PUSH_RADIUS = 140;
const DUST_COUNT = 70;

function particleCount(width: number): number {
  return width < 768 ? 1100 : 2400;
}

// Desktop: shape floats upper-right, leaving the lower-left for copy (like the inspo).
function stageFor(width: number, height: number) {
  const mobile = width < 768;
  return {
    cx: mobile ? width * 0.5 : width * 0.6,
    cy: mobile ? height * 0.32 : height * 0.4,
    scale: Math.min(width, height) * (mobile ? 0.3 : 0.27),
    fov: 3.2,
  };
}

/**
 * Full-bleed canvas of ~1.7k particles that hold a 3D shape, slowly rotate,
 * pulse to a heartbeat, scatter away from the cursor and spring back.
 * `morphTo` re-forms them into another shape with a staggered tween.
 */
export function ParticleField({ ref, initialShape = "torus" }: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = particleCount(window.innerWidth);
    const shapes = Object.fromEntries(SHAPES.map((s) => [s, makeShape(s, count)])) as Record<
      ShapeName,
      Float32Array
    >;

    const from = Float32Array.from(shapes[initialShape]);
    let to = shapes[initialShape];
    const lag = Float32Array.from({ length: count }, () => Math.random() * 0.45);
    const size = Float32Array.from({ length: count }, () => 0.6 + Math.random() * 1.1);
    const ox = new Float32Array(count);
    const oy = new Float32Array(count);
    const vx = new Float32Array(count);
    const vy = new Float32Array(count);
    const buckets = PALETTE.map(() => new Int32Array(count));
    const bucketLen = new Int32Array(PALETTE.length);
    const px = new Float32Array(count);
    const py = new Float32Array(count);
    const pr = new Float32Array(count);

    const dust = Array.from({ length: DUST_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.6,
      speed: 0.00002 + Math.random() * 0.00005,
      sway: Math.random() * Math.PI * 2,
    }));

    const morph = { t: 1 };
    let tween: JSAnimation | null = null;
    const pointer = { x: -9999, y: -9999, nx: 0, ny: 0 };
    const tilt = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let stage = stageFor(1, 1);
    let spin = 0;
    let last = performance.now();

    const local = (i: number) => {
      const t = Math.min(1, Math.max(0, (morph.t * 1.45 - lag[i]) / 1));
      // inOutCubic per particle so the stagger reads as a swirl, not a fade.
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    };

    const morphTo = (shape: ShapeName) => {
      if (shapes[shape] === to && morph.t >= 1) return;
      for (let i = 0; i < count; i++) {
        const t = local(i);
        for (let a = 0; a < 3; a++) {
          const j = i * 3 + a;
          from[j] = from[j] + (to[j] - from[j]) * t;
        }
      }
      to = shapes[shape];
      tween?.pause();
      morph.t = 0;
      tween = animate(morph, { t: 1, duration: reduced ? 0 : 2200, ease: "linear" });
    };

    if (ref && typeof ref === "object") ref.current = { morphTo };
    else if (typeof ref === "function") ref({ morphTo });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stage = stageFor(width, height);
    };
    resize();

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.nx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ny = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (canvas.getBoundingClientRect().bottom <= 0) return;

      spin += reduced ? 0 : dt * 0.00018;
      tilt.x += (pointer.ny * 0.35 - tilt.x) * 0.04;
      tilt.y += (pointer.nx * 0.5 - tilt.y) * 0.04;
      const pulse = reduced ? 0 : heartbeat(now / BEAT_MS);
      const scale = stage.scale * (1 + pulse * 0.035);

      const ay = spin + tilt.y;
      const ax = 0.95 + tilt.x; // resting tilt shows the torus as a band, not a line
      const cy = Math.cos(ay);
      const sy = Math.sin(ay);
      const cx = Math.cos(ax);
      const sx = Math.sin(ax);

      ctx.clearRect(0, 0, width, height);

      // Soft core glow that breathes with the pulse.
      const glow = ctx.createRadialGradient(stage.cx, stage.cy, 0, stage.cx, stage.cy, scale * 1.5);
      glow.addColorStop(0, `rgba(255, 228, 250, ${0.32 + pulse * 0.18})`);
      glow.addColorStop(1, "rgba(255, 228, 250, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      bucketLen.fill(0);
      for (let i = 0; i < count; i++) {
        const t = local(i);
        const j = i * 3;
        const x0 = from[j] + (to[j] - from[j]) * t;
        const y0 = from[j + 1] + (to[j + 1] - from[j + 1]) * t;
        const z0 = from[j + 2] + (to[j + 2] - from[j + 2]) * t;

        // rotate around x (tilt) then y (spin)
        const y1 = y0 * cx - z0 * sx;
        const z1 = y0 * sx + z0 * cx;
        const x2 = x0 * cy + z1 * sy;
        const z2 = -x0 * sy + z1 * cy;

        const p = project(x2, y1, z2, { ...stage, scale });
        const push = repel(p.x + ox[i] - pointer.x, p.y + oy[i] - pointer.y, PUSH_RADIUS, 2.4);
        const sxs = springStep(ox[i], vx[i], push.fx, 0.045, 0.88);
        const sys = springStep(oy[i], vy[i], push.fy, 0.045, 0.88);
        ox[i] = sxs.offset;
        vx[i] = sxs.velocity;
        oy[i] = sys.offset;
        vy[i] = sys.velocity;

        px[i] = p.x + ox[i];
        py[i] = p.y + oy[i];
        pr[i] = size[i] * p.k * (width < 768 ? 1.7 : 2.3);
        const b = Math.max(0, Math.min(PALETTE.length - 1, Math.floor((p.k - 0.76) * 9)));
        buckets[b][bucketLen[b]++] = i;
      }

      for (let b = 0; b < PALETTE.length; b++) {
        ctx.fillStyle = PALETTE[b];
        ctx.beginPath();
        const list = buckets[b];
        for (let n = 0; n < bucketLen[b]; n++) {
          const i = list[n];
          ctx.moveTo(px[i] + pr[i], py[i]);
          ctx.arc(px[i], py[i], pr[i], 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // Drifting petals/dust across the whole sky.
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.beginPath();
      for (const d of dust) {
        d.y -= d.speed * dt;
        if (d.y < -0.02) d.y = 1.02;
        const x = (d.x + Math.sin(now * 0.0004 + d.sway) * 0.01) * width;
        const y = d.y * height;
        ctx.moveTo(x + d.r, y);
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    const timer = createTimer({
      duration: Infinity,
      onUpdate: () => draw(performance.now()),
    });

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    return () => {
      timer.cancel();
      tween?.pause();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      if (ref && typeof ref === "object") ref.current = null;
    };
  }, [ref, initialShape]);

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 h-full w-full" />;
}
