import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Users, CalendarDays, Trophy } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';
import { CountUp } from './StatsBento';

// Full-width "be part of something bigger" invitation before the footer.
// Self-contained dark glass panel that follows the page theme.
export function CTASection() {
  const { shouldReduceMotion } = useMotionConfig();
  // Live stats reuse the shared home-page query cache (no extra request).
  const { data: homeData } = useHomePageData();
  const s = homeData?.stats;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  const stats = [
    { icon: Users, value: s?.members ?? 0, suffix: '+', label: 'Active members', live: true },
    { icon: CalendarDays, value: s?.events ?? 0, suffix: '+', label: 'Events hosted', live: false },
    { icon: Trophy, value: s?.achievements ?? 0, suffix: '+', label: 'Milestones won', live: false },
  ];

  return (
    <section ref={ref} className="relative px-4 pb-24 pt-8">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 8 : 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0.3 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        viewport={{ once: true, margin: '-70px' }}
        className="hx-underglow container mx-auto max-w-6xl"
      >
        <div className="glass-card grid items-stretch gap-0 overflow-hidden md:grid-cols-[1.4fr_1fr]">
          {/* Left — invitation */}
          <div className="p-8 sm:p-12">
            <span className="glass-pill mb-6 px-3.5 py-1.5 text-[12px] font-medium text-white/75">
              <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24] animate-pulse" />
              Join code.scriet
            </span>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              Be part of something <span className="hx-grad-text">bigger</span>.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/60">
              A student-run home for people who build. Learn out loud, ship real projects, compete every
              week, and grow with developers who have your back.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/signin"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-7 text-base font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(249,115,22,0.5)]"
              >
                Join now — it&rsquo;s free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/about"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-base font-medium text-white/90 transition-all duration-200 hover:border-[#f97316]/50 hover:bg-white/[0.07]"
              >
                Take a look around
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>

          {/* Right — stat panel */}
          <div className="relative border-t border-white/8 bg-white/[0.02] p-8 sm:p-10 md:border-l md:border-t-0">
            <div className="mb-5 text-[11px] uppercase tracking-widest text-white/40">By the numbers</div>
            <div className="space-y-5">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div className="flex items-center gap-4" key={stat.label}>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#f97316]/25 bg-[#f97316]/12 text-[#fdba74]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="hx-t1 font-display text-2xl font-bold">
                        <CountUp value={stat.value} suffix={stat.suffix} run={inView} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-white/50">
                        {stat.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                        {stat.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
