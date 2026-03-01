import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Code, Users, ArrowRight, Sparkles, Target, Brain } from 'lucide-react';
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
    accent: '#F59E0B',
    accentLight: 'rgba(245, 158, 11, 0.1)',
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

const aboutStats = [
  { value: '500+', label: 'Members' },
  { value: '3', label: 'Events' },
  { value: '7+', label: 'Projects' },
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
    <section className="py-20 sm:py-28 bg-gradient-to-b from-white via-amber-50/30 to-white relative overflow-hidden">
      {/* Subtle geometric pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 30L30 60L0 30z' fill='%23000' fill-opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: '30px 30px',
      }} />
      
      {/* Ambient glow */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-amber-200/40 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-orange-200/30 rounded-full blur-[120px]" />
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-14 sm:mb-20"
        >
          <motion.div 
            initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            viewport={{ once: true, margin: '-50px' }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100/80 text-amber-700 mb-6 border border-amber-200/50"
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium tracking-wide">What We Offer</span>
          </motion.div>
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-5 sm:mb-6 px-2 leading-[1.1]">
            Grow Your{' '}
            <span className="relative">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600">
                Coding Skills
              </span>
              <motion.span 
                className="absolute -bottom-2 left-0 h-1 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                initial={{ width: 0 }}
                whileInView={{ width: '100%' }}
                transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                viewport={{ once: true }}
              />
            </span>
          </h2>
          
          <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed px-2">
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
              <div className="h-full p-6 sm:p-7 rounded-2xl bg-white border border-gray-100/80 shadow-sm hover:shadow-xl hover:border-gray-200/80 transition-all duration-400 relative overflow-hidden">
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
                <h3 className="relative text-lg sm:text-xl font-bold text-gray-900 mb-2.5 group-hover:text-gray-900">
                  {feature.title}
                </h3>
                <p className="relative text-gray-500 text-sm leading-relaxed">
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
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600" />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }} />
          
          <div className="relative p-8 sm:p-10 md:p-12">
            <div className="grid grid-cols-3 gap-6 sm:gap-8 text-center">
              {aboutStats.map((stat, index) => (
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
                  <p className="text-amber-100/80 text-xs sm:text-sm uppercase tracking-wider font-medium">{stat.label}</p>
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
              className="bg-gray-900 hover:bg-gray-800 text-white px-7 h-12 sm:h-13 text-base group shadow-lg shadow-gray-900/10 border-0"
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
