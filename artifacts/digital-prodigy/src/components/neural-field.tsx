import { useEffect, useRef } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';

/** Fired by ClickBurst so the ambient network can react to every press. */
export const BURST_EVENT = 'dp:neural-burst';
export type BurstDetail = { x: number; y: number };

/**
 * NeuralField — the voice console's mind, flattened into the room. A sparse, slowly drifting
 * network spans the whole workspace: neurons, faint synapses, the occasional signal. It leans
 * toward the cursor, implodes then expands around every click, and quickens while the advisor
 * is thinking. Drawn very faintly so it reads as atmosphere, never content.
 */
export function NeuralField({ energy = 0, paused = false }: { energy?: number; paused?: boolean }) {
  const mobile = useMediaQuery('(max-width: 639px), (pointer: coarse)');
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5);
    let W = 0, H = 0;
    type Node = { x: number; y: number; vx: number; vy: number; ox: number; oy: number; hub: boolean; ph: number; rate: number };
    let nodes: Node[] = [];
    const LINK = 165;

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const sg = sprite.getContext('2d')!;
    const grd = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(103,232,249,.8)');
    grd.addColorStop(0.5, 'rgba(59,130,246,.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 32, 32);

    type Sig = { a: number; b: number; p: number };
    const sigs: Sig[] = [];
    const seed = () => {
      sigs.length = 0; // signals index into the old node list
      W = window.innerWidth; H = window.innerHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = mobile
        ? Math.max(28, Math.min(42, Math.round((W * H) / 8500)))
        : Math.max(50, Math.min(170, Math.round((W * H) / 11500)));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7,
        ox: 0, oy: 0, hub: Math.random() < 0.08, ph: Math.random() * 6.28, rate: 0.05 + Math.random() * 0.09,
      }));
    };
    seed();

    const mouse = { x: -9999, y: -9999 };
    // Touch movement is scrolling/tapping, not desktop cursor hover. Only
    // ClickBurst's validated interactive presses may disturb the field on touch.
    const onMove = (e: PointerEvent) => {
      mouse.x = e.pointerType === 'mouse' ? e.clientX : -9999;
      mouse.y = e.pointerType === 'mouse' ? e.clientY : -9999;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    type Wave = { x: number; y: number; t: number };
    const waves: Wave[] = [];
    const onBurst = (e: Event) => {
      const d = (e as CustomEvent<BurstDetail>).detail;
      waves.push({ x: d.x, y: d.y, t: 0 });
      if (waves.length > 6) waves.shift();
    };

    window.addEventListener('resize', seed);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener(BURST_EVENT, onBurst);

    let raf = 0;
    let last = performance.now();
    let t = 0, en = 0;

    const frame = (now: number) => {
      if (document.hidden || pausedRef.current) { last = now; raf = requestAnimationFrame(frame); return; }
      if (mobile && now - last < 1000 / 24) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      en += (energyRef.current - en) * Math.min(1, dt * 2);
      const sp = reduce ? 0.1 : 1 + en * 0.8;

      // waves: implode (pull in) for the first beat, then expand (push out)
      for (let i = waves.length - 1; i >= 0; i--) { waves[i].t += dt; if (waves[i].t > 1.6) waves.splice(i, 1); }

      for (const n of nodes) {
        n.x += n.vx * dt * sp; n.y += n.vy * dt * sp;
        if (n.x < -40) n.x = W + 40; else if (n.x > W + 40) n.x = -40;
        if (n.y < -40) n.y = H + 40; else if (n.y > H + 40) n.y = -40;
        let fx = 0, fy = 0;
        for (const w of waves) {
          const dx = n.x - w.x, dy = n.y - w.y;
          const d = Math.hypot(dx, dy) || 1;
          const front = w.t * 420;
          const near = Math.exp(-Math.pow((d - front) / 90, 2));
          const pull = w.t < 0.18 ? -1.2 : 1;
          const k = near * pull * 34 * (1 - w.t / 1.6);
          fx += (dx / d) * k; fy += (dy / d) * k;
        }
        const mdx = mouse.x - n.x, mdy = mouse.y - n.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 220) { const k = (1 - md / 220) * 10; fx += (mdx / (md || 1)) * k; fy += (mdy / (md || 1)) * k; }
        n.ox += (fx - n.ox) * Math.min(1, dt * 6);
        n.oy += (fy - n.oy) * Math.min(1, dt * 6);
      }

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      // synapses
      const N = nodes.length;
      ctx.lineWidth = 0.6;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? `rgba(59,130,246,${0.1 + en * 0.06})` : `rgba(103,232,249,${0.17 + en * 0.1})`;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = nodes[i];
          const ax = a.x + a.ox, ay = a.y + a.oy;
          for (let j = i + 1; j < N; j++) {
            const b = nodes[j];
            const bx = b.x + b.ox, by = b.y + b.oy;
            const dx = ax - bx, dy = ay - by;
            const d2 = dx * dx + dy * dy;
            if (d2 > LINK * LINK) continue;
            const strong = d2 < (LINK * 0.5) * (LINK * 0.5);
            if ((pass === 1) !== strong) continue;
            ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
          }
        }
        ctx.stroke();
      }
      // cursor tethers
      if (mouse.x > -999) {
        ctx.strokeStyle = 'rgba(103,232,249,.16)';
        ctx.beginPath();
        for (const n of nodes) {
          const x = n.x + n.ox, y = n.y + n.oy;
          const d = Math.hypot(mouse.x - x, mouse.y - y);
          if (d < 170) { ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(x, y); }
        }
        ctx.stroke();
      }

      // neurons
      // each connection point slowly swells into a soft glow, lights its synapses, then fades back
      for (const n of nodes) {
        const x = n.x + n.ox, y = n.y + n.oy;
        const f = (t * n.rate + n.ph / 6.28) % 1;
        const glow = reduce || f > 0.13 ? 0 : Math.pow(Math.sin((Math.PI * f) / 0.13), 2);
        if (glow > 0.04) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(103,232,249,${glow * 0.22})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          for (const m of nodes) {
            if (m === n) continue;
            const mx = m.x + m.ox, my = m.y + m.oy;
            const d = Math.hypot(mx - x, my - y);
            if (d < LINK) { ctx.moveTo(x, y); ctx.lineTo(mx, my); }
          }
          ctx.stroke();
          const h = (n.hub ? 30 : 20) * (0.6 + 0.4 * glow);
          ctx.globalAlpha = glow * 0.45;
          ctx.drawImage(sprite, x - h / 2, y - h / 2, h, h);
        }
        const tw = n.hub ? 0.7 + 0.3 * Math.sin(t * 0.9 + n.ph) : 1;
        const s = (n.hub ? 9 : 3.4) * tw + glow * 3;
        ctx.globalAlpha = Math.min(1, (n.hub ? 0.7 + en * 0.3 : 0.5) + glow * 0.4);
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      }

      // signals travel along short synapses
      if (!reduce && Math.random() < (0.025 + en * 0.25) * sp && sigs.length < 14) {
        const a = Math.floor(Math.random() * N);
        let best = -1, bd = Infinity;
        for (let j = 0; j < N; j++) {
          if (j === a) continue;
          const d = Math.hypot(nodes[a].x - nodes[j].x, nodes[a].y - nodes[j].y);
          if (d < LINK && d < bd && Math.random() < 0.6) { bd = d; best = j; }
        }
        if (best >= 0) sigs.push({ a, b: best, p: 0 });
      }
      for (let k = sigs.length - 1; k >= 0; k--) {
        const s = sigs[k];
        s.p += dt * 0.9;
        if (s.p >= 1) { sigs.splice(k, 1); continue; }
        const A = nodes[s.a], B = nodes[s.b];
        const x = A.x + A.ox + (B.x + B.ox - A.x - A.ox) * s.p;
        const y = A.y + A.oy + (B.y + B.oy - A.y - A.oy) * s.p;
        ctx.globalAlpha = Math.sin(Math.PI * s.p) * 0.9;
        ctx.drawImage(sprite, x - 5, y - 5, 10, 10);
      }

      // click wave rings
      for (const w of waves) {
        const r = w.t < 0.18 ? 60 * (1 - w.t / 0.18) + 6 : (w.t - 0.18) * 420 + 6;
        const al = w.t < 0.18 ? 0.18 : 0.16 * (1 - (w.t - 0.18) / 1.42);
        if (al <= 0) continue;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(103,232,249,${al})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', seed);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener(BURST_EVENT, onBurst);
    };
  }, [mobile]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
      style={{ maskImage: 'radial-gradient(120% 100% at 50% 40%, #000 30%, rgba(0,0,0,.35) 80%)', WebkitMaskImage: 'radial-gradient(120% 100% at 50% 40%, #000 30%, rgba(0,0,0,.35) 80%)' }}
    />
  );
}
