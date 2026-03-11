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
        title="code.scriet — Official Coding Club of CCSU"
        description="The official coding club of SCRIET, CCS University Meerut. Join us for DSA, competitive programming, hackathons, and tech events."
        url="/"
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
