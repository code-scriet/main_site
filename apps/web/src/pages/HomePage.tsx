import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { Hero } from '@/components/home/Hero';
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
        url="/"
        keywords="code.scriet, codescriet, code scriet, SCRIET coding club, DSA club, programming club, competitive programming, web development"
      />
      <Hero />
      <AboutPreview />
      <UpcomingEvents />
      <LatestAnnouncements />
      <AchievementsShowcase />
      <TeamHighlight />
      <NetworkHighlight />
      <CTASection />
    </Layout>
  );
}
