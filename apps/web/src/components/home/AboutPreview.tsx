import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Code, Users, ArrowRight, Sparkles, Target, Brain } from 'lucide-react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';

export function AboutPreview() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch(console.error);
  }, []);

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  const features = [
    {
      icon: Brain,
      title: 'Master DSA',
      description: 'Deep dive into Data Structures and Algorithms with structured learning paths and practice sessions.',
      color: 'from-violet-500 to-purple-600',
      bgColor: 'bg-violet-500/10',
    },
    {
      icon: Code,
      title: 'Build Projects',
      description: 'Apply your skills by working on real-world projects and collaborative coding sessions.',
      color: 'from-amber-500 to-orange-600',
      bgColor: 'bg-amber-500/10',
    },
    {
      icon: Target,
      title: 'Compete & Win',
      description: 'Participate in coding competitions, hackathons, and win exciting prizes and recognition.',
      color: 'from-emerald-500 to-teal-600',
      bgColor: 'bg-emerald-500/10',
    },
    {
      icon: Users,
      title: 'Network',
      description: 'Connect with like-minded individuals, mentors, and industry professionals.',
      color: 'from-blue-500 to-cyan-600',
      bgColor: 'bg-blue-500/10',
    },
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-white to-amber-50/50 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.div 
            initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 mb-6"
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">What We Offer</span>
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Grow Your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">
              Coding Skills
            </span>
          </h2>
          
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            {settings?.clubDescription || "code.scriet is a community of passionate coders dedicated to continuous learning, problem-solving, and building amazing things together."}
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: animationY }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: animationDuration, delay: index * staggerDelay }}
              viewport={{ once: true }}
              whileHover={!isMobile ? { y: -8, transition: { duration: 0.3 } } : undefined}
              className="group relative"
            >
              <div className="h-full p-8 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-500 relative overflow-hidden">
                {/* Gradient overlay on hover */}
                <div className={`absolute inset-0 ${feature.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                
                {/* Icon */}
                <div className={`relative mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                
                {/* Content */}
                <h3 className="relative text-xl font-bold text-gray-900 mb-3 group-hover:text-gray-900">
                  {feature.title}
                </h3>
                <p className="relative text-gray-600 leading-relaxed">
                  {feature.description}
                </p>

                {/* Hover Arrow - only on desktop */}
                {!isMobile && (
                  <motion.div 
                    className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    initial={{ x: -10 }}
                    whileHover={{ x: 0 }}
                  >
                    <ArrowRight className="h-5 w-5 text-amber-500" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.4 }}
          viewport={{ once: true }}
          className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 rounded-3xl p-8 md:p-12 mb-12"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '10+', label: 'Active Members' },
              { value: '3', label: 'Events Conducted' },
              { value: '5', label: 'Projects Built' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: (shouldReduceMotion ? 0.1 : 0.5) + index * staggerDelay }}
                viewport={{ once: true }}
              >
                <p className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</p>
                <p className="text-amber-100 text-sm md:text-base">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link to="/about">
            <Button 
              size="lg" 
              className="bg-gray-900 hover:bg-gray-800 text-white px-8 h-14 text-lg group"
            >
              Learn More About Us
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
