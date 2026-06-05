import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Users, CalendarDays, Trophy } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

// Full-width "Be part of something bigger" invitation before the footer.
//
// Built on the public ember palette (--pub-* tokens) so it complements the
// footer + About page rather than the brighter amber home sections. The section
// itself is the surface: cream carries the message, and a deep ember side holds
// live stats without reading as a detached card.
export function CTASection() {
  const { shouldReduceMotion } = useMotionConfig();
  // Live stats from the shared home-page query (React Query dedupes by key, so
  // this reuses the cache filled by Hero — no extra request).
  const { data: homeData } = useHomePageData();
  const s = homeData?.stats;
  const fmt = (n?: number) => (n != null ? n.toLocaleString() : '—');

  const stats = [
    { icon: Users, value: s?.members != null ? `${fmt(s.members)}+` : '—', label: 'Active members', live: true },
    { icon: CalendarDays, value: fmt(s?.events), label: 'Events hosted', live: false },
    { icon: Trophy, value: fmt(s?.achievements), label: 'Milestones won', live: false },
  ];

  return (
    <section className="hcta-section">
      <motion.div
        initial={{ y: shouldReduceMotion ? 8 : 18 }}
        whileInView={{ y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.3 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true, margin: '-70px' }}
        className="hcta w-full"
      >
        {/* Left — the invitation */}
        <div className="hcta-main">
          <span className="hcta-eyebrow">
            <span className="hcta-eyebrow-dot" aria-hidden="true" />
            Join code.scriet
          </span>
          <h2 className="hcta-title">
            Be part of something <em>bigger</em>.
          </h2>
          <p className="hcta-lede">
            A student-run home for people who build. Learn out loud, ship real projects,
            compete every week, and grow with developers who have your back.
          </p>
          <div className="hcta-actions">
            <Link to="/signin" className="hcta-btn hcta-btn--primary">
              Join now — it&rsquo;s free
              <span className="hcta-btn-disc">
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
            <Link to="/about" className="hcta-btn hcta-btn--ghost">
              Take a look around
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Right — deep ember stat panel */}
        <div className="hcta-aside">
          <div className="hcta-aside-cap">By the numbers</div>
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div className="hcta-stat" key={stat.label}>
                <span className="hcta-stat-ico">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <div className="hcta-stat-num">{stat.value}</div>
                  <div className="hcta-stat-label">
                    {stat.live && <span className="hcta-live animate-pulse" aria-hidden="true" />}
                    {stat.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </section>
  );
}
