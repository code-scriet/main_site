import { memo, useEffect, useRef, type ComponentType, type CSSProperties } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, Terminal, ArrowUpRight } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';
import { EventsIcon, AchievementsIcon, NetworkIcon } from './icons';

// Count-up that only starts once scrolled into view. Mutates textContent via a
// ref so the animation frames don't trigger React re-renders.
export const CountUp = memo(function CountUp({
  value,
  suffix = '',
  run,
}: {
  value: number;
  suffix?: string;
  run: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { shouldReduceMotion } = useMotionConfig();

  useEffect(() => {
    if (!run || !ref.current) return;
    if (shouldReduceMotion || value === 0) {
      ref.current.textContent = `${value}${suffix}`;
      return;
    }
    const duration = 1600;
    let start: number | null = null;
    let raf = 0;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      if (ref.current) ref.current.textContent = `${Math.floor(eased * value)}${suffix}`;
      if (p < 1) raf = requestAnimationFrame(step);
      else if (ref.current) ref.current.textContent = `${value}${suffix}`;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, value, suffix, shouldReduceMotion]);

  return <span ref={ref}>0{suffix}</span>;
});

type StatCard = {
  icon: ComponentType<{ className?: string }>;
  value?: number;
  suffix?: string;
  label: string;
  to?: string;
  hero?: boolean;
  // Feature cards show a static title instead of an animated count.
  feature?: boolean;
  title?: string;
  accent: string;
};

export function StatsBento() {
  const { data } = useHomePageData();
  const { shouldReduceMotion } = useMotionConfig();
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: '-80px' });

  const stats = data?.stats;
  const networkCount = data?.networkHighlights?.length ?? 0;

  const cards: StatCard[] = [
    { icon: Users, value: stats?.members ?? 0, suffix: '+', label: 'Developers in the community', hero: true, accent: '#f59e0b' },
    { icon: EventsIcon, value: stats?.events ?? 0, suffix: '+', label: 'Events & workshops hosted', to: '/events', accent: '#ff6b35' },
    { icon: AchievementsIcon, value: stats?.achievements ?? 0, suffix: '+', label: 'Achievements celebrated', to: '/achievements', accent: '#ef4444' },
    { icon: NetworkIcon, value: networkCount, suffix: '+', label: 'Mentors & industry connections', to: '/network', accent: '#22c55e' },
    { icon: Terminal, feature: true, title: 'Live Playground', label: 'Write, run & share code in your browser', accent: '#d97706' },
  ];

  return (
    <section className="hsec hsec-sand relative px-4 py-16 sm:py-20">
      <div ref={sectionRef} className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0.3 : 0.6 }}
          viewport={{ once: true, margin: '-60px' }}
          className="mb-10 text-center"
        >
          <h2 className="font-display text-3xl font-bold tracking-tight hx-t1 sm:text-4xl">
            A community that <span className="hx-grad-text">compounds</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm hx-t2 sm:text-base">
            Every event, every contest, every late-night debug session adds up.
          </p>
        </motion.div>

        <div className="bento-grid">
          {cards.map((card, i) => {
            const Icon = card.icon;
            const Inner = (
              <motion.div
                initial={{ opacity: 0, y: shouldReduceMotion ? 8 : 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0.3 : 0.5, delay: i * 0.08 }}
                viewport={{ once: true, margin: '-50px' }}
                className={`bento-card group h-full ${card.hero ? 'flex flex-col justify-between' : ''}`}
                style={{ '--ca': card.accent } as CSSProperties}
              >
                <div className="relative z-10 flex items-center justify-between">
                  <span className={`cat-chip ${card.hero ? 'h-12 w-12' : 'h-11 w-11'}`}>
                    <Icon className={card.hero ? 'h-6 w-6' : 'h-5 w-5'} />
                  </span>
                  {card.to && <ArrowUpRight className="h-4 w-4 hx-t3 transition-colors" />}
                </div>
                <div className="relative z-10 mt-6">
                  <p
                    className={`hx-t1 font-display font-extrabold tracking-tight ${
                      card.hero ? 'text-6xl sm:text-7xl' : card.feature ? 'text-2xl' : 'text-4xl'
                    }`}
                  >
                    {card.feature ? card.title : <CountUp value={card.value ?? 0} suffix={card.suffix} run={inView} />}
                  </p>
                  <p className={`mt-2 hx-t2 ${card.hero ? 'text-base' : 'text-sm'}`}>{card.label}</p>
                </div>
                {card.hero && (
                  <div className="relative z-10 mt-6 flex items-center gap-2 text-xs hx-t3">
                    <Terminal className="h-3.5 w-3.5 text-[#fbbf24]" />
                    DSA · Web · Hackathons · Open Source
                  </div>
                )}
              </motion.div>
            );

            return card.to ? (
              <Link
                key={card.label}
                to={card.to}
                className={`block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212] rounded-[22px] ${
                  card.hero ? 'bento-card--hero' : ''
                }`}
              >
                {Inner}
              </Link>
            ) : (
              <div key={card.label} className={card.hero ? 'bento-card--hero' : ''}>
                {Inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
