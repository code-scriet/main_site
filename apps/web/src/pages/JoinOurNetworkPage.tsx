import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Users,
  Globe,
  Mic2,
  Award,
  ArrowRight,
  Sparkles,
  Shield,
  Handshake,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { storePendingInvitationClaimToken } from '@/lib/invitationClaim';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const benefits = [
  {
    icon: Globe,
    title: 'Public Profile',
    description: 'Get a dedicated profile card showcased on our network page, visible to students and industry peers.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Users,
    title: 'Community Access',
    description: 'Connect with talented students, fellow professionals, and mentors in the code.scriet ecosystem.',
    gradient: 'from-emerald-500 to-green-500',
  },
  {
    icon: Mic2,
    title: 'Speaking Opportunities',
    description: 'Share your expertise through guest sessions, workshops, hackathon judging, and mentorship programs.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Award,
    title: 'Recognition',
    description: 'Be recognized as a valued contributor to the next generation of tech professionals.',
    gradient: 'from-fuchsia-500 to-pink-500',
  },
];

const whoCanJoin = [
  { label: 'CEOs & CTOs', icon: Sparkles },
  { label: 'Working Professionals', icon: Shield },
  { label: 'Guest Speakers', icon: Mic2 },
  { label: 'Mentors & Advisors', icon: Handshake },
  { label: 'Alumni', icon: Award },
  { label: 'Industry Partners', icon: Globe },
];

const howItWorksStepStyles = {
  amber: {
    circle: 'from-amber-500 to-amber-600',
    shadow: 'shadow-amber-500/25',
  },
  orange: {
    circle: 'from-orange-500 to-orange-600',
    shadow: 'shadow-orange-500/25',
  },
  emerald: {
    circle: 'from-emerald-500 to-emerald-600',
    shadow: 'shadow-emerald-500/25',
  },
} as const;

const howItWorksSteps: Array<{
  step: string;
  title: string;
  description: string;
  color: keyof typeof howItWorksStepStyles;
}> = [
  { step: '1', title: 'Sign In', description: 'Authenticate with Google or GitHub — takes just a few seconds.', color: 'amber' },
  { step: '2', title: 'Complete Your Profile', description: 'Fill in your professional details, social links, and how you connected with the club.', color: 'orange' },
  { step: '3', title: 'Admin Verification', description: 'Our team reviews your profile to ensure quality and authenticity.', color: 'amber' },
  { step: '4', title: 'Go Live', description: 'Once verified, your profile card appears on our public network page for everyone to see.', color: 'emerald' },
];

