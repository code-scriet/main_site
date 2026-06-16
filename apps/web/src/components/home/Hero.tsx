import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Sparkles, Users, CalendarDays, Trophy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';
import { AnimatedTerminal } from './AnimatedTerminal';

// Social-proof avatar row, sourced from the real team highlights.
const AvatarStack = memo(function AvatarStack() {
  const { data } = useHomePageData();
  const avatars = (data?.teamHighlights ?? []).slice(0, 4);
  return (
    <div className="flex -space-x-3">
      {avatars.map((m) => (
        <img
          key={m.id}
          src={m.imageUrl || '/fallback-avatar.svg'}
          alt=""
          loading="lazy"
          className="h-9 w-9 rounded-full border-2 border-[color:var(--hx-edge)] object-cover"
          onError={(e) => {
            e.currentTarget.src = '/fallback-avatar.svg';
          }}
        />
      ))}
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color:var(--hx-edge)] bg-[#f97316]/20 text-[11px] font-semibold text-[#fdba74]">
        +
      </span>
    </div>
  );
});

// Small glass stat badge used in the hero social-proof cluster.
function MiniBadge({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <span className="glass-pill px-2.5 py-1 text-xs font-medium text-white/80">
      <Icon className="h-3.5 w-3.5 text-[#fbbf24]" />
      {children}
    </span>
  );
}

export function Hero() {
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { data: homeData } = useHomePageData();
  const { shouldReduceMotion } = useMotionConfig();

  const members = homeData?.stats?.members;
  const events = homeData?.stats?.events;
  const achievements = homeData?.stats?.achievements;
  const hiringEnabled = homeData?.settings?.hiringEnabled ?? settings?.hiringEnabled;
  const canRenderHiringCta = Boolean(homeData) || !settingsLoading;

  const resolvedDescription =
    homeData?.settings?.clubDescription ||
    settings?.clubDescription ||
    'DSA, hackathons, web dev and a community that ships — the official coding club of SCRIET, CCSU Meerut.';

  const container = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: shouldReduceMotion ? 0.05 : 0.12,
          delayChildren: shouldReduceMotion ? 0.05 : 0.15,
        },
      },
    }),
    [shouldReduceMotion],
  );

  const item = useMemo(
    () => ({
      hidden: { opacity: 0, y: shouldReduceMotion ? 12 : 24 },
      visible: { opacity: 1, y: 0, transition: { duration: shouldReduceMotion ? 0.3 : 0.6 } },
    }),
    [shouldReduceMotion],
  );

  // Primary CTA: hiring open → Join Us, signed-in → Dashboard, else → Sign in.
  const primary = hiringEnabled === true
    ? { to: '/join-us', label: 'Join Us' }
    : user
      ? { to: '/dashboard', label: 'Go to Dashboard' }
      : { to: '/signin', label: 'Join Us' };

  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:pb-28 sm:pt-16 lg:pt-20">
      <div className="container relative mx-auto">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          {/* ---- Left column ---- */}
          <motion.div variants={container} initial="hidden" animate="visible" className="text-center lg:text-left">
            {/* Brand + eyebrow — prominent standalone logo above the pill */}
            <motion.div variants={item} className="mb-7 flex flex-col items-center gap-4 lg:items-start">
              <span className="home-logo-wrap">
                <span className="home-logo-halo" />
                <span className="home-logo-ring" />
                <span className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-3xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-md">
                  <img src="/logo.jpeg" alt="code.scriet" className="h-24 w-24 rounded-2xl object-cover" />
                </span>
              </span>
              <span className="glass-pill px-3.5 py-1.5 text-[12px] font-medium text-white/75">
                <Sparkles className="h-3.5 w-3.5 text-[#fbbf24]" />
                Official Coding Club · SCRIET, CCSU
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={item}
              className="font-display font-extrabold leading-[1.02] tracking-tight text-white"
              style={{ fontSize: 'clamp(2.6rem, 5vw + 1rem, 4.5rem)' }}
            >
              <span className="sr-only">
                code.scriet — build tomorrow&rsquo;s engineers. Official Coding Club of SCRIET, CCSU Meerut.
              </span>
              <span aria-hidden="true">
                <span className="hx-head-grad">Build </span>
                <span className="hx-grad-text">Tomorrow&rsquo;s</span>
                <span className="hx-head-grad"> Engineers</span>
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={item}
              className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg lg:mx-0"
            >
              {resolvedDescription}
            </motion.p>

            {/* Social proof — avatar cluster + mini stat badges */}
            <motion.div variants={item} className="mt-7 flex flex-col items-center gap-3.5 lg:items-start">
              <div className="flex items-center gap-3">
                <AvatarStack />
                <span className="text-sm text-white/55">Built by our growing community</span>
              </div>
              {(members != null || events != null || achievements != null) && (
                <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  {members != null && <MiniBadge icon={Users}>{members}+ developers</MiniBadge>}
                  {events != null && <MiniBadge icon={CalendarDays}>{events}+ events</MiniBadge>}
                  {achievements != null && <MiniBadge icon={Trophy}>{achievements}+ wins</MiniBadge>}
                </div>
              )}
            </motion.div>

            {/* CTAs */}
            <motion.div
              variants={item}
              className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
            >
              {canRenderHiringCta && (
                <Link
                  to={primary.to}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-7 text-base font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(249,115,22,0.5)]"
                >
                  {primary.label}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              )}
              <Link
                to="/events"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 text-base font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:border-[#f97316]/50 hover:bg-white/[0.07]"
              >
                Explore Events
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </motion.div>
          </motion.div>

          {/* ---- Right column: animated terminal ---- */}
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 12 : 30, scale: shouldReduceMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.7, delay: 0.2 }}
            className="mx-auto w-full max-w-md lg:max-w-none"
          >
            <AnimatedTerminal />
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: shouldReduceMotion ? 0.3 : 1.3, duration: 0.6 }}
          className="mt-16 hidden justify-center lg:flex"
        >
          <span className="hx-scroll">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em]">Scroll</span>
            <span className="hx-scroll-mouse">
              <span className="hx-scroll-dot" />
            </span>
          </span>
        </motion.div>
      </div>
    </section>
  );
}
