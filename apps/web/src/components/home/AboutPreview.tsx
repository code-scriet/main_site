import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Code, Users, ArrowRight, Target, Brain } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useSettings } from '@/context/SettingsContext';
import { useHomePageData } from '@/hooks/useHomePageData';

const features = [
  {
    icon: Brain,
    title: 'Master DSA',
    description: 'Deep dive into Data Structures and Algorithms with structured learning paths.',
    accent: '#8B5CF6',
    accentLight: 'rgba(139, 92, 246, 0.1)',
  },
  {
    icon: Code,
    title: 'Build Projects',
    description: 'Apply your skills by working on real-world projects and collaborations.',
    accent: '#F97316',
    accentLight: 'rgba(249, 115, 22, 0.12)',
  },
  {
    icon: Target,
    title: 'Compete & Win',
    description: 'Participate in coding competitions and hackathons for prizes.',
    accent: '#10B981',
    accentLight: 'rgba(16, 185, 129, 0.1)',
  },
  {
    icon: Users,
    title: 'Network',
    description: 'Connect with mentors, peers, and industry professionals.',
    accent: '#3B82F6',
    accentLight: 'rgba(59, 130, 246, 0.1)',
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
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-amber-50/30 to-white py-20 sm:py-28 dark:from-[#07070a] dark:via-[#101016] dark:to-[#07070a]">
      {/* Subtle geometric pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30z' fill='%23000' fill-opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '30px 30px',
      }} />
      
      {/* Ambient glow */}
      <div className="absolute top-1/4 -left-32 h-64 w-64 rounded-full bg-amber-200/40 blur-[100px] dark:bg-red-500/10" />
      <div className="absolute bottom-1/4 -right-32 h-80 w-80 rounded-full bg-orange-200/30 blur-[120px] dark:bg-rose-500/10" />
      
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
              <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 bg-clip-text text-transparent dark:from-rose-400 dark:via-red-400 dark:to-orange-400">
                Technical Edge
              </span>
              <motion.span 
                className="absolute -bottom-2 left-0 h-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 dark:from-rose-400 dark:to-orange-400"
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
              <div className="relative h-full overflow-hidden rounded-2xl border border-gray-100/80 bg-white p-6 shadow-sm transition-all duration-400 hover:border-gray-200/80 hover:shadow-xl dark:border-zinc-800 dark:bg-[#0f0f14] dark:hover:border-zinc-700 dark:hover:shadow-black/30 sm:p-7">
                {/* Accent line at top */}
                <div 
                  className="absolute top-0 left-0 right-0 h-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}, transparent)` }}
                />
                
                {/* Hover background glow */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400"
                  style={{ background: `radial-gradient(ellipse at top, ${feature.accentLight}, transparent 70%)` }}
                />
                
                {/* Icon */}
                <div 
                  className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: feature.accentLight }}
                >
                  <feature.icon className="h-6 w-6" style={{ color: feature.accent }} />
                </div>
                
                {/* Content */}
                <h3 className="relative mb-2.5 text-lg font-bold text-gray-900 group-hover:text-gray-900 dark:text-zinc-100 dark:group-hover:text-zinc-100 sm:text-xl">
                  {feature.title}
                </h3>
                <p className="relative text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Row - refined and elegant */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.4 }}
          viewport={{ once: true, margin: '-50px' }}
          className="relative rounded-2xl sm:rounded-3xl overflow-hidden mb-14"
        >
          {/* Gradient background with subtle texture */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 dark:from-rose-700 dark:via-red-600 dark:to-orange-500" />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }} />
          
          <div className="relative p-8 sm:p-10 md:p-12">
            <div className="grid grid-cols-2 gap-6 sm:gap-8 text-center">
              {[
                { value: `${homeData?.stats?.members ?? 500}+`, label: 'Members' },
                { value: `${homeData?.stats?.events ?? 3}+`, label: 'Events' },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: (shouldReduceMotion ? 0.1 : 0.5) + index * staggerDelay }}
                  viewport={{ once: true, margin: '-50px' }}
                  className="relative"
                >
                  {/* Divider between stats */}
                  {index > 0 && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-12 bg-white/20 hidden sm:block" />
                  )}
                  <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-1 tracking-tight">{stat.value}</p>
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-100/80 dark:text-zinc-200/80 sm:text-sm">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link to="/about">
            <Button 
              size="lg" 
              className="h-12 border-0 bg-gray-900 px-7 text-base text-white shadow-lg shadow-gray-900/10 group hover:bg-gray-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 sm:h-13"
            >
              Learn More About Us
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
