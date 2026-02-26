import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { RichContent } from '@/components/ui/markdown';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import {
  Loader2,
  ArrowLeft,
  Linkedin,
  Twitter,
  Github,
  Globe,
  Building2,
  Briefcase,
  Calendar,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Video,
  Mic,
  Users2,
  GraduationCap,
  MapPin,
  Award,
  Edit3,
  Share2,
  LinkIcon,
  Check,
  Star,
  MessageSquare,
  Handshake,
  Crown,
  Lightbulb,
  BookOpen,
  Wrench,
} from 'lucide-react';
import { api, type NetworkConnectionType, type NetworkEvent, type NetworkProfile } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';

const connectionTypeLabels: Record<NetworkConnectionType, string> = {
  GUEST_SPEAKER: 'Guest Speaker',
  GMEET_SESSION: 'Session Host',
  EVENT_JUDGE: 'Event Judge',
  MENTOR: 'Mentor',
  INDUSTRY_PARTNER: 'Industry Partner',
  ALUMNI: 'Alumni',
  OTHER: 'Collaborator',
};

const connectionTypeIcons: Record<NetworkConnectionType, typeof Star> = {
  GUEST_SPEAKER: Mic,
  GMEET_SESSION: MessageSquare,
  EVENT_JUDGE: Award,
  MENTOR: Handshake,
  INDUSTRY_PARTNER: Building2,
  ALUMNI: GraduationCap,
  OTHER: Users2,
};

type SocialLink = {
  icon: typeof Linkedin;
  label: string;
  href: string;
  accentClass: string;
};

const getEventIcon = (eventType?: string) => {
  const value = (eventType || '').toLowerCase();
  if (value.includes('gmeet') || value.includes('online') || value.includes('virtual')) return Video;
  if (value.includes('talk') || value.includes('speaker') || value.includes('keynote')) return Mic;
  return Users2;
};

const profilePhotoFor = (profile: NetworkProfile, color = 'f3f4f6') =>
  profile.profilePhoto ||
  `https://api.dicebear.com/7.x/initials/svg?seed=${profile.fullName}&backgroundColor=${color}&fontSize=36`;

const fallbackContributionCopy = (isAlumni: boolean) =>
  isAlumni
    ? 'An alumnus supporting students through guidance, real-world perspective, and encouragement.'
    : 'A professional collaborator helping students with practical exposure, mentorship, and opportunities.';

type HeroParticle = {
  id: number;
  x: number;
  y: number;
  scale: number;
  duration: number;
  delay: number;
};

const seededUnit = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const buildHeroParticles = (count: number): HeroParticle[] =>
  Array.from({ length: count }, (_, index) => {
    const seed = index + 1;
    return {
      id: index,
      x: seededUnit(seed) * 100,
      y: seededUnit(seed * 1.41) * 100,
      scale: (seededUnit(seed * 2.07) * 0.7) + 0.35,
      duration: (seededUnit(seed * 2.97) * 3.5) + 2.2,
      delay: seededUnit(seed * 3.83) * 2.5,
    };
  });

