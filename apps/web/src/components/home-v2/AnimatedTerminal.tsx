import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

type Line =
  | { type: 'command'; text: string }
  | { type: 'output'; text: string; tone?: 'success' | 'body' };

type RenderedLine = { kind: 'command' | 'output'; text: string; tone?: 'success' | 'body'; typedLen: number };

const toneColor = (line: RenderedLine) => {
  if (line.kind === 'command') return undefined; // prompt + body colored inline
  if (line.tone === 'success') return '#6ee7a8';
  return 'rgba(255,255,255,0.7)';
};

export const AnimatedTerminal = memo(function AnimatedTerminal() {
  const { prefersReducedMotion } = useMotionConfig();
  // Live club data from the shared home-page query (React Query dedupes by key,
  // so this reuses the cache the rest of the page already fills — no extra call).
  const { data } = useHomePageData();
  const s = data?.stats;
  const statsLine = s
    ? `${s.members}+ developers · ${s.events}+ events · ${s.achievements}+ achievements`
    : 'a growing student developer community';
  // Real recent wins (featured achievements) — no fabricated commit log.
  const recent = (data?.featuredAchievements ?? [])
    .slice(0, 3)
    .map((a) => a.title)
    .filter(Boolean);
  const recentKey = recent.join('|');

  // Script is built entirely from live data — nothing hard-coded.
  const script = useMemo<Line[]>(() => {
    const out: Line[] = [
      { type: 'command', text: 'whoami' },
      { type: 'output', text: 'codescriet — official coding club of SCRIET, CCSU', tone: 'body' },
      { type: 'command', text: 'codescriet --stats' },
      { type: 'output', text: statsLine, tone: 'body' },
    ];
    if (recent.length) {
      out.push({ type: 'command', text: 'codescriet --recent' });
      recent.forEach((t) => out.push({ type: 'output', text: t, tone: 'success' }));
    }
    out.push({ type: 'command', text: 'join codescriet' });
    out.push({ type: 'output', text: "Welcome aboard. Let's build.", tone: 'success' });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsLine, recentKey]);

  const [lines, setLines] = useState<RenderedLine[]>([]);
  const [cursorLine, setCursorLine] = useState(0);
  // The script is strictly sequential — only one timeout is ever pending — so a
  // single handle is enough (and avoids growing an array across loop restarts).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pause the typing loop while the terminal is off-screen or the tab is hidden
  // — no point animating an invisible element (frees the timer chain on mobile).
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let inView = true;
    let visible = !document.hidden;
    const sync = () => setActive(inView && visible);
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      sync();
    });
    io.observe(el);
    const onVis = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener('visibilitychange', onVis);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    // Reduced motion: render the fully-typed final state, no animation loop.
    if (prefersReducedMotion) {
      setLines(
        script.map((l) => ({
          kind: l.type,
          text: l.text,
          tone: l.type === 'output' ? l.tone : undefined,
          typedLen: l.text.length,
        })),
      );
      setCursorLine(-1);
      return;
    }

    // Off-screen / tab hidden: freeze whatever is shown, don't schedule timers.
    if (!active) return;

    let cancelled = false;
    const schedule = (fn: () => void, ms: number) => {
      timer.current = setTimeout(() => !cancelled && fn(), ms);
    };

    const run = () => {
      setLines([]);
      let index = 0;

      const next = () => {
        if (cancelled) return;
        if (index >= script.length) {
          // Loop: pause 3s, fade handled by CSS opacity on restart.
          schedule(run, 3000);
          return;
        }
        const line = script[index];
        setCursorLine(index);

        if (line.type === 'output') {
          // Output prints instantly.
          setLines((prev) => [...prev, { kind: 'output', text: line.text, tone: line.tone, typedLen: line.text.length }]);
          index += 1;
          schedule(next, 360);
          return;
        }

        // Command: type character-by-character at slightly variable speed.
        setLines((prev) => [...prev, { kind: 'command', text: line.text, typedLen: 0 }]);
        let ci = 0;
        const typeChar = () => {
          if (cancelled) return;
          ci += 1;
          setLines((prev) => {
            const copy = prev.slice();
            const last = copy[copy.length - 1];
            if (last) copy[copy.length - 1] = { ...last, typedLen: ci };
            return copy;
          });
          if (ci < line.text.length) {
            schedule(typeChar, 45 + Math.random() * 60);
          } else {
            index += 1;
            schedule(next, 420);
          }
        };
        schedule(typeChar, 260);
      };

      next();
    };

    run();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [prefersReducedMotion, script, active]);

  return (
    <div ref={rootRef} className="hx-underglow home-float">
      <div className="hx-terminal">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]/90" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]/90" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]/90" />
          </div>
          <span className="flex-1 text-center font-mono text-[12px] text-white/45">codescriet@scriet:~</span>
          <span className="w-12" aria-hidden="true" />
        </div>

        {/* Body */}
        <div className="relative min-h-[270px] px-5 py-4 font-mono text-[13px] leading-relaxed sm:text-sm">
          {lines.map((line, i) => {
            const showCursor = i === cursorLine;
            if (line.kind === 'command') {
              return (
                <div key={i} className="whitespace-pre-wrap break-words">
                  <span className="text-[#f97316]">$ </span>
                  <span className="text-white/90">{line.text.slice(0, line.typedLen)}</span>
                  {showCursor && <span className="hx-cursor" />}
                </div>
              );
            }
            return (
              <div key={i} className="whitespace-pre-wrap break-words" style={{ color: toneColor(line) }}>
                <span className="text-white/35">{'> '}</span>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
