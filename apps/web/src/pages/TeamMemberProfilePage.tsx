import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema, ProfilePageSchema } from '@/components/ui/schema';
import { RichContent } from '@/components/ui/markdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import {
  Loader2,
  ArrowLeft,
  Linkedin,
  Twitter,
  Github,
  Instagram,
  Globe,
  Users2,
  Edit3,
  Share2,
  LinkIcon,
  Check,
  Sparkles,
  Target,
  BookOpen,
  Lightbulb,
  Award,
  Mail,
  ChevronRight,
  Quote,
} from 'lucide-react';
import { api, type TeamMember, type Credit } from '@/lib/api';
import { useMotionConfig } from '@/hooks/useMotionConfig';

// Extended TeamMember type with new profile fields
interface TeamMemberProfile extends TeamMember {
  userId?: string;
  slug?: string;
  bio?: string;
  vision?: string;
  story?: string;
  expertise?: string;
  achievements?: string;
  website?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    bio?: string;
  };
  _syncedFrom?: Record<string, 'user' | 'team'>;
}

type SocialLink = {
  icon: typeof Linkedin;
  label: string;
  href: string;
  color: string;
};

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

const profilePhotoFor = (member: TeamMemberProfile) =>
  member.imageUrl || '/fallback-avatar.svg';

