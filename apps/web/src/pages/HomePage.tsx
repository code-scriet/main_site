import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { HomeBackground } from '@/components/home/HomeBackground';
import { Hero } from '@/components/home/Hero';
import { StatsBento } from '@/components/home/StatsBento';
import { StackDiagram } from '@/components/home/StackDiagram';
import { AboutPreview } from '@/components/home/AboutPreview';
import { UpcomingEvents } from '@/components/home/UpcomingEvents';
import { LatestAnnouncements } from '@/components/home/LatestAnnouncements';
import { AchievementsShowcase } from '@/components/home/AchievementsShowcase';
import { TeamHighlight } from '@/components/home/TeamHighlight';
import { NetworkHighlight } from '@/components/home/NetworkHighlight';
import { CTASection } from '@/components/home/CTASection';

export default function HomePage() {
  return (
    <Layout>
      <SEO
        title="code.scriet — Official Coding Club of CCSU"
        description="The official coding club of SCRIET, CCS University Meerut. Join us for DSA, competitive programming, hackathons, and tech events."
        url="/"
      />
      {/* `home-v2` scopes the redesign's CSS. The palette follows the global
          theme toggle (light cream ⇄ dark charcoal) via `html.dark`. */}
      <div className="home-v2 relative">
        <HomeBackground />
        <Hero />
        <StatsBento />
        <StackDiagram />
        <AboutPreview />
        <UpcomingEvents />
        <LatestAnnouncements />
        <AchievementsShowcase />
        <TeamHighlight />
        <NetworkHighlight />
        <CTASection />
      </div>
    </Layout>
  );
}
