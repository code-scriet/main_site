import { useEffect, useState, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, Users, Calendar, Sparkles, Terminal, Zap, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

// Animated typing text effect
const typingPhrases = [
  'Data Structures',
  'Algorithms', 
  'Competitive Programming',
  'Web Development',
  'Problem Solving',
  'System Design',
];

function TypingAnimation() {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = typingPhrases[currentPhraseIndex];
    
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (displayText.length < currentPhrase.length) {
          setDisplayText(currentPhrase.slice(0, displayText.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
        } else {
          setIsDeleting(false);
          setCurrentPhraseIndex((prev) => (prev + 1) % typingPhrases.length);
        }
      }
    }, isDeleting ? 50 : 100);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentPhraseIndex]);

  return (
    <span className="text-amber-300">
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="inline-block w-[3px] h-[1em] bg-amber-300 ml-1"
      />
    </span>
  );
}

// Floating particles - optimized for mobile
type ParticleSpec = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

function Particles({ isMobile, disableAnimation }: { isMobile: boolean; disableAnimation: boolean }) {
  const particleCount = isMobile ? 14 : 40;
  const particles = useMemo<ParticleSpec[]>(() => {
    return Array.from({ length: particleCount }, (_, index) => {
      const seed = index + 1;
      return {
        id: index,
        x: seededUnit(seed) * 100,
        y: seededUnit(seed * 1.37) * 100,
        size: (seededUnit(seed * 2.13) * (isMobile ? 1.8 : 2.8)) + 1,
        duration: (seededUnit(seed * 3.07) * (isMobile ? 10 : 14)) + (isMobile ? 9 : 8),
        delay: seededUnit(seed * 4.1) * (isMobile ? 2.8 : 4.5),
      };
    });
  }, [isMobile, particleCount]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-amber-400/30"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
          }}
          animate={
            disableAnimation
              ? {}
              : {
                  y: isMobile ? [0, -12, 0] : [0, -30, 0],
                  opacity: isMobile ? [0.24, 0.46, 0.24] : [0.25, 0.6, 0.25],
                  scale: isMobile ? [1, 1.06, 1] : [1, 1.12, 1],
                }
          }
          transition={
            disableAnimation
              ? {}
              : {
                  duration: particle.duration,
                  delay: particle.delay,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
          }
        />
      ))}
    </div>
  );
}

// Animated code lines in background
function CodeBackground() {
  const codeLines = [
    'function solve(n) {',
    '  if (n <= 1) return n;',
    '  return solve(n-1) + solve(n-2);',
    '}',
    '',
    'class Graph {',
    '  constructor() {',
    '    this.adj = new Map();',
    '  }',
    '}',
  ];

  return (
    <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden lg:block opacity-10 font-mono text-sm text-amber-200 pointer-events-none">
      {codeLines.map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
          className="whitespace-pre"
        >
          {line}
        </motion.div>
      ))}
    </div>
  );
}

// Stat counter with animation
function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{count > 0 ? `${count}${suffix}` : '...'}</span>;
}

