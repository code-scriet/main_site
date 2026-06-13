import { motion } from 'framer-motion';

import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Loader2,
  Building2,
  Linkedin,
  Github,
  Globe,
  GraduationCap,
  Briefcase,
  Users2,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { type NetworkConnectionType } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

const connectionTypeLabels: Record<NetworkConnectionType, string> = {
  GUEST_SPEAKER: 'Speaker',
  GMEET_SESSION: 'GMeet Host',
  EVENT_JUDGE: 'Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Collaborator',
};

const connectionTypeColors: Record<NetworkConnectionType, { bg: string; text: string; border: string }> = {
  GUEST_SPEAKER: { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30' },
  GMEET_SESSION: { bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/30' },
  EVENT_JUDGE: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  MENTOR: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  INDUSTRY_PARTNER: { bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/30' },
  ALUMNI: { bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
  OTHER: { bg: 'bg-gray-500/15', text: 'text-gray-300', border: 'border-gray-500/30' },
};

export function NetworkHighlight() {
  const { data: homeData, isLoading } = useHomePageData();
  const profiles = homeData?.networkHighlights ?? [];
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const navigate = useNavigate();

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  // Count alumni and professionals
  const alumniCount = profiles.filter((p) => p.connectionType === 'ALUMNI').length;
  const professionalsCount = profiles.length - alumniCount;

  return (
    <section className="relative overflow-hidden border-t border-white/8 py-16 sm:py-24 lg:py-28">
      <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="mb-12 text-center lg:mb-16"
        >
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl md:text-5xl">
            Connect with <span className="hx-grad-text">Industry Leaders</span>
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/55 sm:text-lg">
            Alumni and industry professionals who guide, mentor, and collaborate with our technical club
          </p>

          {/* Stats */}
          {(alumniCount > 0 || professionalsCount > 0) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              {professionalsCount > 0 && (
                <div className="glass-pill px-4 py-2">
                  <Briefcase className="h-4 w-4 text-amber-300" />
                  <span className="text-sm text-white/70">
                    <strong className="text-amber-300">{professionalsCount}</strong> Professionals
                  </span>
                </div>
              )}
              {alumniCount > 0 && (
                <div className="glass-pill px-4 py-2">
                  <GraduationCap className="h-4 w-4 text-orange-300" />
                  <span className="text-sm text-white/70">
                    <strong className="text-orange-300">{alumniCount}</strong> Alumni
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Network Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-200/40 blur-xl dark:bg-amber-500/20" />
              <Loader2 className="relative h-12 w-12 animate-spin text-amber-600 dark:text-amber-300" />
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-zinc-500">Loading network...</p>
          </div>
        ) : profiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-3xl border border-gray-200 bg-white py-16 text-center shadow-sm dark:border-zinc-800 dark:bg-[#0d0f14]"
          >
            <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-zinc-700 dark:bg-zinc-900">
              <Users2 className="h-10 w-10 text-amber-600 dark:text-amber-300" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Network profiles coming soon!</h3>
            <p className="mt-2 text-gray-600 dark:text-zinc-400">Stay tuned to meet our amazing alumni and industry connections</p>
          </motion.div>
        ) : (
          <div className="mb-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {profiles.map((profile, index) => {
              const typeStyle = connectionTypeColors[profile.connectionType];
              const isAlumni = profile.connectionType === 'ALUMNI';
              const profileUrl = `/network/${profile.slug || profile.id}`;

              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: animationY }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.3 : 0.5, delay: index * staggerDelay }}
                  viewport={{ once: true, margin: '-50px' }}
                  whileHover={!isMobile ? { y: -6 } : undefined}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(profileUrl)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(profileUrl);
                    }
                  }}
                  aria-label={`View ${profile.fullName}'s profile`}
                  className="glass-card glass-card--lift group relative overflow-hidden !rounded-2xl"
                >
                  {/* Hover glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#f97316]/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  {/* Featured indicator */}
                  {profile.isFeatured && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-1 rounded-full border border-amber-400 bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 shadow-sm dark:border-amber-400/40 dark:from-amber-500 dark:to-orange-500">
                        <Sparkles className="h-3 w-3 text-white" />
                        <span className="text-xs font-medium text-white">Featured</span>{/* responsive: min 12px */}
                      </div>
                    </div>
                  )}

                  {/* Top accent bar */}
                  <div
                    className="h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 dark:from-amber-500 dark:via-orange-500 dark:to-orange-600"
                  />

                  <div className="relative z-10 p-5">
                    <div className="flex gap-4">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className="h-16 w-16 overflow-hidden rounded-xl shadow-sm ring-2 ring-amber-200 dark:ring-zinc-700">
                          <img
                            src={
                              profile.profilePhoto ||
                              '/fallback-avatar.svg'
                            }
                            alt={profile.fullName}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={(event) => {
                              event.currentTarget.src = '/fallback-avatar.svg';
                            }}
                          />
                        </div>
                        {isAlumni && profile.passoutYear && (
                          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-500 to-orange-500 text-[10px] font-bold text-white shadow-sm dark:border-[#0c0d12] dark:from-amber-500 dark:to-orange-500">{/* responsive: slightly larger for readability */}
                            '{String(profile.passoutYear).slice(-2)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-gray-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-300">
                          {profile.fullName}
                        </h3>
                        <p className="flex items-center gap-1.5 truncate text-sm text-gray-700 dark:text-zinc-300">
                          <Briefcase className="h-3 w-3 text-gray-400 dark:text-zinc-500" />
                          {profile.designation}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-gray-600 dark:text-zinc-400">
                          <Building2 className="h-3 w-3 text-gray-400 dark:text-zinc-500" />
                          {profile.company}
                        </p>
                      </div>
                    </div>

                    {/* Tags row */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge className={`${typeStyle.bg} ${typeStyle.text} border ${typeStyle.border} text-xs shadow-sm`}>{/* responsive: min 12px */}
                        {connectionTypeLabels[profile.connectionType]}
                      </Badge>
                      {isAlumni && profile.branch && (
                        <Badge className="border border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{/* responsive: min 12px */}
                          {profile.branch}
                        </Badge>
                      )}
                      <Badge className="border border-gray-200 bg-gray-50 text-xs text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{/* responsive: min 12px */}
                        {profile.industry}
                      </Badge>
                    </div>

                    {/* Social Links */}
                    <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        {profile.linkedinUsername && (
                          <a
                            href={`https://linkedin.com/in/${profile.linkedinUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.githubUsername && (
                          <a
                            href={`https://github.com/${profile.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                          >
                            <Github className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.personalWebsite && (
                          <a
                            href={profile.personalWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <Link
                        to={profileUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs font-medium text-amber-300 transition-colors hover:text-amber-200 dark:text-amber-300 dark:hover:text-amber-200"
                      >
                        View Profile
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link
            to="/network"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-sm font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:border-[#f97316]/50 hover:bg-white/[0.07]"
          >
            Explore Our Network
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
