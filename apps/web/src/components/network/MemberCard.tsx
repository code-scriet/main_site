import { KeyboardEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import type { NetworkProfile } from '@/lib/api';
import {
  connectionTypeIcons,
  connectionTypeLabels,
  profilePhotoFor,
  profileSocialLinks,
  profileUrlFor,
} from './profileHelpers';
import { SocialRow } from './SocialRow';

export function MemberCard({
  profile,
  index,
  tone,
  isMobile,
  shouldReduceMotion,
  prefersReducedMotion,
}: {
  profile: NetworkProfile;
  index: number;
  tone: 'professional' | 'alumni';
  isMobile: boolean;
  shouldReduceMotion: boolean;
  prefersReducedMotion: boolean | null;
}) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const TypeIcon = connectionTypeIcons[profile.connectionType];
  const socials = profileSocialLinks(profile);

  const openProfile = () => navigate(profileUrlFor(profile));
  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProfile();
    }
  };

  const subline = [
    tone === 'alumni' && profile.passoutYear ? `Class of ${profile.passoutYear}` : null,
    profile.currentLocation ?? null,
    tone === 'professional' && profile.connectedSince
      ? `Connected ${profile.connectedSince}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.article
      initial={{ opacity: 0, y: isMobile ? 12 : 25, scale: isMobile ? 1 : 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        delay: isMobile ? (index % 4) * 0.03 : (index % 8) * 0.08,
        duration: shouldReduceMotion ? 0.32 : 0.6,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={prefersReducedMotion ? undefined : { y: -8 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group h-full"
    >
      <div
        role="link"
        tabIndex={0}
        onClick={openProfile}
        onKeyDown={onCardKeyDown}
        aria-label={`View ${profile.fullName} profile`}
        className={`performance-surface relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:focus-visible:ring-rose-500 dark:focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#05060a] ${
          isMobile
            ? 'min-h-[260px] border-gray-200 bg-white shadow-md dark:border-zinc-800 dark:bg-[#0d0f14] dark:shadow-black/40 sm:min-h-[330px]'
            : 'min-h-[280px] border-white/80 bg-white/70 shadow-lg backdrop-blur-sm hover:shadow-2xl hover:shadow-amber-500/20 dark:border-zinc-800/90 dark:bg-[#0e1015]/95 dark:shadow-black/45 dark:hover:shadow-red-950/35 sm:min-h-[360px]'
        }`}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-300/18 via-orange-400/10 to-amber-300/18 opacity-0 transition-opacity duration-500 group-hover:opacity-100 dark:from-red-700/12 dark:via-orange-700/8 dark:to-red-900/10"
        />

        <div className="relative mb-4 z-10 flex-shrink-0">
          <motion.div
            className="mx-auto h-28 w-28 overflow-hidden rounded-full relative sm:h-32 sm:w-32 md:h-40 md:w-40"
            whileHover={isMobile ? undefined : { scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #fbbf24, #f97316, #fbbf24)',
                backgroundSize: '200% 200%',
                padding: '3px',
              }}
              animate={!isMobile && isHovered ? {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              } : {}}
              transition={{ duration: shouldReduceMotion ? 3.5 : 2, repeat: Infinity, ease: 'linear' }}
            >
              <div className="h-full w-full rounded-full bg-white p-0.5 dark:bg-[#171922]">
                <img
                  src={profilePhotoFor(profile)}
                  alt={profile.fullName}
                  className="w-full h-full object-cover rounded-full transition-transform duration-500 group-hover:scale-110"
                  onError={(event) => {
                    event.currentTarget.src = '/fallback-avatar.svg';
                  }}
                />
              </div>
            </motion.div>

            <motion.div
              className="absolute inset-0 -z-10 rounded-full bg-amber-400/40 blur-xl dark:bg-red-700/20"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={!isMobile && isHovered ? { opacity: 1, scale: 1.3 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4 }}
            />
          </motion.div>
        </div>

        <div className="flex-grow flex flex-col text-center relative z-10">
          <motion.h4
            className="mb-1 line-clamp-2 text-base font-bold text-gray-900 dark:text-zinc-100"
            animate={isHovered ? { scale: 1.02 } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {profile.fullName}
          </motion.h4>
          <p className="text-sm font-semibold text-amber-700 dark:text-rose-300">{profile.designation}</p>
          {profile.company && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-zinc-400">{profile.company}</p>
          )}
          {subline && (
            <p className="mt-1 flex items-center justify-center gap-1 text-xs text-gray-500 dark:text-zinc-500">
              {profile.currentLocation && <MapPin className="h-3 w-3 shrink-0" />}
              <span className="line-clamp-1">{subline}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-red-950/70 dark:from-red-950/45 dark:to-orange-950/35 dark:text-rose-200">
              <TypeIcon className="h-3 w-3" />
              {connectionTypeLabels[profile.connectionType]}
            </span>
            {profile.industry && (
              <span className="rounded-lg border border-gray-200 bg-white/80 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                {profile.industry}
              </span>
            )}
          </div>

          {profile.bio && (
            <motion.p
              className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-400"
              initial={{ opacity: 0.8 }}
              animate={isHovered ? { opacity: 1 } : { opacity: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              {profile.bio}
            </motion.p>
          )}
        </div>

        <motion.div
          className="relative z-10 mt-auto flex items-center justify-center gap-3 border-t border-amber-100/50 pt-3 dark:border-zinc-800"
          initial={{ opacity: 0.7 }}
          animate={isHovered ? { opacity: 1 } : { opacity: 0.7 }}
          transition={{ duration: 0.4 }}
        >
          <SocialRow socials={socials} />
          <motion.div
            whileHover={isMobile ? undefined : { x: 3, scale: 1.05 }}
            className="ml-auto flex items-center gap-0.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1.5 text-white shadow-md dark:from-red-700 dark:to-orange-700 dark:shadow-red-950/45"
          >
            <span className="text-xs font-bold">View</span>
            <ChevronRight className="h-3 w-3" />
          </motion.div>
        </motion.div>
      </div>
    </motion.article>
  );
}