export function Hero() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { data: homeData } = useHomePageData();
  const { isMobile, shouldReduceMotion, prefersReducedMotion } = useMotionConfig();
  const { scrollY } = useScroll();
  
  // Disable parallax on mobile for better performance
  const opacity = useTransform(scrollY, [0, 400], shouldReduceMotion ? [1, 1] : [1, 0]);
  const scale = useTransform(scrollY, [0, 400], shouldReduceMotion ? [1, 1] : [1, 0.95]);
  const y = useTransform(scrollY, [0, 400], shouldReduceMotion ? [0, 0] : [0, 100]);
  const stats = homeData?.stats ?? { members: 500, events: 3, achievements: 5 };
  const resolvedDescription =
    homeData?.settings?.clubDescription ||
    settings?.clubDescription ||
    "Building tomorrow's problem solvers through collaborative learning and hands-on coding experiences.";
  const hiringEnabled = homeData?.settings?.hiringEnabled ?? settings?.hiringEnabled;
  const canRenderHiringCta = Boolean(homeData) || !settingsLoading;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { 
        staggerChildren: shouldReduceMotion ? 0.05 : 0.15, 
        delayChildren: shouldReduceMotion ? 0.1 : 0.3 
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 15 : 40 },
    visible: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: shouldReduceMotion ? 0.3 : 0.8 } 
    },
  };

  return (
    <section className="relative min-h-[calc(100vh-var(--site-header-height))] flex items-start md:items-center justify-center overflow-x-hidden pt-6 sm:pt-8 md:pt-0 pb-14 sm:pb-20">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-amber-950 to-orange-950" />
      
      {/* Mesh Gradient Overlay */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(251,191,36,0.3),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_0%_100%,rgba(234,88,12,0.2),rgba(255,255,255,0))]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_100%_50%,rgba(251,146,60,0.15),rgba(255,255,255,0))]" />
      </div>

      {/* Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Particles - lighter on mobile, disabled only for explicit reduced-motion preference */}
      <Particles isMobile={isMobile} disableAnimation={prefersReducedMotion} />

      {/* Code Background - hidden on mobile via CSS */}
      <CodeBackground />

      {/* Glowing Orbs - keep motion on mobile, but with lighter drift */}
      {!prefersReducedMotion && (
        <>
          <motion.div 
            className="absolute left-10 top-16 h-44 w-44 rounded-full bg-amber-500/20 blur-[64px] sm:left-20 sm:top-20 sm:h-72 sm:w-72 sm:blur-[100px]"
            animate={
              isMobile
                ? { x: [0, 10, 0], y: [0, -8, 0], opacity: [0.16, 0.24, 0.16] }
                : { scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }
            }
            transition={{ duration: isMobile ? 14 : 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div 
            className="absolute bottom-16 right-8 h-52 w-52 rounded-full bg-orange-600/20 blur-[72px] sm:bottom-20 sm:right-20 sm:h-96 sm:w-96 sm:blur-[120px]"
            animate={
              isMobile
                ? { x: [0, -9, 0], y: [0, 7, 0], opacity: [0.14, 0.22, 0.14] }
                : { scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }
            }
            transition={{ duration: isMobile ? 16 : 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
        </>
      )}
      
      {/* Static orbs for explicit reduced motion */}
      {prefersReducedMotion && (
        <>
          <div className="absolute left-10 top-16 h-44 w-44 rounded-full bg-amber-500/20 blur-[64px] sm:left-20 sm:top-20 sm:h-72 sm:w-72 sm:blur-[100px]" />
          <div className="absolute bottom-16 right-8 h-52 w-52 rounded-full bg-orange-600/20 blur-[72px] sm:bottom-20 sm:right-20 sm:h-96 sm:w-96 sm:blur-[120px]" />
        </>
      )}

      {/* Main Content */}
      <motion.div 
        style={shouldReduceMotion ? {} : { opacity, scale, y }}
        className="container mx-auto px-4 relative z-10 py-2 sm:py-4 md:py-8"
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="text-center space-y-6 sm:space-y-8 max-w-5xl mx-auto"
        >
          {/* Badge */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <motion.div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 backdrop-blur-sm"
              whileHover={!isMobile ? { scale: 1.05 } : undefined}
            >
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-amber-200 text-sm font-medium">SCRIET's Premier Coding Community</span>
            </motion.div>
          </motion.div>

          {/* Logo */}
          <motion.div variants={itemVariants} className="flex justify-center">
            <motion.div 
              className="relative"
              whileHover={!isMobile ? { scale: 1.05, rotate: 2 } : undefined}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-amber-500/30 rounded-3xl blur-2xl" />
              <div className="relative h-28 w-28 md:h-32 md:w-32 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl overflow-hidden">
                <img 
                  src="/logo.jpeg" 
                  alt="code.scriet" 
                  className="h-20 w-20 md:h-24 md:w-24 object-cover rounded-xl"
                />
              </div>
              {/* Rotating Zap - disable on mobile */}
              {!prefersReducedMotion && (
                <motion.div
                  className="absolute -top-3 -right-3"
                  animate={{ rotate: 360 }}
                  transition={{ duration: isMobile ? 18 : 10, repeat: Infinity, ease: 'linear' }}
                >
                  <div className="p-2 bg-amber-500/20 rounded-full backdrop-blur-sm border border-amber-500/30">
                    <Zap className="h-4 w-4 text-amber-400" />
                  </div>
                </motion.div>
              )}
              {/* Static Zap for mobile */}
              {prefersReducedMotion && (
                <div className="absolute -top-3 -right-3">
                  <div className="p-2 bg-amber-500/20 rounded-full backdrop-blur-sm border border-amber-500/30">
                    <Zap className="h-4 w-4 text-amber-400" />
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>

          {/* Main Heading */}
          <motion.div variants={itemVariants} className="space-y-4 md:space-y-6">
            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight font-display">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400">
                code
              </span>
              <span className="text-white/40">.</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-300 to-amber-300">
                scriet
              </span>
            </h1>
            
            {/* Typing Effect Subtitle */}
            <div className="flex items-center justify-center gap-2 sm:gap-3 text-base sm:text-lg md:text-xl">
              <Terminal className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
              <span className="text-white/60 font-mono">Learning</span>
              <TypingAnimation />
            </div>
          </motion.div>

          {/* Description */}
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg md:text-xl lg:text-2xl text-white/70 max-w-3xl mx-auto leading-relaxed px-2"
          >
            {resolvedDescription}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center pt-4 px-4 sm:px-0"
          >
            {canRenderHiringCta && hiringEnabled === true && (
              <Link to="/join-us" className="w-full sm:w-auto">
                <Button 
                  size="lg" 
                  className="relative overflow-hidden bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 shadow-xl shadow-amber-500/25 h-12 sm:h-14 px-6 sm:px-8 text-base font-semibold group border-0 w-full sm:w-auto"
                >
                  <span className="relative z-10 flex items-center">
                    Join Our Team
                    {/* Arrow animation - disable on mobile */}
                    {!prefersReducedMotion ? (
                      <motion.span
                        className="ml-2"
                        animate={{ x: isMobile ? [0, 2, 0] : [0, 4, 0] }}
                        transition={{ duration: isMobile ? 1.8 : 1.5, repeat: Infinity }}
                      >
                        <ArrowRight className="h-5 w-5" />
                      </motion.span>
                    ) : (
                      <ArrowRight className="h-5 w-5 ml-2" />
                    )}
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400"
                    initial={{ x: '-100%' }}
                    whileHover={!isMobile ? { x: 0 } : undefined}
                    transition={{ duration: 0.3 }}
                  />
                </Button>
              </Link>
            )}
            {user ? (
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-white/20 text-white hover:bg-white/10 hover:border-white/40 h-12 sm:h-14 px-6 sm:px-8 text-base backdrop-blur-sm bg-white/5 w-full sm:w-auto"
                >
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link to="/signin" className="w-full sm:w-auto">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-white/20 text-white hover:bg-white/10 hover:border-white/40 h-12 sm:h-14 px-6 sm:px-8 text-base backdrop-blur-sm bg-white/5 w-full sm:w-auto"
                >
                  <Users className="h-5 w-5 mr-2" />
                  Sign In / Register
                </Button>
              </Link>
            )}
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-2 gap-3 sm:gap-8 max-w-3xl mx-auto pt-6 sm:pt-10 md:pt-12 px-2 sm:px-0"
          >
            {[
              { icon: Users, label: 'Active Members', value: stats.members, displayValue: null, color: 'from-amber-400 to-amber-500' },
              { icon: Calendar, label: 'Events Hosted', value: stats.events, displayValue: null, color: 'from-orange-400 to-orange-500' },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                whileHover={!isMobile ? { scale: 1.05, y: -8 } : undefined}
                transition={{ type: 'spring', stiffness: 400 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-white/5 rounded-2xl sm:rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity blur-xl" />
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-8 md:p-10 transition-all duration-300 group-hover:bg-white/10 group-hover:border-white/20">
                  <div className={`inline-flex p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br ${stat.color} mb-3 sm:mb-6 shadow-2xl`}>
                    <stat.icon className="h-5 w-5 sm:h-8 sm:w-8 text-white" />
                  </div>
                  <p className="text-3xl sm:text-5xl md:text-6xl font-bold text-white mb-1 sm:mb-2">
                    {stat.displayValue ? `${stat.displayValue}+` : <AnimatedCounter value={stat.value!} suffix="+" />}
                  </p>
                  <p className="text-white/60 text-xs sm:text-base">{stat.label}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Scroll Indicator - disable animation on mobile */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:block"
      >
        <motion.div
          animate={!prefersReducedMotion ? { y: isMobile ? [0, 4, 0] : [0, 8, 0] } : {}}
          transition={{ duration: isMobile ? 2.4 : 2, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2 cursor-pointer"
          onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
        >
          <span className="text-white/40 text-xs uppercase tracking-widest font-medium">Scroll</span>
          <div className="w-6 h-10 border-2 border-white/20 rounded-full flex items-start justify-center p-2">
            <motion.div
              animate={!prefersReducedMotion ? { y: isMobile ? [0, 8, 0] : [0, 12, 0] } : {}}
              transition={{ duration: isMobile ? 1.8 : 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 bg-amber-400 rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
