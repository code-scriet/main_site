import { Layout } from '@/components/layout/Layout';
import { Hero } from '@/components/home/Hero';
import { AboutPreview } from '@/components/home/AboutPreview';
import { UpcomingEvents } from '@/components/home/UpcomingEvents';
import { LatestAnnouncements } from '@/components/home/LatestAnnouncements';
import { AchievementsShowcase } from '@/components/home/AchievementsShowcase';
import { TeamHighlight } from '@/components/home/TeamHighlight';
import { CTASection } from '@/components/home/CTASection';

export default function HomePage() {
  return (
    <Layout>
      <Hero />
      <AboutPreview />
      <UpcomingEvents />
      <LatestAnnouncements />
      <AchievementsShowcase />
      <TeamHighlight />
      <CTASection />
    </Layout>
  );
}
