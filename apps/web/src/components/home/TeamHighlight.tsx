import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Github, Linkedin, Twitter, Instagram, ArrowRight, Users, Loader2 } from 'lucide-react';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

export function TeamHighlight() {
  const { data: homeData, isLoading } = useHomePageData();
  const teamMembers = homeData?.teamHighlights ?? [];
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const navigate = useNavigate();

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-8 sm:mb-12 lg:mb-16"
        >
          <h2 className="mb-3 text-2xl font-bold hx-t1 sm:mb-4 sm:text-4xl md:text-5xl">
            Meet Our{' '}
            <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Team
            </span>
          </h2>
          <p className="mx-auto max-w-2xl px-2 text-base hx-t2 sm:text-lg">
            The passionate individuals driving code.scriet forward and building an amazing community
          </p>
        </motion.div>

        {/* Team Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
        ) : teamMembers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#f97316]/15 border border-[#f97316]/25">
              <Users className="h-10 w-10 text-amber-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold hx-t1">Team info coming soon!</h3>
            <p className="hx-t3">Stay tuned to meet our amazing team</p>
          </motion.div>
        ) : (
          <div className="relative mb-8 sm:mb-12">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 md:gap-8">
              {teamMembers.map((member, index) => {
                const profileSlugOrId = member.slug || member.id;
                const hasProfile = Boolean(profileSlugOrId);
                const profileUrl = hasProfile ? `/team/${profileSlugOrId}` : '';

                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: animationY }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0.3 : 0.5, delay: index * staggerDelay }}
                    viewport={{ once: true, margin: '-50px' }}
                    whileHover={!isMobile ? { y: -10 } : undefined}
                    role={hasProfile ? 'link' : undefined}
                    tabIndex={hasProfile ? 0 : undefined}
                    onClick={hasProfile ? () => navigate(profileUrl) : undefined}
                    onKeyDown={hasProfile ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(profileUrl);
                      }
                    } : undefined}
                    aria-label={hasProfile ? `View ${member.name}'s profile` : member.name}
                    className={`glass-card group h-full !rounded-2xl p-3 text-center ${hasProfile ? 'glass-card--lift cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Avatar */}
                    <div className="relative mb-4 mx-auto">
                      {/* Glow effect - only on desktop */}
                      {!isMobile && (
                        <div className="absolute -inset-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
                      )}

                      {/* Image container */}
                      <div className="relative w-24 h-24 md:w-28 md:h-28 mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full p-[3px]">
                          <div className="h-full w-full overflow-hidden rounded-full bg-white dark:bg-zinc-900">
                            <img
                              src={member.imageUrl || '/fallback-avatar.svg'}
                              alt={member.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              onError={(event) => {
                                event.currentTarget.src = '/fallback-avatar.svg';
                              }}
                            />
                          </div>
                        </div>

                        {/* Status indicator */}
                        <div className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-white bg-green-500 shadow-sm dark:border-zinc-900" />
                      </div>
                    </div>

                    {/* Info */}
                    <h3 className="mb-1 flex min-h-[2.5rem] items-center justify-center line-clamp-2 font-semibold text-gray-900 transition-colors group-hover:text-amber-600 dark:text-zinc-100 dark:group-hover:text-amber-300">
                      {member.name}
                    </h3>
                    <p className="mb-3 min-h-[1.25rem] line-clamp-1 text-sm text-gray-500 dark:text-zinc-400">{member.role}</p>
                    {hasProfile && (
                      <Link to={profileUrl} className="sr-only">
                        View {member.name}'s profile
                      </Link>
                    )}

                    {/* Social Links - simplify animations on mobile */}
                    <div className="flex justify-center gap-3 mt-auto pt-2 min-h-[40px]">
                      {member.github && (
                        <motion.a
                          href={member.github.startsWith('http') ? member.github : `https://github.com/${member.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-gray-100 p-2 text-gray-500 transition-all hover:bg-gray-900 hover:text-white dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          whileHover={!isMobile ? { scale: 1.1 } : undefined}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Github className="h-4 w-4" />
                        </motion.a>
                      )}
                      {member.linkedin && (
                        <motion.a
                          href={member.linkedin.startsWith('http') ? member.linkedin : `https://linkedin.com/in/${member.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-gray-100 p-2 text-gray-500 transition-all hover:bg-blue-600 hover:text-white dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-amber-500/85"
                          whileHover={!isMobile ? { scale: 1.1 } : undefined}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Linkedin className="h-4 w-4" />
                        </motion.a>
                      )}
                      {member.twitter && (
                        <motion.a
                          href={member.twitter.startsWith('http') ? member.twitter : `https://twitter.com/${member.twitter}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-gray-100 p-2 text-gray-500 transition-all hover:bg-sky-500 hover:text-white dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-sky-500/85"
                          whileHover={!isMobile ? { scale: 1.1 } : undefined}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Twitter className="h-4 w-4" />
                        </motion.a>
                      )}
                      {member.instagram && (
                        <motion.a
                          href={member.instagram.startsWith('http') ? member.instagram : `https://instagram.com/${member.instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-gray-100 p-2 text-gray-500 transition-all hover:bg-pink-500 hover:text-white dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-pink-500/85"
                          whileHover={!isMobile ? { scale: 1.1 } : undefined}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Instagram className="h-4 w-4" />
                        </motion.a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
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
            to="/team"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-sm font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:border-[#f97316]/50 hover:bg-white/[0.07]"
          >
            Meet the Full Team
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
