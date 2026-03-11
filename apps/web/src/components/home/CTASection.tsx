import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Code, Rocket, Users, Trophy, Lightbulb } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';

export function CTASection() {
  const { shouldReduceMotion } = useMotionConfig();
  
  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-amber-950 to-orange-950" />
      
      {/* Mesh Gradient */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_120%,rgba(251,191,36,0.3),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_100%_0%,rgba(234,88,12,0.2),rgba(255,255,255,0))]" />
      </div>
      
      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      
      {/* Floating Icons - disable animation on mobile */}
      {!shouldReduceMotion ? (
        <>
          <motion.div
            className="absolute top-20 left-[15%] text-amber-500/20 hidden md:block"
            animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Code className="h-16 w-16" />
          </motion.div>
          <motion.div
            className="absolute bottom-20 right-[15%] text-orange-500/20 hidden md:block"
            animate={{ y: [0, 20, 0], rotate: [0, -10, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Rocket className="h-20 w-20" />
          </motion.div>
          <motion.div
            className="absolute top-1/2 right-[10%] text-amber-400/15 hidden md:block"
            animate={{ y: [0, -15, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Users className="h-14 w-14" />
          </motion.div>
        </>
      ) : (
        /* Static icons for mobile */
        <>
          <div className="absolute top-20 left-[15%] text-amber-500/20 hidden md:block">
            <Code className="h-16 w-16" />
          </div>
          <div className="absolute bottom-20 right-[15%] text-orange-500/20 hidden md:block">
            <Rocket className="h-20 w-20" />
          </div>
          <div className="absolute top-1/2 right-[10%] text-amber-400/15 hidden md:block">
            <Users className="h-14 w-14" />
          </div>
        </>
      )}
      
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: animationY }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          {/* Heading */}
          <motion.h2 
            initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.3 }}
            viewport={{ once: true, margin: '-50px' }}
            className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight px-2"
          >
            Be Part of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              Something Bigger
            </span>
          </motion.h2>
          
          {/* Description */}
          <motion.p 
            initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.15 : 0.4 }}
            viewport={{ once: true, margin: '-50px' }}
            className="text-base sm:text-lg md:text-xl text-white/70 mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed px-2"
          >
            Join a vibrant community of passionate developers. Learn, build, compete, and grow together with code.scriet.
          </motion.p>
          
          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.2 : 0.5 }}
            viewport={{ once: true, margin: '-50px' }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center px-4 sm:px-0"
          >
            <Link to="/signin" className="w-full sm:w-auto">
              <Button 
                size="lg" 
                className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 shadow-xl shadow-amber-500/25 h-12 sm:h-14 px-6 sm:px-10 text-base sm:text-lg font-semibold group border-0 w-full sm:w-auto"
              >
                <span className="relative z-10 flex items-center">
                  Join Now — It's Free
                  {/* Arrow animation - disable on mobile */}
                  {!shouldReduceMotion ? (
                    <motion.span
                      className="ml-2"
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </motion.span>
                  ) : (
                    <ArrowRight className="h-5 w-5 ml-2" />
                  )}
                </span>
              </Button>
            </Link>
            <Link to="/about" className="w-full sm:w-auto">
              <Button 
                size="lg" 
                variant="outline" 
                className="border-2 border-white/20 text-white hover:bg-white/10 hover:border-white/40 h-12 sm:h-14 px-6 sm:px-10 text-base sm:text-lg backdrop-blur-sm bg-white/5 w-full sm:w-auto"
              >
                Learn More
              </Button>
            </Link>
          </motion.div>
          
          {/* Trust Indicators */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.25 : 0.7 }}
            viewport={{ once: true, margin: '-50px' }}
            className="mt-12 flex flex-wrap justify-center items-center gap-6 text-white/50 text-sm"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>500+ Active Members</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span>Weekly Contests</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              <span>Expert Mentorship</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
