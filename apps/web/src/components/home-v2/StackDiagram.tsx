import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { motion, useInView } from 'framer-motion';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { SystemDesignIcon } from './icons';

// ---------------------------------------------------------------------------
// Node glyphs — tiny inline duotone icons (white line + amber accent) so the
// diagram stays on-brand without pulling generic library icons.
// ---------------------------------------------------------------------------
const G = { stroke: 'currentColor', amber: 'currentColor' };

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G.stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const glyphs: Record<string, ReactNode> = {
  browser: <Glyph><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 8h18" /><circle cx="5.5" cy="6" r="0.5" fill={G.amber} stroke={G.amber} /></Glyph>,
  cloud: <Glyph><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18Z" /><path d="M9.5 14l2 2 3.5-3.5" stroke={G.amber} /></Glyph>,
  react: <Glyph><ellipse cx="12" cy="12" rx="9" ry="3.5" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.4" fill={G.amber} stroke={G.amber} /></Glyph>,
  server: <Glyph><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><circle cx="7" cy="7.5" r="0.6" fill={G.amber} stroke={G.amber} /><circle cx="7" cy="16.5" r="0.6" fill={G.amber} stroke={G.amber} /></Glyph>,
  db: <Glyph><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" stroke={G.amber} /></Glyph>,
  git: <Glyph><line x1="7" y1="4" x2="7" y2="20" /><circle cx="7" cy="6" r="1.6" /><circle cx="7" cy="18" r="1.6" /><path d="M7 9c5 0 5 3 10 3" /><circle cx="17" cy="12" r="1.6" fill={G.amber} stroke={G.amber} /></Glyph>,
};

type NodeDef = { key: string; label: string; glyph: ReactNode; x: number; accent: string };
// viewBox is 1100 x 240; node centers sit on a single horizontal rail.
const NODES: NodeDef[] = [
  { key: 'browser', label: 'Browser', glyph: glyphs.browser, x: 90, accent: '#f59e0b' },
  { key: 'cloud', label: 'Cloudflare', glyph: glyphs.cloud, x: 274, accent: '#ff6b35' },
  { key: 'react', label: 'React Frontend', glyph: glyphs.react, x: 458, accent: '#ef4444' },
  { key: 'node', label: 'Node API', glyph: glyphs.server, x: 642, accent: '#22c55e' },
  { key: 'pg', label: 'PostgreSQL', glyph: glyphs.db, x: 826, accent: '#c2410c' },
  { key: 'git', label: 'GitHub CI', glyph: glyphs.git, x: 1010, accent: '#6b7280' },
];
const RAIL_Y = 120;
const STEP = 0.22; // seconds between each node revealing

const Header = (
  <div className="mb-12 text-center">
    <span className="glass-pill mx-auto mb-4 inline-flex px-3.5 py-1.5 text-[12px] font-medium hx-t2">
      <SystemDesignIcon size={16} /> Under the hood
    </span>
    <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
      The codescriet <span className="hx-grad-text">Stack</span>
    </h2>
    <p className="mx-auto mt-3 max-w-xl text-sm hx-t2 sm:text-base">
      From the browser to the database — every request flows through a stack we build, ship and run ourselves.
    </p>
  </div>
);

export function StackDiagram() {
  const { isMobile, prefersReducedMotion } = useMotionConfig();
  const ref = useRef<HTMLDivElement>(null);
  // Play once when the section scrolls into view — no scroll-scrubbing.
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const play = inView || prefersReducedMotion;
  // Continuous (not once): the looping rail dots only run while the diagram is
  // on-screen, so they stop churning rAF when scrolled away (and never animate
  // under reduced motion).
  const dotsInView = useInView(ref, { margin: '-80px' });
  const showDots = dotsInView && !prefersReducedMotion;
  const [active, setActive] = useState(-1);

  // Sweep a brighter amber ring along the nodes as they appear, then settle.
  useEffect(() => {
    if (!inView || prefersReducedMotion) return;
    const ids = NODES.map((_, i) => setTimeout(() => setActive(i), i * STEP * 1000));
    const end = setTimeout(() => setActive(-1), NODES.length * STEP * 1000 + 700);
    return () => {
      ids.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [inView, prefersReducedMotion]);

  // ---- Mobile: simple vertical flow ----
  if (isMobile) {
    return (
      <section className="hsec hsec-mist relative px-4 py-20">
        <div className="container mx-auto max-w-md">
          {Header}
          <div ref={ref} className="relative pl-2">
            <div className="absolute bottom-3 left-[22px] top-3 w-px bg-gradient-to-b from-[#f97316]/60 to-[#f97316]/15" />
            <div className="space-y-4">
              {NODES.map((node, i) => (
                <motion.div
                  key={node.key}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -16 }}
                  animate={play ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.45, delay: i * 0.12 }}
                  className="hx-node"
                  style={{ '--ca': node.accent } as CSSProperties}
                >
                  <span className="hx-node-ico">{node.glyph}</span>
                  <span className="text-sm font-medium hx-t1">{node.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---- Desktop: horizontal rail, auto-plays on enter ----
  return (
    <section className="hsec hsec-mist relative px-4 py-24">
      <div className="container mx-auto">
        {Header}
        <div ref={ref} className="relative w-full" style={{ aspectRatio: '1100 / 240' }}>
          <svg viewBox="0 0 1100 240" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="hx-rail" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="22%" stopColor="#ff6b35" />
                <stop offset="44%" stopColor="#ef4444" />
                <stop offset="64%" stopColor="#22c55e" />
                <stop offset="84%" stopColor="#c2410c" />
                <stop offset="100%" stopColor="#6b7280" />
              </linearGradient>
            </defs>
            {NODES.slice(0, -1).map((node, i) => {
              const to = NODES[i + 1];
              const delay = i * STEP + 0.12;
              return (
                <g key={node.key}>
                  <motion.line
                    x1={node.x}
                    y1={RAIL_Y}
                    x2={to.x}
                    y2={RAIL_Y}
                    stroke="url(#hx-rail)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    initial={prefersReducedMotion ? false : { pathLength: 0 }}
                    animate={play ? { pathLength: 1 } : {}}
                    transition={{ duration: 0.4, delay, ease: 'easeInOut' }}
                  />
                  {showDots &&
                    [0, 1].map((p) => (
                      <motion.circle
                        key={p}
                        r={3}
                        cy={RAIL_Y}
                        fill={to.accent}
                        initial={{ opacity: 0 }}
                        animate={{ cx: [node.x + 14, to.x - 14], opacity: [0, 1, 1, 0] }}
                        transition={{
                          duration: 2.4,
                          repeat: Infinity,
                          ease: 'linear',
                          delay: delay + 0.4 + p * 1.2,
                        }}
                      />
                    ))}
                </g>
              );
            })}
          </svg>

          {NODES.map((node, i) => (
            <div
              key={node.key}
              className="hx-node-pos"
              style={{ left: `${(node.x / 1100) * 100}%`, top: '50%' }}
            >
              <motion.div
                className="hx-node"
                data-active={active === i ? 'true' : undefined}
                style={{ '--ca': node.accent } as CSSProperties}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.7 }}
                animate={play ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.4, delay: i * STEP, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="hx-node-ico">{node.glyph}</span>
                <span className="text-sm font-medium hx-t1">{node.label}</span>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
