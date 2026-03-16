import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import {
  Loader2,
  Award,
  Users2,
  Star,
  Trophy,
  Cpu,
  Palette,
  CalendarDays,
  FileText,
  Server,
  Heart,
  Sparkles,
} from 'lucide-react';
import { api, type Credit } from '@/lib/api';

// ─── Category config ─────────────────────────────────────────────────────────

type CategoryStyle = {
  icon: typeof Award;
  gradient: string;         // card gradient bg
  ring: string;             // avatar ring / border colour
  badge: string;            // category badge bg+text
  heading: string;          // section heading colour
  dot: string;              // timeline dot
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Founding: {
    icon: Trophy,
    gradient: 'from-amber-50 via-orange-50 to-yellow-50',
    ring: 'ring-amber-400/60',
    badge: 'bg-amber-100 text-amber-800',
    heading: 'text-amber-800',
    dot: 'bg-gradient-to-br from-amber-400 to-orange-500',
  },
  Platform: {
    icon: Cpu,
    gradient: 'from-blue-50 via-indigo-50 to-sky-50',
    ring: 'ring-blue-400/60',
    badge: 'bg-blue-100 text-blue-800',
    heading: 'text-blue-800',
    dot: 'bg-gradient-to-br from-blue-500 to-indigo-600',
  },
  Design: {
    icon: Palette,
    gradient: 'from-purple-50 via-pink-50 to-fuchsia-50',
    ring: 'ring-purple-400/60',
    badge: 'bg-purple-100 text-purple-800',
    heading: 'text-purple-800',
    dot: 'bg-gradient-to-br from-purple-500 to-pink-500',
  },
  Events: {
    icon: CalendarDays,
    gradient: 'from-emerald-50 via-teal-50 to-green-50',
    ring: 'ring-emerald-400/60',
    badge: 'bg-emerald-100 text-emerald-800',
    heading: 'text-emerald-800',
    dot: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  },
  Content: {
    icon: FileText,
    gradient: 'from-cyan-50 via-sky-50 to-blue-50',
    ring: 'ring-cyan-400/60',
    badge: 'bg-cyan-100 text-cyan-800',
    heading: 'text-cyan-800',
    dot: 'bg-gradient-to-br from-cyan-500 to-sky-600',
  },
  Infrastructure: {
    icon: Server,
    gradient: 'from-slate-50 via-zinc-50 to-gray-50',
    ring: 'ring-slate-400/60',
    badge: 'bg-slate-100 text-slate-800',
    heading: 'text-slate-800',
    dot: 'bg-gradient-to-br from-slate-500 to-zinc-700',
  },
  'Special Thanks': {
    icon: Heart,
    gradient: 'from-rose-50 via-pink-50 to-red-50',
    ring: 'ring-rose-400/60',
    badge: 'bg-rose-100 text-rose-800',
    heading: 'text-rose-800',
    dot: 'bg-gradient-to-br from-rose-400 to-pink-500',
  },
};

const DEFAULT_STYLE: CategoryStyle = CATEGORY_STYLES.Founding;

// ─── Seeded / deterministic particles ────────────────────────────────────────

type Particle = { id: number; x: number; y: number; scale: number; duration: number; delay: number };