export default function TeamMemberProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { isMobile } = useMotionConfig();

  const [member, setMember] = useState<TeamMemberProfile | null>(null);
  const [memberCredits, setMemberCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check if current user can edit this profile
  const isAdmin = user && ['ADMIN', 'PRESIDENT'].includes(user.role);
  const isProfileOwner = user && member?.userId === user.id;
  const canEdit = isAdmin || isProfileOwner;

  useEffect(() => {
    if (!slug) return;

    const fetchMember = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        const result = await api.getTeamMemberBySlug(slug);
        const data = result as TeamMemberProfile;
        if (data.slug && slug !== data.slug) {
          navigate(`/team/${data.slug}`, { replace: true });
        }
        setMember(data);

        // Fetch credits for this team member
        try {
          const credits = await api.getCredits(data.id);
          setMemberCredits(credits);
        } catch {
          // Credits are non-critical, fail silently
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [slug, navigate]);

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${member?.name} | ${member?.role}`,
          text: `Check out ${member?.name}'s profile on code.scriet team.`,
          url,
        });
        return;
      } catch {
        // Fall back to clipboard
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

  const heroParticles = useMemo(
    () => buildHeroParticles(isMobile ? 8 : 16),
    [isMobile]
  );

  const socialLinks = useMemo<SocialLink[]>(() => {
    if (!member) return [];

    const VALID_USERNAME = /^[a-zA-Z0-9._-]+$/;
    const buildSocialUrl = (value: string, base: string): string | null => {
      if (value.startsWith('http')) return value;
      if (VALID_USERNAME.test(value)) return `${base}/${value}`;
      return null;
    };

    return [
      member.github
        ? (() => {
            const href = buildSocialUrl(member.github, 'https://github.com');
            return href ? { icon: Github, label: 'GitHub', href, color: 'hover:bg-gray-900 hover:text-white' } : null;
          })()
        : null,
      member.linkedin
        ? (() => {
            const href = buildSocialUrl(member.linkedin, 'https://linkedin.com/in');
            return href ? { icon: Linkedin, label: 'LinkedIn', href, color: 'hover:bg-[#0077b5] hover:text-white' } : null;
          })()
        : null,
      member.twitter
        ? (() => {
            const href = buildSocialUrl(member.twitter, 'https://twitter.com');
            return href ? { icon: Twitter, label: 'Twitter', href, color: 'hover:bg-[#1da1f2] hover:text-white' } : null;
          })()
        : null,
      member.instagram
        ? (() => {
            const href = buildSocialUrl(member.instagram, 'https://instagram.com');
            return href ? { icon: Instagram, label: 'Instagram', href, color: 'hover:bg-gradient-to-br hover:from-purple-600 hover:to-pink-500 hover:text-white' } : null;
          })()
        : null,
      member.website
        ? {
            icon: Globe,
            label: 'Website',
            href: member.website,
            color: 'hover:bg-emerald-600 hover:text-white',
          }
        : null,
    ].filter(Boolean) as SocialLink[];
  }, [member]);

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

  if (notFound || !member) {
    return (
      <Layout>
        <SEO title="Team Member Not Found" url={slug ? `/team/${slug}` : '/team'} noIndex={true} />
        <div className="flex min-h-[72vh] items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
              <Users2 className="h-10 w-10 text-slate-500" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-slate-900">Profile Not Found</h1>
            <p className="mb-7 text-slate-600">This team member profile does not exist.</p>
            <Link to="/team">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Team
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const profilePath = `/team/${member.slug || member.id}`;
  const profileLink = typeof window === 'undefined' 
    ? `https://codescriet.dev${profilePath}` 
    : `${window.location.origin}${profilePath}`;

  // Check which sections have content
  const hasVision = member.vision?.trim();
  const hasStory = member.story?.trim() || member.bio?.trim();
  const hasExpertise = member.expertise?.trim();
  const hasAchievements = member.achievements?.trim();
  const hasContentSections = hasVision || hasStory || hasExpertise || hasAchievements;

  return (
    <Layout>
      <SEO
        title={`${member.name} | ${member.role} | codescriet Team`}
        description={member.bio || `${member.name} is a ${member.role} on the ${member.team} team at codescriet (code.scriet), SCRIET's coding club.`}
        url={profilePath}
      />
      <ProfilePageSchema
        profileUrl={profileLink}
        personName={member.name}
        description={member.bio || `${member.name} contributes as ${member.role} on the ${member.team} team at codescriet.`}
        image={member.imageUrl || undefined}
        jobTitle={member.role}
        affiliation="codescriet"
        sameAs={[
          member.github?.startsWith('http') ? member.github : member.github ? `https://github.com/${member.github}` : null,
          member.linkedin?.startsWith('http') ? member.linkedin : member.linkedin ? `https://linkedin.com/in/${member.linkedin}` : null,
          member.twitter?.startsWith('http') ? member.twitter : member.twitter ? `https://twitter.com/${member.twitter}` : null,
          member.website || null,
          member.instagram?.startsWith('http') ? member.instagram : member.instagram ? `https://instagram.com/${member.instagram}` : null,
        ].filter((value): value is string => Boolean(value))}
        breadcrumbName={`${member.name} | Team`}
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Team', url: 'https://codescriet.dev/team' },
          { name: member.name, url: profileLink },
        ]}
      />

      <div className="relative min-h-screen bg-white">
        {/* ═══════════════════════ HERO ═══════════════════════ */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 pb-28 pt-10 text-white sm:pb-32 sm:pt-12">
          {/* Animated particles */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {heroParticles.map((particle) => (
              <motion.div
                key={particle.id}
                className="absolute h-1.5 w-1.5 rounded-full bg-amber-400/30"
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
            {/* Soft gradient blobs */}
            <div className="absolute -left-20 top-0 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl sm:-left-32 sm:h-72 sm:w-72" />
            <div className="absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl sm:-right-32 sm:h-80 sm:w-80" />
            <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-600/5 blur-3xl" />
          </div>

          {/* Navigation */}
          <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/team"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Team
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
                    onClick={() => navigate(`/dashboard/team/${member.id}/edit`)}
                    className="gap-2 bg-amber-500 text-white hover:bg-amber-400 border-none"
                  >
                    <Edit3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit Profile</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Profile Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center text-center"
            >
              {/* Profile Photo */}
              <div className="relative mt-4">
                <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/40 blur-xl" />
                <div className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-amber-400/50 shadow-2xl shadow-amber-900/50 ring-4 ring-amber-500/20 sm:h-48 sm:w-48">
                  <img
                    src={profilePhotoFor(member)}
                    alt={member.name}
                    className="h-full w-full object-cover bg-amber-800"
                    onError={(event) => {
                      event.currentTarget.src = '/fallback-avatar.svg';
                    }}
                  />
                </div>
              </div>

              {/* Team Badge */}
              <Badge className="mt-5 border-amber-400/30 bg-amber-500/20 text-amber-200 backdrop-blur-sm">
                <Sparkles className="mr-1.5 h-3 w-3" />
                {member.team} Team
              </Badge>

              {/* Name & Role */}
              <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white drop-shadow-lg sm:text-4xl">{member.name}</h1>
              <p className="mt-2 text-lg font-medium text-amber-100 sm:text-xl">{member.role}</p>

              {/* Bio tagline */}
              {member.bio?.trim() && (
                <motion.div 
                  initial={{ opacity: 0, y: 30, scale: 0.95, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                  transition={{ duration: 1.2, delay: 0.2, type: 'spring', bounce: 0.4 }}
                  className="mx-auto mt-8 w-full max-w-4xl px-4 sm:px-0 relative z-10 group perspective-[1000px]"
                >
                  {/* Decorative Glow Behind Card - Appears on hover */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/0 via-amber-500/10 to-amber-500/0 blur-xl opacity-0 group-hover:opacity-100 transition duration-1000" />
                  
                  {/* Glass Card Container (Ultra subtle sheer glass) */}
                  <motion.div 
                    animate={{ y: [0, -4, 0] }}
                    whileHover={{ scale: 1.015, y: -6 }}
                    transition={{ 
                      y: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
                      scale: { type: 'spring', stiffness: 400, damping: 25 }
                    }}
                    className="relative overflow-hidden rounded-3xl border border-white/[0.04] bg-white/[0.02] px-6 py-6 sm:px-10 sm:py-8 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)] ring-1 ring-white/[0.02] transition-colors duration-500 hover:bg-white/[0.04] hover:border-white/[0.08] hover:shadow-[0_16px_48px_rgba(251,191,36,0.05)] cursor-default"
                  >
                    {/* Sweeping Hover Shine Effect */}
                    <div className="absolute inset-0 -translate-x-[150%] skew-x-[30deg] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-[200%]" />
                    
                    {/* Top subtle gradient border */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-100/10 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Background Icon Watermark */}
                    <Quote className="absolute -top-6 -left-6 h-32 w-32 text-amber-50/[0.02] -rotate-12 transform-gpu transition-transform duration-700 group-hover:scale-110 group-hover:-rotate-6" />
                    
                    {/* Content (Brighter text, stronger drop shadow, elegant sizing) */}
                    <div className="prose prose-base prose-invert relative z-10 mx-auto text-center prose-p:leading-relaxed prose-p:my-1 tracking-wide text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] prose-strong:text-white prose-strong:font-bold prose-strong:drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] prose-a:text-amber-400 prose-a:underline hover:prose-a:text-amber-300 transition-colors [&_*]:!text-white [&_strong]:!text-white [&_a]:!text-amber-400">
                      <RichContent allowHtml>{member.bio}</RichContent>
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* Social Links */}
              {socialLinks.length > 0 && (
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  {socialLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm transition ${link.color}`}
                    >
                      <link.icon className="h-4 w-4" />
                      {link.label}
                    </a>
                  ))}
                </div>
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

        {/* ═══════════════════════ CONTENT ═══════════════════════ */}
        <section className="relative -mt-2 pb-16 pt-8 sm:-mt-4 sm:pb-20 sm:pt-10">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            {hasContentSections ? (
              <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
                {/* ── MAIN CONTENT ── */}
                <div className="space-y-6 lg:col-span-2">
                  {/* Vision Section */}
                  {hasVision && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-6 shadow-sm sm:p-8"
                    >
                      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
                          <Target className="h-4.5 w-4.5 text-white" />
                        </span>
                        Vision
                      </h2>
                      <div className="prose prose-sm max-w-none text-gray-700 sm:prose-base">
                        <RichContent allowHtml>{member.vision!}</RichContent>
                      </div>
                    </motion.div>
                  )}

                  {/* Story/Background Section */}
                  {hasStory && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8"
                    >
                      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 shadow-sm">
                          <BookOpen className="h-4.5 w-4.5 text-white" />
                        </span>
                        Story
                      </h2>
                      <div className="prose prose-sm max-w-none text-gray-700 sm:prose-base">
                        <RichContent allowHtml>{member.story || member.bio!}</RichContent>
                      </div>
                    </motion.div>
                  )}

                  {/* Expertise Section */}
                  {hasExpertise && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 p-6 shadow-sm sm:p-8"
                    >
                      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
                          <Lightbulb className="h-4.5 w-4.5 text-white" />
                        </span>
                        Expertise
                      </h2>
                      <div className="prose prose-sm max-w-none text-gray-700 sm:prose-base">
                        <RichContent allowHtml>{member.expertise!}</RichContent>
                      </div>
                    </motion.div>
                  )}

                  {/* Achievements Section */}
                  {hasAchievements && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 p-6 shadow-sm sm:p-8"
                    >
                      <h2 className="mb-4 flex items-center gap-2.5 text-xl font-bold text-gray-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
                          <Award className="h-4.5 w-4.5 text-white" />
                        </span>
                        Achievements
                      </h2>
                      <div className="prose prose-sm max-w-none text-gray-700 sm:prose-base">
                        <RichContent allowHtml>{member.achievements!}</RichContent>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* ── SIDEBAR ── */}
                <div className="space-y-5">
                  {/* Quick Info Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm"
                  >
                    <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Quick Info</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                          <Users2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-400">Team</p>
                          <p className="truncate text-sm font-semibold text-gray-900">{member.team}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-3.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-400">Role</p>
                          <p className="truncate text-sm font-semibold text-gray-900">{member.role}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Connect Card */}
                  {socialLinks.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.18 }}
                      className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-stone-500">
                        <Mail className="h-3.5 w-3.5" />
                        Connect
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {socialLinks.map((link) => (
                          <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <link.icon className="h-4 w-4" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Credits Card */}
                  {memberCredits.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.21 }}
                      className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-stone-500">
                        <Award className="h-3.5 w-3.5" />
                        Contributions
                      </h3>
                      <div className="space-y-3">
                        {memberCredits.map((credit) => (
                          <div key={credit.id} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                              <Award className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{credit.title}</p>
                              {credit.description && (
                                <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{credit.description}</p>
                              )}
                              <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0">
                                {credit.category}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Link
                        to="/credits"
                        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                      >
                        View all credits
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </motion.div>
                  )}

                  {/* Share Profile Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.24 }}
                    className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm sm:p-6"
                  >
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-stone-500">Share Profile</h3>
                    <p className="mb-3 text-sm text-gray-500">Share this page to connect or collaborate.</p>
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

                  {/* Edit CTA for owners */}
                  {canEdit && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6"
                    >
                      <p className="mb-1 text-sm font-semibold text-emerald-700">
                        {isProfileOwner ? 'Your Profile' : 'Admin Access'}
                      </p>
                      <p className="mb-4 text-xs text-emerald-600/80">
                        {isProfileOwner 
                          ? 'Keep it updated so visitors see the latest info.'
                          : 'You can edit this profile as an admin.'}
                      </p>
                      <Button
                        onClick={() => navigate(`/dashboard/team/${member.id}/edit`)}
                        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Edit Profile
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              /* Empty State - No content yet */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-2xl text-center py-12"
              >
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
                  <Sparkles className="h-10 w-10 text-amber-600" />
                </div>
                <h2 className="mb-3 text-2xl font-bold text-gray-900">Profile Coming Soon</h2>
                <p className="mb-6 text-gray-600">
                  {member.name} hasn't added their full profile yet. Check back soon for more details about their journey and expertise.
                </p>
                
                {/* Social Links if available */}
                {socialLinks.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-3">
                    {socialLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                      >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}

                {canEdit && (
                  <div className="mt-8">
                    <Button
                      onClick={() => navigate(`/dashboard/team/${member.id}/edit`)}
                      className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                    >
                      <Edit3 className="h-4 w-4" />
                      Add Profile Content
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </section>

        {/* Join Team CTA */}
        {!user && (
          <section className="border-t border-gray-100 bg-gradient-to-br from-amber-50 to-orange-50 py-12">
            <div className="container mx-auto max-w-4xl px-4 text-center">
              <h2 className="mb-3 text-2xl font-bold text-gray-900">Join Our Team</h2>
              <p className="mb-6 text-gray-600">
                Interested in being part of code.scriet? Check out our open positions.
              </p>
              <Link to="/join-us">
                <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600">
                  Apply Now
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