export default function NetworkProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { isMobile } = useMotionConfig();

  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const isNetworkMember = user?.role === 'NETWORK';
  const isProfileOwner = isNetworkMember && profile?.userId === user?.id;
  const isAdmin = user && ['ADMIN', 'PRESIDENT'].includes(user.role);
  const canEdit = isProfileOwner || isAdmin;

  useEffect(() => {
    if (!slug) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        const result = await api.getNetworkProfile(slug);
        const data = (result as { data?: NetworkProfile })?.data || result;
        setProfile(data as NetworkProfile);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [slug]);

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.fullName} | ${profile?.designation}`,
          text: `Explore ${profile?.fullName}'s profile on the code.scriet network.`,
          url,
        });
        return;
      } catch {
        // Ignore share cancellation and fall back to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const parsedEvents = useMemo(() => {
    if (!profile?.events || !Array.isArray(profile.events)) return [];
    return profile.events as NetworkEvent[];
  }, [profile?.events]);

  const heroParticles = useMemo(
    () => buildHeroParticles(isMobile ? 7 : 14),
    [isMobile]
  );

  const socialLinks = useMemo<SocialLink[]>(() => {
    if (!profile) return [];

    return [
      profile.linkedinUsername
        ? {
            icon: Linkedin,
            label: 'LinkedIn',
            href: `https://linkedin.com/in/${profile.linkedinUsername}`,
            accentClass: 'hover:bg-[#0077b5] hover:text-white',
          }
        : null,
      profile.twitterUsername
        ? {
            icon: Twitter,
            label: 'Twitter',
            href: `https://twitter.com/${profile.twitterUsername}`,
            accentClass: 'hover:bg-[#1da1f2] hover:text-white',
          }
        : null,
      profile.githubUsername
        ? {
            icon: Github,
            label: 'GitHub',
            href: `https://github.com/${profile.githubUsername}`,
            accentClass: 'hover:bg-slate-900 hover:text-white',
          }
        : null,
      profile.personalWebsite
        ? {
            icon: Globe,
            label: 'Website',
            href: profile.personalWebsite,
            accentClass: 'hover:bg-emerald-600 hover:text-white',
          }
        : null,
    ].filter(Boolean) as SocialLink[];
  }, [profile]);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[72vh] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-amber-600" />
            <p className="text-sm text-slate-600">Loading profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (notFound || !profile) {
    return (
      <Layout>
        <SEO title="Profile Not Found" />
        <div className="flex min-h-[72vh] items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
              <Users2 className="h-10 w-10 text-slate-500" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">Profile Not Found</h1>
            <p className="mb-7 text-slate-600">This profile does not exist or is not publicly visible yet.</p>
            <Link to="/network">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Network
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const isAlumni = profile.connectionType === 'ALUMNI';
  const TypeIcon = connectionTypeIcons[profile.connectionType];
  const profileTheme = isAlumni
    ? {
        hero: 'from-slate-800 via-slate-900 to-stone-900',
        stroke: 'from-amber-500 to-orange-500',
        soft: 'from-gray-50 to-slate-50',
        label: 'Alumni',
        accentText: 'text-amber-600',
        avatarColor: '44403c',
        badgeBg: 'border-amber-200 bg-amber-100 text-amber-700',
      }
    : {
        hero: 'from-slate-800 via-slate-900 to-stone-900',
        stroke: 'from-amber-500 to-orange-500',
        soft: 'from-gray-50 to-slate-50',
        label: 'Industry Professional',
        accentText: 'text-amber-600',
        avatarColor: '44403c',
        badgeBg: 'border-amber-200 bg-amber-100 text-amber-700',
      };

  const profileTitle = `${profile.fullName} | ${profile.designation} at ${profile.company}`;
  const profilePath = `/network/${profile.slug || profile.id}`;
  const profileLink =
    typeof window === 'undefined' ? `https://codescriet.dev${profilePath}` : `${window.location.origin}${profilePath}`;

  const supportSummary = profile.connectionNote?.trim() || fallbackContributionCopy(isAlumni);
  const aboutSummary =
    profile.bio?.trim() ||
    `${profile.fullName} is part of the code.scriet network and contributes through mentorship, sessions, and guidance.`;

  const snapshotRows = [
    { label: 'Connection Type', value: connectionTypeLabels[profile.connectionType], icon: TypeIcon },
    { label: 'Company', value: profile.company, icon: Building2 },
    { label: 'Role', value: profile.designation, icon: Briefcase },
    { label: 'Industry', value: profile.industry || 'Not specified', icon: Briefcase },
  ];

  const detailRows = isAlumni
    ? [
        { label: 'Passout Year', value: profile.passoutYear ? String(profile.passoutYear) : null },
        { label: 'Degree', value: profile.degree || null },
        { label: 'Branch', value: profile.branch || null },
        { label: 'Location', value: profile.currentLocation || null },
      ].filter(row => row.value)
    : [];

  return (
    <Layout>
      <SEO
        title={profileTitle}
        description={
          profile.bio ||
          `${profile.fullName} is part of the code.scriet ${isAlumni ? 'alumni' : 'professional'} network as a ${profile.designation} at ${profile.company}.`
        }
        url={profilePath}
      />

      <div className="relative min-h-screen bg-white">
        {/* ═══════════════════════ HERO ═══════════════════════ */}
        <section className={`relative overflow-hidden bg-gradient-to-br ${profileTheme.hero} pb-24 pt-10 text-white sm:pb-28 sm:pt-12`}>
          {/* Animated particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {heroParticles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute h-1.5 w-1.5 rounded-full bg-amber-400/25"
                style={{ left: `${particle.x}%`, top: `${particle.y}%`, scale: particle.scale }}
                animate={
                  prefersReducedMotion
                    ? { opacity: 0.2 }
                    : { y: [0, isMobile ? -48 : -120], opacity: [0, 0.8, 0] }
                }
                transition={{
                  duration: isMobile ? particle.duration + 1.8 : particle.duration,
                  repeat: prefersReducedMotion ? 0 : Infinity,
                  delay: particle.delay,
                  ease: 'linear',
                }}
              />
            ))}
            {/* Soft blobs */}
            <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-amber-500/8 blur-2xl sm:-left-24 sm:h-64 sm:w-64 sm:blur-3xl" />
            <div className="absolute -right-16 bottom-0 h-52 w-52 rounded-full bg-orange-500/8 blur-2xl sm:-right-24 sm:h-80 sm:w-80 sm:blur-3xl" />
            <div className="absolute left-1/2 top-1/3 h-56 w-56 -translate-x-1/2 rounded-full bg-amber-600/5 blur-3xl" />
          </div>

          {/* Nav bar */}
          <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/network"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Network
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
                </Button>
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => navigate('/dashboard/network/edit')}
                    className="gap-2 bg-white text-amber-600 hover:bg-amber-50"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit Profile</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Identity — centered in the hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="performance-surface flex flex-col items-center text-center"
            >
              {/* Profile photo with amber ring */}
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-gradient-to-br from-amber-400/30 to-orange-500/30 blur-lg" />
                <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-amber-400/50 shadow-2xl shadow-amber-900/40 ring-4 ring-amber-500/20 sm:h-36 sm:w-36">
                  <img
                    src={profilePhotoFor(profile, profileTheme.avatarColor)}
                    alt={profile.fullName}
                    className="h-full w-full object-cover bg-slate-800"
                  />
                </div>
                {profile.isFeatured && (
                  <div className="absolute -bottom-2 -right-2 rounded-full border-2 border-white bg-white p-1.5 shadow-md">
                    <Crown className="h-4 w-4 text-amber-500" />
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  <TypeIcon className="h-3.5 w-3.5" />
                  {connectionTypeLabels[profile.connectionType]}
                </span>
                {profile.industry && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
                    {profile.industry}
                  </span>
                )}
              </div>

              {/* Name + role */}
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl">{profile.fullName}</h1>
              <p className="mt-1.5 text-base text-amber-100/90 sm:text-lg">
                <span className="font-semibold">{profile.designation}</span>
                {profile.company && (
                  <>
                    <span className="mx-2 opacity-50">·</span>
                    <span>{profile.company}</span>
                  </>
                )}
              </p>

              {/* Metadata row */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm text-amber-200/60">
                {isAlumni && profile.passoutYear && (
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4" />
                    Class of {profile.passoutYear}
                  </span>
                )}
                {profile.currentLocation && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {profile.currentLocation}
                  </span>
                )}
                {!isAlumni && profile.connectedSince && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Connected {profile.connectedSince}
                  </span>
                )}
              </div>

              {/* Social links */}
              {socialLinks.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                  {socialLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white hover:text-slate-800"
                    >
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* Curved wave into white — the profile card peeks up through */}
          <div className="absolute inset-x-0 bottom-0 overflow-hidden leading-[0]">
            <svg viewBox="0 0 1440 80" preserveAspectRatio="none" className="w-full" style={{ height: 80 }}>
              <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill="white" />
            </svg>
          </div>
        </section>

        {/* ═══════════════════════ CONTENT ═══════════════════════ */}
        <section className="relative -mt-2 pb-14 pt-6 sm:-mt-4 sm:pb-16 sm:pt-8">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

            {/* Floating ambient blobs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -right-14 top-24 h-48 w-48 rounded-full bg-amber-100/35 blur-2xl sm:-right-20 sm:h-80 sm:w-80 sm:blur-3xl" />
              <div className="absolute -left-14 top-96 h-40 w-40 rounded-full bg-orange-100/30 blur-2xl sm:-left-20 sm:h-64 sm:w-64 sm:blur-3xl" />
            </div>

            <div className="relative grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_1fr] xl:gap-8">

              {/* ── LEFT COLUMN ── */}
              <div className="space-y-6">

                {/* Vision Section */}
                {profile.vision && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="performance-surface relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-6 shadow-sm sm:p-8"
                  >
                    <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-amber-400 to-orange-500" />
                    <h2 className="relative mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <Lightbulb className="h-4 w-4 text-white" />
                      </span>
                      Vision
                    </h2>
                    <div className="prose prose-sm max-w-none prose-amber sm:prose-base prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-amber-600">
                      <RichContent allowHtml>{profile.vision}</RichContent>
                    </div>
                  </motion.div>
                )}

                {/* Story Section */}
                {profile.story && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="performance-surface relative overflow-hidden rounded-2xl bg-white border border-amber-100 p-6 shadow-sm sm:p-8"
                  >
                    <div className="pointer-events-none absolute right-4 top-2 text-8xl font-serif leading-none text-amber-100 select-none sm:text-9xl">"</div>
                    <h2 className="relative mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <BookOpen className="h-4 w-4 text-white" />
                      </span>
                      My Story
                    </h2>
                    <div className="prose prose-sm max-w-none prose-amber sm:prose-base prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-amber-600">
                      <RichContent allowHtml>{profile.story}</RichContent>
                    </div>
                  </motion.div>
                )}

                {/* About - Only shown if no story */}
                {!profile.story && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="performance-surface relative overflow-hidden rounded-2xl bg-white border border-amber-100 p-6 shadow-sm sm:p-8"
                  >
                    {/* Decorative quotation mark */}
                    <div className="pointer-events-none absolute right-4 top-2 text-8xl font-serif leading-none text-amber-100 select-none sm:text-9xl">"</div>
                    <h2 className="relative mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <Sparkles className="h-4 w-4 text-white" />
                      </span>
                      About
                    </h2>
                    <p className="relative whitespace-pre-line leading-relaxed text-gray-600">{aboutSummary}</p>
                  </motion.div>
                )}

                {/* Expertise Section - New */}
                {profile.expertise && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.14 }}
                    className="performance-surface relative overflow-hidden rounded-2xl bg-white border border-amber-100 p-6 shadow-sm sm:p-8"
                  >
                    <h2 className="relative mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <Wrench className="h-4 w-4 text-white" />
                      </span>
                      Expertise
                    </h2>
                    <div className="prose prose-sm max-w-none prose-amber sm:prose-base prose-headings:text-gray-900 prose-p:text-gray-600 prose-a:text-amber-600">
                      <RichContent allowHtml>{profile.expertise}</RichContent>
                    </div>
                  </motion.div>
                )}

                {/* Community Contribution */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16 }}
                  className="performance-surface relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/30 p-6 shadow-sm sm:p-8"
                >
                  {/* thick left accent bar */}
                  <div className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-gradient-to-b from-amber-400 to-orange-500" />
                  <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                      <Handshake className="h-4 w-4 text-white" />
                    </span>
                    Community Contribution
                  </h2>
                  <p className="whitespace-pre-line leading-relaxed text-gray-700">{supportSummary}</p>
                </motion.div>

                {/* Highlights */}
                {(profile.adminNotes || (isAlumni && profile.achievements)) && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="rounded-2xl bg-white border border-amber-100 p-6 shadow-sm sm:p-8"
                  >
                    <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <Award className="h-4 w-4 text-white" />
                      </span>
                      Highlights &amp; Contributions
                    </h2>
                    {profile.adminNotes ? (
                      <div className="prose prose-sm max-w-none prose-amber sm:prose-base">
                        <RichContent allowHtml>{profile.adminNotes}</RichContent>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line leading-relaxed text-gray-600">{profile.achievements}</p>
                    )}
                  </motion.div>
                )}

                {/* Events timeline */}
                {parsedEvents.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="rounded-2xl bg-white border border-amber-100 p-6 shadow-sm sm:p-8"
                  >
                    <h2 className="mb-7 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                        <Calendar className="h-4 w-4 text-white" />
                      </span>
                      Sessions &amp; Engagement
                    </h2>

                    <div className="relative space-y-5 pl-7 before:absolute before:inset-y-0 before:left-3 before:w-0.5 before:bg-gray-200">
                      {parsedEvents.map((event, index) => {
                        const EventIcon = getEventIcon(event.type);
                        return (
                          <motion.div
                            key={`${event.title}-${event.date}-${index}`}
                            whileHover={prefersReducedMotion ? undefined : { x: 4 }}
                            className="relative"
                          >
                            {/* Timeline dot */}
                            <div className="absolute -left-[25px] top-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 shadow ring-4 ring-white">
                              <EventIcon className="h-2.5 w-2.5 text-white" />
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-1.5">
                                <span>{event.date}</span>
                                {event.type && <><span>·</span><span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600 font-medium">{event.type}</span></>}
                              </div>
                              <h3 className="font-semibold leading-tight text-gray-900">{event.title}</h3>
                              {event.description && (
                                <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{event.description}</p>
                              )}
                              {event.link && (
                                <a
                                  href={event.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:underline"
                                >
                                  Open session link
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* ── RIGHT COLUMN (sidebar) ── */}
              <div className="space-y-5">

                {/* Quick Info */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                  className="overflow-hidden rounded-2xl bg-white border border-amber-100 shadow-sm"
                >
                  <div className="bg-gray-50 px-5 py-4 border-b border-gray-100">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Quick Info</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {snapshotRows.map((row) => (
                      <div key={row.label} className="flex items-center gap-3 px-5 py-3.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                          <row.icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-400">{row.label}</p>
                          <p className="truncate text-sm font-semibold text-gray-900">{row.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Academic Details — alumni only */}
                {isAlumni && detailRows.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="overflow-hidden rounded-2xl bg-white border border-amber-100 shadow-sm"
                  >
                    <div className="bg-gray-50 px-5 py-4 border-b border-gray-100">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Academic Background</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {[
                        ...detailRows,
                        profile.rollNumber ? { label: 'Roll Number', value: profile.rollNumber } : null,
                      ]
                        .filter(Boolean)
                        .map((row) => (
                          <div key={(row as {label:string;value:string}).label} className="flex items-center justify-between gap-3 px-5 py-3">
                            <span className="text-sm text-gray-500">{(row as {label:string;value:string}).label}</span>
                            <span className="text-right text-sm font-semibold text-gray-900">{(row as {label:string;value:string}).value}</span>
                          </div>
                        ))}
                    </div>
                  </motion.div>
                )}

                {/* Share Profile */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.24 }}
                  className="rounded-2xl bg-white border border-amber-100 p-5 shadow-sm sm:p-6"
                >
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-stone-500">Share Profile</h3>
                  <p className="mb-3 text-sm text-gray-500">Share this page for collaboration or guidance requests.</p>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <LinkIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="flex-1 truncate text-xs text-gray-500">{profileLink}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-stone-600 hover:bg-gray-200 hover:text-stone-800"
                      onClick={handleShare}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </motion.div>

                {/* Profile owner edit */}
                {canEdit && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6"
                  >
                    <p className="mb-1 text-sm font-semibold text-emerald-700">
                      {isProfileOwner ? 'You own this profile' : 'Admin Access'}
                    </p>
                    <p className="mb-4 text-xs text-emerald-600/80">
                      {isProfileOwner ? 'Keep it updated so visitors see the latest info.' : 'You can edit this profile as an administrator.'}
                    </p>
                    <Button
                      onClick={() => navigate('/dashboard/network/edit')}
                      className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Edit3 className="mr-2 h-4 w-4" />
                      Edit Profile
                    </Button>
                  </motion.div>
                )}

                {/* Join network CTA */}
                {!isNetworkMember && (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.36 }}
                    className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 sm:p-6"
                  >
                    <p className="mb-1 text-sm font-semibold text-gray-900">Join Our Network</p>
                    <p className="mb-4 text-xs text-gray-600">
                      Alumnus or industry professional? Register to get your own profile page.
                    </p>
                    <Link to="/join-our-network">
                      <Button className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600">
                        Register to Join
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
