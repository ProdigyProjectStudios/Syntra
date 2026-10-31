import { useEffect, useRef } from 'react';
import { BURST_EVENT, type BurstDetail } from '@/components/neural-field';

const INTERACTIVE = 'button, a[href], [role="button"], [role="radio"], [role="tab"], summary, label[for]';

type Spark = { a: number; z: number; v: number; inward: boolean };
type Burst = { x: number; y: number; t: number; sparks: Spark[]; scale: number };

/**
 * ClickBurst — every press is a small version of the voice core: light implodes into the point
 * of contact, flashes, then expands outward as a shockwave and a spray of sparks.
 * One shared overlay canvas that only animates while a burst is alive.
 */
export function ClickBurst() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 48;
    const sg = sprite.getContext('2d')!;
    const grd = sg.createRadialGradient(24, 24, 0, 24, 24, 24);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(165,243,252,.9)');
    grd.addColorStop(0.5, 'rgba(59,130,246,.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 48, 48);

    const bursts: Burst[] = [];
    let raf = 0;
    let last = 0;
    const DUR = 0.85;
    const IMPLODE = 0.14;

    const draw = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += dt;
        if (b.t > DUR) { bursts.splice(i, 1); continue; }
        const S = b.scale;
        if (b.t < IMPLODE) {
          // implode: a ring and sparks fall into the touch point
          const k = b.t / IMPLODE;
          const e = k * k;
          ctx.strokeStyle = `rgba(103,232,249,${0.15 + 0.5 * k})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, (34 - 28 * e) * S, 0, Math.PI * 2);
          ctx.stroke();
          for (const s of b.sparks) {
            if (!s.inward) continue;
            const r = (40 * (1 - e) + 2) * S * s.z;
            ctx.globalAlpha = 0.4 + 0.6 * k;
            ctx.drawImage(sprite, b.x + Math.cos(s.a) * r - 3, b.y + Math.sin(s.a) * r - 3, 6, 6);
          }
          ctx.globalAlpha = 1;
        } else {
          // expand: flash, shockwave, outward sparks
          const k = (b.t - IMPLODE) / (DUR - IMPLODE);
          const out = 1 - Math.pow(1 - k, 3);
          const fade = 1 - k;
          const flash = Math.max(0, 1 - k * 4);
          if (flash > 0) {
            const fr = (10 + 14 * k) * S;
            ctx.globalAlpha = flash;
            ctx.drawImage(sprite, b.x - fr * 1.5, b.y - fr * 1.5, fr * 3, fr * 3);
            ctx.globalAlpha = 1;
          }
          ctx.lineWidth = 1.4 * fade + 0.3;
          ctx.strokeStyle = `rgba(103,232,249,${0.55 * fade})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, (6 + 70 * out) * S, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 0.8;
          ctx.strokeStyle = `rgba(59,130,246,${0.4 * fade})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, (4 + 44 * Math.pow(out, 1.4)) * S, 0, Math.PI * 2);
          ctx.stroke();
          for (const s of b.sparks) {
            if (s.inward) continue;
            const r = (4 + s.v * out) * S;
            const sz = 5 * fade + 1;
            ctx.globalAlpha = fade * 0.9;
            ctx.drawImage(sprite, b.x + Math.cos(s.a) * r - sz / 2, b.y + Math.sin(s.a) * r - sz / 2, sz, sz);
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (bursts.length) raf = requestAnimationFrame(draw);
      else { raf = 0; last = 0; }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.composedPath().find((node): node is HTMLElement =>
        node instanceof HTMLElement && node.matches(INTERACTIVE));
      if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      if (e.pointerType !== 'mouse' && el.hasAttribute('data-no-touch-burst')) return;
      window.dispatchEvent(new CustomEvent<BurstDetail>(BURST_EVENT, { detail: { x: e.clientX, y: e.clientY } }));
      if (e.pointerType === 'touch' && 'vibrate' in navigator) navigator.vibrate?.(6);
      if (reduce) return;
      const rect = el.getBoundingClientRect();
      const scale = Math.max(0.7, Math.min(1.4, Math.max(rect.width, rect.height) / 120));
      const sparks: Spark[] = Array.from({ length: 18 }, (_, i) => ({
        a: (i / 18) * Math.PI * 2 + Math.random() * 0.3,
        z: 0.6 + Math.random() * 0.6,
        v: 30 + Math.random() * 55,
        inward: i % 2 === 0,
      }));
      bursts.push({ x: e.clientX, y: e.clientY, t: 0, sparks, scale });
      if (bursts.length > 8) bursts.shift();
      if (!raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', fit);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />;
}
