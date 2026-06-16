import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useSettings } from '@/context/SettingsContext';
import { useHomePageData } from '@/hooks/useHomePageData';
import { DsaIcon, OpenSourceIcon, HackathonsIcon, NetworkIcon } from './icons';

const features = [
  {
    icon: DsaIcon,
    title: 'Master DSA',
    description: 'Deep dive into Data Structures and Algorithms with structured learning paths.',
    accent: '#f59e0b', // gold
  },
  {
    icon: OpenSourceIcon,
    title: 'Build Projects',
    description: 'Apply your skills by working on real-world projects and collaborations.',
    accent: '#f97316', // orange
  },
  {
    icon: HackathonsIcon,
    title: 'Compete & Win',
    description: 'Participate in coding competitions and hackathons for prizes.',
    accent: '#10b981', // emerald
  },
  {
    icon: NetworkIcon,
    title: 'Network',
    description: 'Connect with mentors, peers, and industry professionals.',
    accent: '#ef4444', // red
  },
];



export function AboutPreview() {
  const { settings } = useSettings();
  const { data: homeData } = useHomePageData();
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const clubDescription =
    homeData?.settings?.clubDescription ||
    settings?.clubDescription ||
    'code.scriet is a community of passionate coders dedicated to continuous learning, problem-solving, and building amazing things together.';

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="hsec hsec-alt relative overflow-hidden py-20 sm:py-28">
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-14 sm:mb-20"
        >
          <h2 className="mb-5 px-2 text-3xl font-bold leading-[1.1] text-gray-900 sm:mb-6 sm:text-4xl md:text-5xl lg:text-6xl dark:text-zinc-100">
            Grow Your{' '}
            <span className="relative">
              <span className="hx-grad-text">
                Technical Edge
              </span>
              <motion.span
                className="absolute -bottom-2 left-0 h-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                viewport={{ once: true }}
              />
            </span>
          </h2>

          <p className="mx-auto max-w-3xl px-2 text-base leading-relaxed text-gray-600 sm:text-lg md:text-xl dark:text-zinc-400">
            {clubDescription}
          </p>
        </motion.div>

        {/* Features Grid - refined cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 mb-16 sm:mb-20">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: animationY }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: animationDuration, delay: index * staggerDelay }}
              viewport={{ once: true, margin: '-50px' }}
              whileHover={!isMobile ? { y: -6, transition: { duration: 0.25 } } : undefined}
              className="group relative"
            >
              <div className="glass-card glass-card--lift relative h-full overflow-hidden p-6 sm:p-7">
                {/* Accent line at top — per-feature colour */}
                <div
                  className="absolute top-0 left-0 right-0 h-[3px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}, transparent)` }}
                />

                {/* Hover background glow — per-feature colour */}
                <div
                  className="absolute inset-0 opacity-0 transition-opacity duration-400 group-hover:opacity-100"
                  style={{ background: `radial-gradient(ellipse at top, ${feature.accent}22, transparent 70%)` }}
                />

                {/* Icon — per-feature coloured glass chip with a custom illustrated icon */}
                <div
                  className="relative mb-5 grid h-12 w-12 place-items-center rounded-xl border"
                  style={{ borderColor: `${feature.accent}40`, background: `${feature.accent}1f` }}
                >
                  <feature.icon size={26} accent={feature.accent} />
                </div>

                {/* Content */}
                <h3 className="relative mb-2.5 text-lg font-bold hx-t1 sm:text-xl">
                  {feature.title}
                </h3>
                <p className="relative text-sm leading-relaxed hx-t2">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link
            to="/about"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-7 text-base font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(249,115,22,0.5)]"
          >
            Learn More About Us
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
