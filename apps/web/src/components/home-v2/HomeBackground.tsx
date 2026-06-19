import { memo, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useMotionConfig } from '@/hooks/useMotionConfig';

// Deterministic pseudo-random so particle positions are stable across renders
// (and SSR/prerender) without pulling in a dependency.
const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

type Particle = {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
};

/**
 * Site-wide depth layer for the redesigned homepage: charcoal gradient base
 * (from .home-v2), faint masked dot-grid, slow-drifting amber orbs and sparse
 * rising particles. Pure decoration — pointer-events disabled, sits at z-index
 * -1 behind all content. Particle count + animation respect reduced motion and
 * mobile to stay GPU-friendly.
 */
export const HomeBackground = memo(function HomeBackground() {
  const { isMobile, prefersReducedMotion } = useMotionConfig();
  const ref = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLSpanElement>(null);

  // Fewer particles on phones (cheaper GPU); none when reduced motion is on.
  const particleCount = prefersReducedMotion ? 0 : isMobile ? 10 : 40;

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: particleCount }, (_, index) => {
      const seed = index + 1;
      return {
        id: index,
        left: seededUnit(seed) * 100,
        size: seededUnit(seed * 2.13) * 3 + 2,
        duration: seededUnit(seed * 3.07) * 14 + 14,
        delay: seededUnit(seed * 4.1) * 20,
        drift: (seededUnit(seed * 5.7) - 0.5) * 60,
      };
    });
  }, [particleCount]);

  // Pause the infinite orb/particle animations when the tab is backgrounded or
  // the page is scrolled past the first screen (toggles `.is-paused` → CSS sets
  // animation-play-state: paused). The depth layer spans the whole page, so we
  // observe a one-viewport-tall sentinel pinned to the top instead of the layer
  // itself (which would always intersect). Keeps GPU/battery idle once the user
  // scrolls into the content — matters most on Android. Reveals are untouched.
  useEffect(() => {
    const el = ref.current;
    const sentinel = sentinelRef.current;
    if (!el || !sentinel) return;
    let onScreen = true;
    let tabVisible = !document.hidden;
    const apply = () => el.classList.toggle('is-paused', !(onScreen && tabVisible));

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        apply();
      },
      { rootMargin: '120px' },
    );
    io.observe(sentinel);

    const onVisibility = () => {
      tabVisible = !document.hidden;
      apply();
    };
    document.addEventListener('visibilitychange', onVisibility);

    apply();
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div ref={ref} className="home-bg" aria-hidden="true">
      <span
        ref={sentinelRef}
        className="home-bg-sentinel"
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: 0, width: 1, height: '100vh', pointerEvents: 'none' }}
      />
      <div className="home-bg-grid" />
      <div className="home-orb home-orb--1" />
      <div className="home-orb home-orb--2" />
      <div className="home-orb home-orb--3" />
      {particles.map((p) => (
        <span
          key={p.id}
          className="home-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            '--drift': `${p.drift}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
});
