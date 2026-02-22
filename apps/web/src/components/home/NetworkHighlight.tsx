import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
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
import { api, type NetworkProfile, type NetworkConnectionType } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';

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
  GUEST_SPEAKER: { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600', border: 'border-fuchsia-300' },
  GMEET_SESSION: { bg: 'bg-sky-500/15', text: 'text-sky-600', border: 'border-sky-300' },
  EVENT_JUDGE: { bg: 'bg-amber-500/15', text: 'text-amber-600', border: 'border-amber-300' },
  MENTOR: { bg: 'bg-emerald-500/15', text: 'text-emerald-600', border: 'border-emerald-300' },
  INDUSTRY_PARTNER: { bg: 'bg-indigo-500/15', text: 'text-indigo-600', border: 'border-indigo-300' },
  ALUMNI: { bg: 'bg-orange-500/15', text: 'text-orange-600', border: 'border-orange-300' },
  OTHER: { bg: 'bg-gray-500/15', text: 'text-gray-600', border: 'border-gray-300' },
};

export function NetworkHighlight() {
  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const response = await api.getNetworkProfiles();
        // Public endpoint already returns verified/public profiles sorted for display.
        const filtered = response.profiles.slice(0, 6);
        setProfiles(filtered);
      } catch (err) {
        console.error('Failed to fetch network profiles:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  // Count alumni and professionals
  const alumniCount = profiles.filter((p) => p.connectionType === 'ALUMNI').length;
  const professionalsCount = profiles.length - alumniCount;

  return (
    <section className="relative overflow-hidden border-t border-gray-100/50 bg-gradient-to-b from-gray-50/30 via-gray-100/40 to-gray-50/60 py-16 sm:py-24 lg:py-28">
      {/* Background Effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-[280px] w-[280px] rounded-full bg-amber-100/25 blur-[64px] sm:-right-40 sm:-top-40 sm:h-[500px] sm:w-[500px] sm:blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 h-[240px] w-[240px] rounded-full bg-orange-100/25 blur-[64px] sm:-bottom-40 sm:-left-40 sm:h-[400px] sm:w-[400px] sm:blur-[100px]" />
      </div>
      
      {/* Subtle Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="mb-12 text-center lg:mb-16"
        >
          <motion.div
            initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            viewport={{ once: true }}
            className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 shadow-sm"
          >
            <Users2 className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Alumni & Industry Network</span>
          </motion.div>

          <h2 className="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl md:text-5xl">
            Connect with{' '}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Industry Leaders
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-lg">
            Alumni and industry professionals who guide, mentor, and collaborate with our technical club
          </p>

          {/* Stats */}
          {(alumniCount > 0 || professionalsCount > 0) && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              {professionalsCount > 0 && (
                <div className="flex items-center gap-2.5 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 shadow-sm">
                  <Briefcase className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-gray-700">
                    <strong className="text-amber-700">{professionalsCount}</strong> Professionals
                  </span>
                </div>
              )}
              {alumniCount > 0 && (
                <div className="flex items-center gap-2.5 rounded-full border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2 shadow-sm">
                  <GraduationCap className="h-4 w-4 text-orange-600" />
                  <span className="text-sm text-gray-700">
                    <strong className="text-orange-700">{alumniCount}</strong> Alumni
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Network Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-200/40 blur-xl" />
              <Loader2 className="relative h-12 w-12 animate-spin text-amber-600" />
            </div>
            <p className="mt-4 text-sm text-gray-500">Loading network...</p>
          </div>
        ) : profiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-3xl border border-gray-200 bg-white py-16 text-center shadow-sm"
          >
            <div className="mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
              <Users2 className="h-10 w-10 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Network profiles coming soon!</h3>
            <p className="mt-2 text-gray-600">Stay tuned to meet our amazing alumni and industry connections</p>
          </motion.div>
        ) : (
          <div className="mb-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {profiles.map((profile, index) => {
              const typeStyle = connectionTypeColors[profile.connectionType];
              const isAlumni = profile.connectionType === 'ALUMNI';

              return (
                <motion.div
                  key={profile.id}
                  initial={{ opacity: 0, y: animationY }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0.3 : 0.5, delay: index * staggerDelay }}
                  viewport={{ once: true }}
                  whileHover={!isMobile ? { y: -6 } : undefined}
                  className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:border-amber-300 hover:shadow-lg hover:shadow-amber-500/20`}
                >
                  {/* Hover glow effect */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${isAlumni ? 'from-amber-50 to-orange-50' : 'from-amber-50 to-orange-50'} opacity-0 group-hover:opacity-60 transition-opacity duration-300`} />

                  {/* Featured indicator */}
                  {profile.isFeatured && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 border border-amber-400 px-2 py-0.5 shadow-sm">
                        <Sparkles className="h-3 w-3 text-white" />
                        <span className="text-[10px] font-medium text-white">Featured</span>
                      </div>
                    </div>
                  )}

                  {/* Top accent bar */}
                  <div
                    className={`h-1 bg-gradient-to-r ${
                      isAlumni
                        ? 'from-amber-500 via-orange-500 to-amber-400'
                        : 'from-amber-500 via-orange-500 to-amber-400'
                    }`}
                  />

                  <div className="relative z-10 p-5">
                    <div className="flex gap-4">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <div className={`h-16 w-16 overflow-hidden rounded-xl ring-2 ${isAlumni ? 'ring-amber-200' : 'ring-amber-200'} shadow-sm`}>
                          <img
                            src={
                              profile.profilePhoto ||
                              `https://api.dicebear.com/7.x/initials/svg?seed=${profile.fullName}&backgroundColor=${
                                isAlumni ? 'fbbf24' : 'fbbf24'
                              }&fontSize=36&textColor=ffffff`
                            }
                            alt={profile.fullName}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        </div>
                        {isAlumni && profile.passoutYear && (
                          <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-amber-500 to-orange-500 text-[9px] font-bold text-white shadow-sm">
                            '{String(profile.passoutYear).slice(-2)}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <Link to={`/network/${profile.slug || profile.id}`}>
                          <h3 className={`truncate font-semibold text-gray-900 transition-colors ${isAlumni ? 'group-hover:text-amber-600' : 'group-hover:text-amber-600'}`}>
                            {profile.fullName}
                          </h3>
                        </Link>
                        <p className="flex items-center gap-1.5 truncate text-sm text-gray-700">
                          <Briefcase className="h-3 w-3 text-gray-400" />
                          {profile.designation}
                        </p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-gray-600">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          {profile.company}
                        </p>
                      </div>
                    </div>

                    {/* Tags row */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge className={`${typeStyle.bg} ${typeStyle.text} border ${typeStyle.border} text-[10px] shadow-sm`}>
                        {connectionTypeLabels[profile.connectionType]}
                      </Badge>
                      {isAlumni && profile.branch && (
                        <Badge className="border border-gray-200 bg-gray-50 text-[10px] text-gray-600">
                          {profile.branch}
                        </Badge>
                      )}
                      <Badge className="border border-gray-200 bg-gray-50 text-[10px] text-gray-600">
                        {profile.industry}
                      </Badge>
                    </div>

                    {/* Social Links */}
                    <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                      <div className="flex items-center gap-2">
                        {profile.linkedinUsername && (
                          <a
                            href={`https://linkedin.com/in/${profile.linkedinUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Linkedin className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.githubUsername && (
                          <a
                            href={`https://github.com/${profile.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                          >
                            <Github className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {profile.personalWebsite && (
                          <a
                            href={profile.personalWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <Link
                        to={`/network/${profile.slug || profile.id}`}
                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                          isAlumni
                            ? 'text-amber-600 hover:text-amber-700'
                            : 'text-amber-600 hover:text-amber-700'
                        }`}
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
          viewport={{ once: true }}
          className="text-center"
        >
          <Link to="/network">
            <Button
              variant="outline"
              size="lg"
              className="group border-amber-300 bg-white text-amber-700 hover:border-amber-400 hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 hover:text-amber-800 shadow-sm"
            >
              Explore Our Network
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