const seededUnit = (s: number) => {
  const v = Math.sin(s * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

const makeParticles = (n: number): Particle[] =>
  Array.from({ length: n }, (_, i) => {
    const s = i + 1;
    return {
      id: i,
      x: seededUnit(s) * 100,
      y: seededUnit(s * 1.41) * 100,
      scale: seededUnit(s * 2.07) * 0.6 + 0.3,
      duration: seededUnit(s * 2.97) * 3 + 2.5,
      delay: seededUnit(s * 3.83) * 2.5,
    };
  });

const PARTICLES = makeParticles(18);

// ─── Component ───────────────────────────────────────────────────────────────

export default function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    api.getCredits()
      .then((data) => { if (!cancelled) setCredits(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load credits'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Credit[]>();
    for (const c of credits) {
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return Array.from(map.entries());
  }, [credits]);

  const totalPeople = useMemo(
    () => credits.filter((c) => c.teamMemberId).length,
    [credits]
  );

  return (
    <Layout>
      <SEO
        title="Credits & Acknowledgements"
        description="Recognizing the people, efforts, and contributions that make code.scriet possible."
        url="/credits"
      />

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 pb-28 pt-16 text-white sm:pb-32 sm:pt-20">
        {/* Floating particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute h-1.5 w-1.5 rounded-full bg-amber-400/25"
              style={{ left: `${p.x}%`, top: `${p.y}%`, scale: p.scale }}
              animate={
                prefersReducedMotion
                  ? { opacity: 0.2 }
                  : { y: [0, -110], opacity: [0, 0.7, 0] }
              }
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: 'linear',
              }}
            />
          ))}
          {/* Gradient blobs */}
          <div className="absolute -left-32 -top-16 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-orange-500/8 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-600/5 blur-3xl" />
        </div>

        <div className="container relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Icon badge */}
            <div className="mx-auto mb-7 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/15 shadow-lg shadow-amber-900/30 backdrop-blur-sm">
              <Award className="h-8 w-8 text-amber-300" />
            </div>

            {/* Title — explicit text-white overrides the global h1 base style */}
            <h1 className="!text-white font-display text-4xl font-bold tracking-tight drop-shadow-sm sm:text-5xl lg:text-6xl">
              Credits &amp;{' '}
              <span className="text-amber-300">Acknowledgements</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-amber-100/70 sm:text-lg">
              Recognizing the people, efforts, and contributions that make{' '}
              <span className="font-semibold text-amber-200">code.scriet</span> possible.
            </p>

            {/* Stats row */}
            {!loading && credits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-8 inline-flex flex-wrap justify-center gap-6"
              >
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 backdrop-blur-sm">
                  <Sparkles className="h-4 w-4 text-amber-300" />
                  <span className="text-sm font-semibold text-white">{credits.length}</span>
                  <span className="text-sm text-white/60">contributions</span>
                </div>
                {totalPeople > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 backdrop-blur-sm">
                    <Users2 className="h-4 w-4 text-amber-300" />
                    <span className="text-sm font-semibold text-white">{totalPeople}</span>
                    <span className="text-sm text-white/60">contributors</span>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 backdrop-blur-sm">
                  <Star className="h-4 w-4 text-amber-300" />
                  <span className="text-sm font-semibold text-white">{grouped.length}</span>
                  <span className="text-sm text-white/60">categories</span>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Wave transition */}
        <div className="absolute inset-x-0 bottom-0 overflow-hidden leading-[0]">
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full" style={{ height: 80 }}>
            <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ══════════════════════════ CONTENT ══════════════════════════ */}
      <section className="relative bg-white pb-20 pt-10 sm:pb-28 sm:pt-14">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6">

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-24">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-sm py-24 text-center"
            >
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-100 bg-red-50">
                <Award className="h-9 w-9 text-red-400" />
              </div>
              <h2 className="mb-2 text-xl font-semibold !text-gray-900">Something went wrong</h2>
              <p className="text-sm text-gray-500">{error}</p>
            </motion.div>
          )}

          {/* Empty state */}
          {!loading && !error && grouped.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-sm py-24 text-center"
            >
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50">
                <Award className="h-9 w-9 text-amber-400" />
              </div>
              <h2 className="mb-2 text-xl font-semibold !text-gray-900">Credits coming soon</h2>
              <p className="text-sm text-gray-500">
                The credits and acknowledgements page is being prepared.
              </p>
            </motion.div>
          )}

          {/* Grouped credits */}
          {!loading && !error && grouped.length > 0 && (
            <div className="space-y-16">
              {grouped.map(([category, items], gIdx) => {
                const style = CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
                const Icon = style.icon;

                return (
                  <motion.div
                    key={category}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: gIdx * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    viewport={{ once: true, margin: '-40px' }}
                  >
                    {/* Section header */}
                    <div className="mb-6 flex items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.dot} shadow-sm`}>
                        <Icon className="h-5 w-5 text-white" />
                      </span>
                      <h2 className={`font-display text-2xl font-bold !tracking-tight ${style.heading}`}>
                        {category}
                      </h2>
                      <span className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
                        {items.length}
                      </span>
                    </div>

                    {/* Credit cards grid */}
                    <div className={`grid gap-4 ${items.length === 1 ? 'sm:grid-cols-1 max-w-lg' : 'sm:grid-cols-2'}`}>
                      {items.map((credit, cIdx) => (
                        <CreditCard
                          key={credit.id}
                          credit={credit}
                          style={style}
                          delay={cIdx * 0.06}
                        />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════ FOOTER CTA ══════════════════════════ */}
      {!loading && grouped.length > 0 && (
        <section className="border-t border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 py-14">
          <div className="container mx-auto max-w-2xl px-4 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-200 bg-white shadow-sm">
              <Heart className="h-5 w-5 text-amber-500" />
            </div>
            <h2 className="mb-2 font-display text-xl font-bold !text-amber-900">
              Want to contribute?
            </h2>
            <p className="mb-6 text-sm text-amber-800/70">
              code.scriet is built by students for students. Join our team and make your mark.
            </p>
            <Link
              to="/join-us"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-amber-600 hover:to-orange-600 hover:shadow-md"
            >
              <Sparkles className="h-4 w-4" />
              Apply to Join
            </Link>
          </div>
        </section>
      )}
    </Layout>
  );
}

// ─── Credit Card sub-component ───────────────────────────────────────────────

function CreditCard({
  credit,
  style,
  delay,
}: {
  credit: Credit;
  style: CategoryStyle;
  delay: number;
}) {
  const member = credit.teamMember;
  const memberHref = member ? `/team/${member.slug ?? member.id}` : null;

  const avatarSrc =
    member?.imageUrl ||
    (member
      ? `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(member.name)}&backgroundColor=f59e0b&fontSize=36`
      : null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true, margin: '-20px' }}
      className={`group relative overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br ${style.gradient} p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-6`}
    >
      {/* Subtle shine on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <div className="relative flex items-start gap-4">
        {/* Avatar / Icon */}
        {avatarSrc && memberHref ? (
          <Link to={memberHref} className="shrink-0" tabIndex={-1} aria-hidden>
            <img
              src={avatarSrc}
              alt={member!.name}
              className={`h-14 w-14 rounded-xl border-2 border-white object-cover shadow-sm ring-2 ${style.ring} transition-transform duration-200 group-hover:scale-105`}
            />
          </Link>
        ) : (
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-white bg-white/70 shadow-sm ring-2 ${style.ring}`}>
            <Award className="h-6 w-6 text-amber-400" />
          </div>
        )}

        {/* Text */}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold !text-gray-900 !tracking-tight leading-snug">
            {credit.title}
          </h3>

          {member && memberHref && (
            <Link
              to={memberHref}
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-amber-700 transition-colors hover:text-amber-900 hover:underline"
            >
              {member.name}
              <span className="text-gray-400">&middot;</span>
              <span className="text-gray-500 font-normal">{member.role}</span>
            </Link>
          )}

          {credit.description && (
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {credit.description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