export default function JoinOurNetworkPage() {
  const { settings, loading: settingsLoading } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const networkType: 'professional' | 'alumni' = searchParams.get('type') === 'alumni' ? 'alumni' : 'professional';
  const invitationToken = searchParams.get('invitation');

  const persistNetworkIntent = (type: 'professional' | 'alumni') => {
    localStorage.setItem('network_intent', JSON.stringify({ intent: 'network', type }));
    localStorage.setItem('network_onboarding_type', type);
  };

  useEffect(() => {
    if (invitationToken) {
      storePendingInvitationClaimToken(invitationToken);
    }
  }, [invitationToken]);

  useEffect(() => {
    if (settingsLoading) return;
    if (settings?.showNetwork === false) {
      navigate('/');
      return;
    }
    if (user?.role === 'NETWORK') {
      navigate('/network/status');
    }
  }, [navigate, settings?.showNetwork, settingsLoading, user?.role]);

  if (!settingsLoading && (settings?.showNetwork === false || user?.role === 'NETWORK')) {
    return null;
  }

  const handleJoinWithGoogle = () => {
    const apiBase = API_URL.replace(/\/api\/?$/, '');
    persistNetworkIntent(networkType);
    window.location.href = `${apiBase}/api/auth/google?intent=network&type=${networkType}`;
  };

  const handleJoinWithGitHub = () => {
    const apiBase = API_URL.replace(/\/api\/?$/, '');
    persistNetworkIntent(networkType);
    window.location.href = `${apiBase}/api/auth/github?intent=network&type=${networkType}`;
  };

  return (
    <Layout>
      <SEO
        title="Join Our Network"
        description="Connect with code.scriet as an industry professional, mentor, or alumni. Get featured on our network page."
        url="/join-our-network"
      />

      {/* Hero Section */}
      <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-start sm:items-center overflow-x-hidden bg-slate-950 py-16 sm:py-28">
        {/* Ambient Background Effects */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute rounded-full bg-amber-500/10 ${
              isMobile ? '-left-24 -top-8 h-[280px] w-[280px] blur-[64px]' : '-left-40 top-0 h-[600px] w-[600px] blur-[120px]'
            }`}
          />
          <div
            className={`absolute rounded-full bg-orange-500/10 ${
              isMobile ? '-right-20 bottom-0 h-[240px] w-[240px] blur-[64px]' : '-right-40 bottom-0 h-[500px] w-[500px] blur-[100px]'
            }`}
          />
        </div>

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Floating Elements */}
        <div className="absolute left-1/4 top-1/4 h-2 w-2 rounded-full bg-amber-400 opacity-40 animate-pulse" />
        {!isMobile && (
          <>
            <div className="absolute right-1/3 top-1/3 h-1.5 w-1.5 rounded-full bg-orange-400 opacity-50 animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute left-1/3 bottom-1/3 h-2.5 w-2.5 rounded-full bg-fuchsia-400 opacity-30 animate-pulse" style={{ animationDelay: '2s' }} />
          </>
        )}

        <div className="container relative z-10 mx-auto px-4">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.35 : 0.6 }}
          >
            <motion.div
              className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-2 backdrop-blur-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400"></span>
              </div>
              <span className="text-sm font-medium text-amber-300">Industry Professionals & Mentors</span>
            </motion.div>

            <h1 className="mb-6 text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Join the{' '}
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                code.scriet
              </span>{' '}
              Network
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-xl">
              Are you an industry professional, mentor, alumnus, or guest speaker? 
              Connect with our community and help shape the next generation of tech leaders.
            </p>

            <motion.div
              className="flex flex-col justify-center gap-4 sm:flex-row"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-3 text-base text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/40"
                onClick={handleJoinWithGoogle}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Join with Google
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="border-white/20 bg-white/5 px-8 py-3 text-base text-slate-200 backdrop-blur-sm hover:border-white/30 hover:bg-white/10"
                onClick={handleJoinWithGitHub}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Join with GitHub
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="relative overflow-hidden bg-slate-900 py-20">
        {/* Subtle gradient */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute right-0 top-0 rounded-full bg-amber-500/5 ${
              isMobile ? 'h-[200px] w-[200px] blur-[56px]' : 'h-[400px] w-[400px] blur-[100px]'
            }`}
          />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <motion.div
            className="mb-14 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Why Join Our Network?</h2>
            <p className="mx-auto max-w-lg text-slate-400">
              Being part of the code.scriet network comes with meaningful benefits.
            </p>
          </motion.div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                className="performance-surface group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                {/* Hover glow overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${benefit.gradient} opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-10`} />
                
                <div className={`relative z-10 mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${benefit.gradient} shadow-lg`}>
                  <benefit.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="relative z-10 mb-2 font-semibold text-white">{benefit.title}</h3>
                <p className="relative z-10 text-sm leading-relaxed text-slate-400">{benefit.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Who Can Join */}
      <section className="relative overflow-hidden bg-slate-950 py-20">
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute -left-40 bottom-0 rounded-full bg-amber-500/10 ${
              isMobile ? 'h-[180px] w-[180px] blur-[56px]' : 'h-[300px] w-[300px] blur-[80px]'
            }`}
          />
        </div>

        <div className="container relative z-10 mx-auto px-4">
          <motion.div
            className="mb-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Who Can Join?</h2>
            <p className="mx-auto max-w-lg text-slate-400">
              Our network is open to professionals who have connected with the club in any capacity.
            </p>
          </motion.div>

          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-3">
            {whoCanJoin.map((item, index) => (
              <motion.div
                key={item.label}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all hover:border-amber-400/30 hover:bg-amber-500/5"
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-amber-400/20">
                  <item.icon className="h-4 w-4 text-amber-400" />
                </div>
                <span className="text-sm font-medium text-slate-200">{item.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative overflow-hidden bg-slate-900 py-20">
        <div className="container relative z-10 mx-auto px-4">
          <motion.div
            className="mb-14 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">How It Works</h2>
            <p className="text-slate-400">Four simple steps to get your profile live</p>
          </motion.div>

          <div className="mx-auto max-w-3xl">
            {howItWorksSteps.map((item, index) => (
              <motion.div
                key={item.step}
                className="mb-6 flex gap-5 last:mb-0"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="relative flex flex-col items-center">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-lg ${
                      howItWorksStepStyles[item.color].circle
                    } ${howItWorksStepStyles[item.color].shadow}`}
                  >
                    {item.step}
                  </div>
                  {index < 3 && (
                    <div className="mt-2 h-full w-px bg-gradient-to-b from-white/20 to-transparent" />
                  )}
                </div>
                <div className="flex-1 pb-6">
                  <h3 className="mb-1 font-semibold text-white">{item.title}</h3>
                  <p className="text-sm text-slate-400">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-slate-950 py-20">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={`absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 ${
              isMobile ? 'h-[180px] w-[320px] blur-[64px]' : 'h-[300px] w-[600px] blur-[100px]'
            }`}
          />
        </div>

        <div className="container relative z-10 mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-2xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">Ready to get started?</span>
            </div>

            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
              Join our growing network
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-slate-400">
              It only takes a minute to get started. Sign in and complete your professional profile.
            </p>

            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/40"
                onClick={handleJoinWithGoogle}
              >
                Join with Google
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-amber-400/30 bg-amber-500/10 text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/20"
                onClick={handleJoinWithGitHub}
              >
                Join with GitHub
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
