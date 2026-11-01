import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useVisualActivity } from '@/hooks/use-visual-activity';

export type CoreState = 'connecting' | 'idle' | 'speaking' | 'error';

/* ------------------------------------------------------------------------------------------
 * NeuralCore — the advisor's intelligence rendered as a living filament lattice.
 * Several folded shells of nodes in 3D, wired to their nearest neighbours, threaded by long
 * filaments from a white-hot nucleus. Speech ripples outward through the shells and fires
 * synaptic pulses along the wiring. `amplitude` is a 0..1 ref so live audio RMS can drive it.
 * ---------------------------------------------------------------------------------------- */

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSprite(rgb: [number, number, number]) {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const g = s.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`);
  grd.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.18)`);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return s;
}

type Pulse = { e: number; p: number; v: number; fwd: boolean; life: number };

type CoreProps = {
  size: number;
  state?: CoreState;
  /** live 0..1 level; when omitted, 'speaking' runs a gentle internal thinking rhythm */
  amplitude?: MutableRefObject<number>;
  /** neuron count — scale down for small placements */
  nodes?: number;
  bloom?: boolean;
  /** render a single settled frame and stop (for many small instances) */
  still?: boolean;
  className?: string;
};

export function NeuralCore({ size, state = 'idle', amplitude, nodes: requestedNodes = 640, bloom: withBloom = true, still = false, className }: CoreProps) {
  const mobile = useMediaQuery('(max-width: 639px), (pointer: coarse)');
  const nodes = mobile ? Math.min(requestedNodes, 220) : requestedNodes;
  const active = useVisualActivity();
  const activeRef = useRef(active);
  activeRef.current = active;
  const internalAmp = useRef(0);
  const ampRef = amplitude ?? internalAmp;
  const external = !!amplitude;
  const wrap = useRef<HTMLDivElement>(null);
  const onScreen = useRef(true);
  const main = useRef<HTMLCanvasElement>(null);
  const bloom = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Static topology — built once.
  const topo = useMemo(() => {
    const rnd = mulberry32(20301);
    const N = nodes;
    const sc = Math.max(0.15, nodes / 640);
    const SHELLS: [number, number][] = [[0.4, 0.18], [0.68, 0.34], [0.95, 0.48]]; // radius, share of nodes
    const counts = SHELLS.map(([, f]) => Math.round(N * f));
    counts[2] = N - counts[0] - counts[1];
    const dir = new Float32Array(N * 3);
    const shell = new Float32Array(N);
    const scatter = new Float32Array(N * 3);
    const hub = new Uint8Array(N);
    const ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // each shell is an even golden-spiral lattice (structure), lightly jittered (organic)
      const si = i < counts[0] ? 0 : i < counts[0] + counts[1] ? 1 : 2;
      const base = si === 0 ? 0 : si === 1 ? counts[0] : counts[0] + counts[1];
      const n = counts[si], k = i - base;
      const yy = 1 - ((k + 0.5) / n) * 2;
      const rr = Math.sqrt(1 - yy * yy);
      const th = k * 2.39996323 + si * 1.1;
      let x = Math.cos(th) * rr + (rnd() - 0.5) * 0.16, y = yy + (rnd() - 0.5) * 0.16, z = Math.sin(th) * rr + (rnd() - 0.5) * 0.16;
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      dir[i * 3] = x; dir[i * 3 + 1] = y; dir[i * 3 + 2] = z;
      shell[i] = SHELLS[si][0] + (rnd() - 0.5) * 0.1;
      const sr = 1.5 + rnd() * 0.9;
      scatter[i * 3] = (dir[i * 3] + (rnd() - 0.5)) * sr;
      scatter[i * 3 + 1] = (dir[i * 3 + 1] + (rnd() - 0.5)) * sr;
      scatter[i * 3 + 2] = (dir[i * 3 + 2] + (rnd() - 0.5)) * sr;
      hub[i] = rnd() < (nodes < 200 ? 0.07 : 0.045) ? 1 : 0;
      ph[i] = rnd() * Math.PI * 2;
    }
    // petal lobes — directions the mind bulges toward
    const LB = 7;
    const lobes = new Float32Array(LB * 4);
    for (let k = 0; k < LB; k++) {
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      lobes[k * 4] = x / l; lobes[k * 4 + 1] = y / l; lobes[k * 4 + 2] = z / l; lobes[k * 4 + 3] = 0.5 + rnd() * 0.7;
    }
    // Neural wiring — not a uniform mesh. Sparse local synapses inside each layer, axons that
    // reach between layers, and hub neurons that fan out widely. Every edge carries a strength,
    // so a few pathways read bright and most stay faint.
    const seen = new Set<number>();
    const ea: number[] = [];
    const eb: number[] = [];
    const ew: number[] = [];
    const add = (i: number, j: number, w: number) => {
      if (i === j) return;
      const key = i < j ? i * N + j : j * N + i;
      if (seen.has(key)) return;
      seen.add(key); ea.push(i); eb.push(j); ew.push(w);
    };
    const layer = (i: number) => (i < counts[0] ? 0 : i < counts[0] + counts[1] ? 1 : 2);
    const nearest = (i: number, k: number, filter: (j: number) => boolean) => {
      const best: [number, number][] = [];
      const xi = dir[i * 3] * shell[i], yi = dir[i * 3 + 1] * shell[i], zi = dir[i * 3 + 2] * shell[i];
      for (let j = 0; j < N; j++) {
        if (j === i || !filter(j)) continue;
        const dx = dir[j * 3] * shell[j] - xi, dy = dir[j * 3 + 1] * shell[j] - yi, dz = dir[j * 3 + 2] * shell[j] - zi;
        const d = dx * dx + dy * dy + dz * dz;
        if (best.length < k) { best.push([d, j]); best.sort((a, b) => a[0] - b[0]); }
        else if (d < best[k - 1][0]) { best[k - 1] = [d, j]; best.sort((a, b) => a[0] - b[0]); }
      }
      return best.map(([, j]) => j);
    };
    for (let i = 0; i < N; i++) {
      const L = layer(i);
      // local synapses: 1-2 within the same layer, skipping some for an irregular weave
      const local = nearest(i, 2, (j) => layer(j) === L);
      local.forEach((j, n) => { if (n === 0 || rnd() < 0.45) add(i, j, 0.15 + Math.pow(rnd(), 3) * 0.45); });
      // axons: reach into the next layer out
      if (L < 2 && rnd() < 0.7) for (const j of nearest(i, 1, (j) => layer(j) === L + 1)) add(i, j, 0.45 + rnd() * 0.3);
    }
    for (let i = 0; i < N; i++) {
      if (!hub[i]) continue;
      // hub neurons fan out across layers with strong dendrites
      for (const j of nearest(i, 8, () => true)) if (rnd() < 0.75) add(i, j, 0.7 + rnd() * 0.3);
    }
    const adj: number[][] = Array.from({ length: N }, () => []);
    ea.forEach((a, k) => { adj[a].push(k); adj[eb[k]].push(k); });
    // long filaments from the nucleus
    const F = Math.round(26 * sc);
    const fil = Array.from({ length: F }, () => {
      let n = Math.floor(rnd() * N);
      while (layer(n) !== 0) n = Math.floor(rnd() * N);
      return { n, ox: rnd() - 0.5, oy: rnd() - 0.5, oz: rnd() - 0.5, ph: rnd() * 6.28 };
    });
    // nucleus rays
    const RAYS = Math.round(36 * Math.max(0.4, sc));
    const rays = new Float32Array(RAYS * 4);
    for (let i = 0; i < RAYS; i++) {
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      rays[i * 4] = x / l; rays[i * 4 + 1] = y / l; rays[i * 4 + 2] = z / l; rays[i * 4 + 3] = 0.12 + rnd() * 0.42;
    }
    // radial currents — half the motes fall inward to the core, half stream out from it
    const M = Math.round(150 * sc);
    const motes = new Float32Array(M * 6);
    for (let i = 0; i < M; i++) {
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      motes[i * 6] = x / l; motes[i * 6 + 1] = y / l; motes[i * 6 + 2] = z / l;
      motes[i * 6 + 3] = rnd(); // phase
      motes[i * 6 + 4] = 0.055 + rnd() * 0.05; // speed (cycles/s)
      motes[i * 6 + 5] = i % 2; // 0 = imploding, 1 = expanding
    }
    // ambient dust
    const D = Math.round(260 * sc);
    const dust = new Float32Array(D * 4);
    for (let i = 0; i < D; i++) {
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      const r = 1.25 + rnd() * 1.3;
      dust[i * 4] = (x / l) * r; dust[i * 4 + 1] = (y / l) * r; dust[i * 4 + 2] = (z / l) * r; dust[i * 4 + 3] = rnd();
    }
    return { lobes, LB, N, dir, shell, scatter, hub, ph, ea: Int32Array.from(ea), eb: Int32Array.from(eb), ew: Float32Array.from(ew), adj, fil, rays, RAYS, dust, D, motes, M, rnd };
  }, [nodes]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { onScreen.current = e.isIntersecting; });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const amplitude = ampRef;
    const c = main.current;
    const bc = bloom.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const bctx = bc?.getContext('2d') ?? null;
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.75);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    if (bc) { bc.width = Math.round(size / 2); bc.height = Math.round(size / 2); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const { lobes, LB, N, dir, shell, scatter, hub, ph, ea, eb, ew, adj, fil, rays, RAYS, dust, D, motes, M, rnd } = topo;
    const E = ea.length;
    const cx = size / 2, cy = size / 2;
    const R = size * 0.34;
    const cam = R * 4.2;
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N), ps = new Float32Array(N);
    const wx = new Float32Array(N), wy = new Float32Array(N), wz = new Float32Array(N);
    const eBucket = new Uint8Array(E);
    const B = 6;
    const spriteCyan = makeSprite([103, 232, 249]);
    const spriteRose = makeSprite([251, 113, 133]);
    const pulses: Pulse[] = [];

    let raf = 0;
    let last = performance.now();
    const born = still ? last - 10000 : last;
    let t = still ? 40 : 0, yaw = 0, smooth = 0, vis = still ? 1 : 0, errMix = 0;

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const frame = (now: number) => {
      if ((document.hidden || !onScreen.current || !activeRef.current) && !still) { last = now; raf = requestAnimationFrame(frame); return; }
      if (mobile && !still && now - last < 1000 / 30) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const speed = reduce ? 0.15 : 1;
      t += dt * speed;
      const st = stateRef.current;
      const target = st === 'speaking' ? (external ? amplitude.current : 0.34 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.63)) : st === 'connecting' ? 0.12 + 0.08 * Math.sin(t * 3) : st === 'error' ? 0 : external ? Math.max(0.035, amplitude.current * 0.75) : 0.035;
      smooth += (target - smooth) * Math.min(1, dt * 3.2);
      const amp = smooth;
      errMix += ((st === 'error' ? 1 : 0) - errMix) * Math.min(1, dt * 3);
      const asm = Math.min(1, (now - born) / 2200);
      const a = 1 - Math.pow(1 - asm, 3); // assemble ease
      vis += ((st === 'error' ? 0.55 : st === 'connecting' ? 0.8 : 1) - vis) * Math.min(1, dt * 2);
      yaw += dt * speed * (0.035 + amp * 0.03);
      const pitch = 0.32 + Math.sin(t * 0.13) * 0.16;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const breathe = Math.sin(t * 0.5); // counter-phase: inner layers swell while outer layers draw in

      const project = (x: number, y: number, z: number, out: number[]) => {
        const x1 = x * cyw + z * syw;
        const z1 = -x * syw + z * cyw;
        const y1 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        const s = cam / (cam - z2);
        out[0] = cx + x1 * s; out[1] = cy + y1 * s; out[2] = z2; out[3] = s;
      };
      const tmp = [0, 0, 0, 0];

      // ---- node positions
      for (let i = 0; i < N; i++) {
        const x = dir[i * 3], y = dir[i * 3 + 1], z = dir[i * 3 + 2], s = shell[i];
        const f = Math.sin(x * 2.1 + t * 0.16 + 1.3) * Math.cos(y * 2.4 - t * 0.12) + 0.5 * Math.sin(z * 2.7 + t * 0.19);
        const ripple = Math.sin(s * 6 - t * 2.4);
        let lobe = 0;
        for (let q = 0; q < LB; q++) {
          const d = x * lobes[q * 4] + y * lobes[q * 4 + 1] + z * lobes[q * 4 + 2];
          if (d > 0) lobe += lobes[q * 4 + 3] * d * d * d * (0.85 + 0.15 * Math.sin(t * 0.45 + q * 1.3) + amp * 0.12 * Math.sin(t * 1.1 + q));
        }
        const o = Math.max(0, Math.min(1, (s - 0.4) / 0.55)); // 0 = inner, 1 = outer
        const counter = Math.max(-1, Math.min(1, (0.66 - s) / 0.28)) * 0.075 * breathe;
        const k = 1 + (1 - o) * (0.28 * lobe - 0.2 + 0.08 * f) + o * 0.018 * f + counter + amp * (0.035 * ripple + 0.03 * (1 - o));
        const r = R * s * k;
        let X = x * r, Y = y * r, Z = z * r;
        if (a < 1) {
          X = lerp(scatter[i * 3] * R, X, a); Y = lerp(scatter[i * 3 + 1] * R, Y, a); Z = lerp(scatter[i * 3 + 2] * R, Z, a);
        }
        wx[i] = X; wy[i] = Y; wz[i] = Z;
        project(X, Y, Z, tmp);
        px[i] = tmp[0]; py[i] = tmp[1]; pz[i] = tmp[2]; ps[i] = tmp[3];
      }

      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'lighter';

      const cBack = [lerp(37, 159, errMix), lerp(99, 18, errMix), lerp(235, 57, errMix)];
      const cFront = [lerp(186, 254, errMix), lerp(246, 205, errMix), lerp(255, 211, errMix)];
      const col = (b: number, al: number) => {
        const k = b / (B - 1);
        return `rgba(${Math.round(lerp(cBack[0], cFront[0], k))},${Math.round(lerp(cBack[1], cFront[1], k))},${Math.round(lerp(cBack[2], cFront[2], k))},${al})`;
      };
      const depth = (z: number) => Math.max(0, Math.min(B - 1, Math.floor(((z / (R * 1.15)) * 0.5 + 0.5) * B)));

      // ---- ambient dust
      ctx.fillStyle = col(2, 0.35 * vis * a);
      ctx.beginPath();
      for (let i = 0; i < D; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * 0.5 + dust[i * 4 + 3] * 20);
        project(dust[i * 4] * R, dust[i * 4 + 1] * R, dust[i * 4 + 2] * R, tmp);
        const s = (0.6 + tw * 0.9) * tmp[3];
        ctx.rect(tmp[0], tmp[1], s, s);
      }
      ctx.fill();

      // ---- radial currents (implode + expand simultaneously)
      {
        const sp = errMix > 0.5 ? spriteRose : spriteCyan;
        const speedK = 1 + amp * 0.6;
        for (let i = 0; i < M; i++) {
          const u = (motes[i * 6 + 3] + t * motes[i * 6 + 4] * speedK) % 1;
          const out = motes[i * 6 + 5] === 1;
          const env = Math.pow(Math.sin(Math.PI * u), 1.4) * vis * a;
          if (env < 0.01) continue;
          const dx = motes[i * 6], dy = motes[i * 6 + 1], dz = motes[i * 6 + 2];
          for (let k = 0; k < 4; k++) {
            const uu = u - k * 0.012;
            const r = out ? R * (0.08 + uu * 1.12) : R * (1.2 - uu * 1.12);
            project(dx * r, dy * r, dz * r, tmp);
            const front = Math.max(0, Math.min(1, (tmp[2] / (R * 1.15)) * 0.5 + 0.5));
            const sz = (2.6 + front * 2.4) * tmp[3] * (1 - k * 0.18);
            ctx.globalAlpha = env * (0.4 + front * 0.6) * (1 - k * 0.27);
            ctx.drawImage(sp, tmp[0] - sz / 2, tmp[1] - sz / 2, sz, sz);
          }
        }
        ctx.globalAlpha = 1;
      }

      // ---- nucleus glow
      const gR = R * (0.6 + amp * 0.22);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gR);
      g.addColorStop(0, errMix > 0.5 ? `rgba(253,164,175,${0.55 * vis})` : `rgba(207,250,254,${(0.5 + amp * 0.4) * vis})`);
      g.addColorStop(0.25, errMix > 0.5 ? `rgba(244,63,94,${0.18 * vis})` : `rgba(34,211,238,${(0.2 + amp * 0.25) * vis})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - gR, cy - gR, gR * 2, gR * 2);

      // ---- nucleus rays
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = col(5, (0.08 + amp * 0.14) * vis * a);
      ctx.beginPath();
      for (let i = 0; i < RAYS; i++) {
        const fl = 0.8 + 0.2 * Math.sin(t * 0.7 + i * 1.7) + amp * 0.5;
        const L = R * rays[i * 4 + 3] * fl;
        project(rays[i * 4] * L, rays[i * 4 + 1] * L, rays[i * 4 + 2] * L, tmp);
        ctx.moveTo(cx, cy);
        ctx.lineTo(tmp[0], tmp[1]);
      }
      ctx.stroke();

      // ---- long filaments (nucleus → outer lattice), drawn back/front split
      for (let pass = 0; pass < 2; pass++) {
        ctx.lineWidth = pass ? 0.9 : 0.6;
        ctx.strokeStyle = col(pass ? 4 : 1, (pass ? 0.1 : 0.05) * (1 + amp * 0.8) * vis * a);
        ctx.beginPath();
        for (const fl of fil) {
          const n = fl.n;
          if ((pz[n] > 0 ? 1 : 0) !== pass) continue;
          const sw = Math.sin(t * 0.22 + fl.ph) * 0.3;
          const mx = wx[n] * 0.45 + fl.ox * R * (0.55 + sw);
          const my = wy[n] * 0.45 + fl.oy * R * (0.55 + sw);
          const mz = wz[n] * 0.45 + fl.oz * R * (0.55 + sw);
          project(mx, my, mz, tmp);
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(tmp[0], tmp[1], px[n], py[n]);
        }
        ctx.stroke();
      }

      // ---- lattice wiring, batched by depth
      for (let e = 0; e < E; e++) eBucket[e] = depth((pz[ea[e]] + pz[eb[e]]) * 0.5) * 3 + (ew[e] < 0.42 ? 0 : ew[e] < 0.7 ? 1 : 2);
      for (let bb = 0; bb < B * 3; bb++) {
        const b = Math.floor(bb / 3), str = bb % 3;
        ctx.lineWidth = 0.35 + b * 0.1 + str * 0.22;
        ctx.strokeStyle = col(b, Math.min(0.95, (0.03 + 0.07 * b) * [0.6, 1.1, 1.6][str] * (0.9 + amp * 0.6)) * vis * a);
        ctx.beginPath();
        for (let e = 0; e < E; e++) {
          if (eBucket[e] !== bb) continue;
          const i = ea[e], j = eb[e];
          const bend = 1 + 0.1 * Math.sin(e * 0.37 + t * 0.25);
          project((wx[i] + wx[j]) * 0.5 * bend, (wy[i] + wy[j]) * 0.5 * bend, (wz[i] + wz[j]) * 0.5 * bend, tmp);
          ctx.moveTo(px[i], py[i]);
          ctx.quadraticCurveTo(tmp[0], tmp[1], px[j], py[j]);
        }
        ctx.stroke();
      }

      // ---- nodes
      const sprite = errMix > 0.5 ? spriteRose : spriteCyan;
      for (let i = 0; i < N; i++) {
        const d = ((pz[i] / (R * 1.15)) * 0.5 + 0.5);
        const front = Math.max(0, Math.min(1, d));
        const tw = hub[i] ? 0.7 + 0.3 * Math.sin(t * 0.8 + ph[i]) : 1;
        const s = (hub[i] ? 11 + amp * 4 : 2.6 + front * 3.4) * ps[i] * tw;
        ctx.globalAlpha = Math.min(1, (0.15 + front * 0.8) * vis * a * (hub[i] ? 1 : 0.85));
        ctx.drawImage(sprite, px[i] - s / 2, py[i] - s / 2, s, s);
      }

      // ---- synaptic pulses
      if (!reduce && a > 0.6) {
        const rate = st === 'error' ? 0 : 0.012 + amp * 0.35;
        let spawn = rate * dt * 60;
        while (spawn > 0 && pulses.length < 36) {
          if (spawn < 1 && rnd() > spawn) break;
          let pe = Math.floor(rnd() * E);
          for (let tries = 0; tries < 4 && ew[pe] < 0.42; tries++) pe = Math.floor(rnd() * E);
          pulses.push({ e: pe, p: 0, v: 0.5 + rnd() * 0.6, fwd: rnd() > 0.5, life: 4 + Math.floor(rnd() * 4) });
          spawn -= 1;
        }
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const P = pulses[k];
        P.p += P.v * dt;
        if (P.p >= 1) {
          const end = P.fwd ? eb[P.e] : ea[P.e];
          P.life--;
          const nb = adj[end];
          if (P.life <= 0 || !nb.length) { pulses.splice(k, 1); continue; }
          const ne = nb[Math.floor(rnd() * nb.length)];
          P.e = ne; P.fwd = ea[ne] === end; P.p = 0;
        }
        const i0 = P.fwd ? ea[P.e] : eb[P.e];
        const i1 = P.fwd ? eb[P.e] : ea[P.e];
        const x = lerp(px[i0], px[i1], P.p), y = lerp(py[i0], py[i1], P.p);
        const front = Math.max(0, Math.min(1, ((pz[i0] / (R * 1.15)) * 0.5 + 0.5)));
        const s = (5 + front * 6) * ps[i0];
        ctx.globalAlpha = (0.25 + front * 0.5) * vis;
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;

      // ---- white-hot core
      const coreR = R * (0.065 + amp * 0.035);
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
      cg.addColorStop(0, `rgba(255,255,255,${0.95 * vis * a})`);
      cg.addColorStop(0.35, errMix > 0.5 ? `rgba(253,164,175,${0.5 * vis})` : `rgba(165,243,252,${0.55 * vis * a})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // ---- bloom (half-res copy, blurred by CSS)
      if (bc && bctx) {
        bctx.clearRect(0, 0, bc.width, bc.height);
        bctx.drawImage(c, 0, 0, bc.width, bc.height);
      }

      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, topo, still, mobile]);

  return (
    <div ref={wrap} className={className} style={{ position: 'relative', width: size, height: size, flexShrink: 0, WebkitMaskImage: 'radial-gradient(closest-side at 50% 50%, #000 72%, transparent 100%)', maskImage: 'radial-gradient(closest-side at 50% 50%, #000 72%, transparent 100%)' }} aria-hidden>
      {withBloom && !mobile && <canvas ref={bloom} className="pointer-events-none absolute inset-0 h-full w-full opacity-90 mix-blend-screen" style={{ filter: `blur(${Math.max(2, Math.round(size * 0.025))}px) saturate(1.5) brightness(1.25)` }} />}
      <canvas ref={main} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

