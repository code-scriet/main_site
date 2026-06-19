import { lazy, Suspense, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useTheme } from '@/context/ThemeContext';
import { Hero } from '@/components/home/Hero';
import { AboutPreview } from '@/components/home/AboutPreview';
import { UpcomingEvents } from '@/components/home/UpcomingEvents';
import { LatestAnnouncements } from '@/components/home/LatestAnnouncements';
import { AchievementsShowcase } from '@/components/home/AchievementsShowcase';
import { TeamHighlight } from '@/components/home/TeamHighlight';
import { NetworkHighlight } from '@/components/home/NetworkHighlight';
import { CTASection } from '@/components/home/CTASection';

// Dark-mode landing page (DEV-K's PR #90 redesign) ships in its own lazy chunk
// — only fetched in dark mode, so light/default visitors never download it.
const importHomeDark = () => import('@/components/home-v2/HomeDark');
const HomeDark = lazy(importHomeDark);

export default function HomePage() {
  const { theme } = useTheme();

  // Prefetch the dark chunk during idle time so flipping to dark mode is instant
  // — no reload, no flash. Harmless no-op if already cached or unsupported.
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const schedule = w.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const handle = schedule(() => {
      void importHomeDark();
    });
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return (
    <Layout>
      <SEO
        title="code.scriet — Official Coding Club of CCSU"
        description="The official coding club of SCRIET, CCS University Meerut. Join us for DSA, competitive programming, hackathons, and tech events."
        url="/"
      />
      {theme === 'dark' ? (
        <Suspense
          fallback={<div className="min-h-screen" style={{ background: 'var(--pub-canvas)' }} />}
        >
          <HomeDark />
        </Suspense>
      ) : (
        <>
          <Hero />
          <AboutPreview />
          <UpcomingEvents />
          <LatestAnnouncements />
          <AchievementsShowcase />
          <TeamHighlight />
          <NetworkHighlight />
          <CTASection />
        </>
      )}
    </Layout>
  );
}
