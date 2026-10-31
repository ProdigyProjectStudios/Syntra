import { useMemo } from 'react';

function rng(seed: number) {
  let a = seed * 9301 + 49297;
  return () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
}

/**
 * Constellation — a small, seeded fragment of the advisor's neural network. Used as a quiet
 * signature on cards and icons; signals travel its synapses, brighter when the card is hovered.
 */
export function Constellation({ seed = 1, hue = '187 92% 69%', className }: { seed?: number; hue?: string; className?: string }) {
  const { nodes, edges } = useMemo(() => {
    const r = rng(seed);
    const W = 220, H = 170;
    const nodes = Array.from({ length: 13 }, () => ({ x: 14 + r() * (W - 28), y: 14 + r() * (H - 28), hub: r() < 0.2 }));
    const edges: [number, number][] = [];
    const seen = new Set<string>();
    nodes.forEach((a, i) => {
      const near = nodes
        .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
        .filter((o) => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, a.hub ? 3 : 2);
      near.forEach(({ j }) => {
        const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(k)) { seen.add(k); edges.push([i, j]); }
      });
    });
    return { nodes, edges };
  }, [seed]);

  return (
    <svg viewBox="0 0 220 170" className={className} aria-hidden>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={`hsl(${hue} / .28)`} strokeWidth="0.6" />
      ))}
      {edges.map(([a, b], i) => i % 3 === 0 && (
        <line
          key={`s${i}`}
          x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
          stroke={`hsl(${hue})`}
          strokeWidth="1.2"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="6 94"
          className="constellation-signal"
          style={{ animationDelay: `${(i * 0.37) % 2.4}s` }}
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          {n.hub && <circle cx={n.x} cy={n.y} r="5" fill={`hsl(${hue} / .18)`} />}
          <circle cx={n.x} cy={n.y} r={n.hub ? 2 : 1.2} fill={n.hub ? 'hsl(185 100% 92%)' : `hsl(${hue} / .8)`} />
        </g>
      ))}
    </svg>
  );
}
