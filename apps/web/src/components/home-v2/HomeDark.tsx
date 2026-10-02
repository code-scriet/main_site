import './home-v2.css';
import { HomeBackground } from './HomeBackground';
import { Hero } from './Hero';
import { StatsBento } from './StatsBento';
import { AboutPreview } from './AboutPreview';
import { StackDiagram } from './StackDiagram';
import { UpcomingEvents } from './UpcomingEvents';
import { LatestAnnouncements } from './LatestAnnouncements';
import { AchievementsShowcase } from './AchievementsShowcase';
import { TeamHighlight } from './TeamHighlight';
import { NetworkHighlight } from './NetworkHighlight';
import { CTASection } from './CTASection';

/**
 * Dark-mode landing page (DEV-K's PR #90 redesign). Rendered only when the
 * theme is dark — see HomePage.tsx. Lives in its own lazy chunk so light/default
 * visitors never download it or its CSS.
 *
 * The `.home-v2` wrapper scopes every redesign style + activates the
 * `html.dark .home-v2` token set. `HomeBackground` is the absolutely-positioned
 * depth layer (orbs/particles/dot-grid) behind all content.
 *
 * `StatsBento` / `StackDiagram` were committed to the PR but never wired in; they
 * are placed here (after the hero, and after the about section) — slots are a
 * best guess, flag for owner/DEV-K.
 *
 * NOTE: sections are rendered directly (no content-visibility wrapper) — each
 * section owns its own framer-motion `whileInView` scroll-reveal, and wrapping
 * them in `content-visibility:auto` suppressed those fade-ins.
 */
export default function HomeDark() {
  return (
    <div className="home-v2 relative">
      <HomeBackground />
      <Hero />
      <StatsBento />
      <AboutPreview />
      <StackDiagram />
      <UpcomingEvents />
      <LatestAnnouncements />
      <AchievementsShowcase />
      <TeamHighlight />
      <NetworkHighlight />
      <CTASection />
    </div>
  );
}
