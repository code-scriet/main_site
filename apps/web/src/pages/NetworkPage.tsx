import { useState, useEffect, useMemo, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Briefcase,
  Building2,
  Loader2,
  Filter,
  X,
  ChevronRight,
  Heart,
  GraduationCap,
  Mic,
  Sparkles,
  Star,
  Handshake,
  Trophy,
  Rocket,
} from 'lucide-react';
import { api, type AuthProviders, type NetworkProfile, type NetworkConnectionType } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { connectionTypeLabels } from '@/components/network/profileHelpers';
import { FeaturedCard } from '@/components/network/FeaturedCard';
import { MemberCard } from '@/components/network/MemberCard';

const invitationWays = [
  {
    icon: Handshake,
    title: 'Mentor & Guide',
    description: 'Share practical advice, career roadmaps, and industry insights with students.',
  },
  {
    icon: Mic,
    title: 'Host Sessions',
    description: 'Lead technical talks, portfolio reviews, mock interviews, or AMA sessions.',
  },
  {
    icon: Briefcase,
    title: 'Open Opportunities',
    description: 'Help with internships, referrals, and real-world industry exposure.',
  },
];

const networkPrinciples = [
  {
    icon: Sparkles,
    title: 'Quality Community',
    description: 'Every profile is verified to ensure students connect with trusted professionals.',
  },
  {
    icon: Trophy,
    title: 'Curated Network',
    description: 'We maintain high standards to create meaningful connections.',
  },
  {
    icon: Heart,
    title: 'Lasting Impact',
    description: 'Your guidance can shape careers and build confidence for years.',
  },
];

const categoryFilters = [
  { key: 'ANY', label: 'Any' },
  { key: 'PROFESSIONAL', label: 'Professional' },
  { key: 'ALUMNI', label: 'Alumni' },
] as const;

type CategoryFilter = (typeof categoryFilters)[number]['key'];

// profileSocialLinks / profileUrlFor / profilePhotoFor and the SocialLink type
// moved to ../components/network/profileHelpers.ts (re-used by FeaturedCard,
// MemberCard, SocialRow).

export default function NetworkPage() {
  const { settings, loading: settingsLoading } = useSettings();
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  const [profiles, setProfiles] = useState<NetworkProfile[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [connectionTypes, setConnectionTypes] = useState<NetworkConnectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningNetwork, setJoiningNetwork] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  const [search, setSearch] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [selectedType, setSelectedType] = useState<NetworkConnectionType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ANY');
  const [showFilters, setShowFilters] = useState(false);

  const isNetworkMember = user?.role === 'NETWORK';
  const isLoggedIn = !!user && !!token;

  const persistNetworkIntent = useCallback((type: 'professional' | 'alumni') => {
    localStorage.setItem('network_intent', JSON.stringify({ intent: 'network', type }));
    localStorage.setItem('network_onboarding_type', type);
  }, []);

  const getNetworkAuthUrl = useCallback((type: 'professional' | 'alumni') => {
    const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api\/?$/, '');
    const provider = providers?.google ? 'google' : providers?.github ? 'github' : null;
    return provider ? `${apiBase}/api/auth/${provider}?intent=network&type=${type}` : null;
  }, [providers]);

  const handleJoinNetwork = useCallback(
    async (type: 'professional' | 'alumni') => {
      persistNetworkIntent(type);

      if (!isLoggedIn) {
        const authUrl = getNetworkAuthUrl(type);
        if (authUrl) {
          window.location.href = authUrl;
          return;
        }
        navigate('/join-our-network');
        return;
      }

      setJoiningNetwork(true);
      try {
        await api.joinNetwork(token);
        await refreshUser();
        navigate(`/network/onboarding?type=${type}`);
      } catch {
        const authUrl = getNetworkAuthUrl(type);
        if (authUrl) {
          window.location.href = authUrl;
          return;
        }
        navigate('/join-our-network');
      } finally {
        setJoiningNetwork(false);
      }
    },
    [getNetworkAuthUrl, isLoggedIn, token, refreshUser, navigate, persistNetworkIntent]
  );

  useEffect(() => {
    if (!settingsLoading && settings?.showNetwork === false) {
      navigate('/');
    }
  }, [settings?.showNetwork, settingsLoading, navigate]);

  useEffect(() => {
    let mounted = true;
    void api.getProviders()
      .then((data) => {
        if (mounted) setProviders(data);
      })
      .catch(() => {
        if (mounted) {
          setProviders({ google: false, github: false, devLogin: false, emailPassword: true });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getNetworkProfiles();
        setProfiles(data.profiles);
        setIndustries(data.filters.industries);
        setConnectionTypes(data.filters.connectionTypes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load network');
      } finally {
        setLoading(false);
      }
    };

    if (settings?.showNetwork !== false) {
      fetchProfiles();
    }
  }, [settings?.showNetwork]);

  const { visibleProfiles, featuredProfiles, industryProfessionals, alumni, counts } = useMemo(() => {
    const baseFiltered = profiles.filter((profile) => {
      if (selectedIndustry && profile.industry !== selectedIndustry) return false;
      if (selectedType && profile.connectionType !== selectedType) return false;
      if (search) {
        const query = search.toLowerCase();
        return (
          profile.fullName.toLowerCase().includes(query) ||
          profile.company.toLowerCase().includes(query) ||
          profile.designation.toLowerCase().includes(query)
        );
      }
      return true;
    });

    const categoryFiltered = baseFiltered.filter((profile) => {
      if (categoryFilter === 'PROFESSIONAL') return profile.connectionType !== 'ALUMNI';
      if (categoryFilter === 'ALUMNI') return profile.connectionType === 'ALUMNI';
      return true;
    });

    const professionalProfiles = categoryFiltered.filter((profile) => profile.connectionType !== 'ALUMNI');
    const alumniProfiles = categoryFiltered.filter((profile) => profile.connectionType === 'ALUMNI');
    const featured = categoryFiltered.filter((profile) => profile.isFeatured);

    return {
      visibleProfiles: categoryFiltered,
      featuredProfiles: featured,
      industryProfessionals: professionalProfiles,
      alumni: alumniProfiles,
      counts: {
        featured: featured.length,
        professionals: professionalProfiles.length,
        alumni: alumniProfiles.length,
      },
    };
  }, [profiles, selectedIndustry, selectedType, search, categoryFilter]);

  const hasActiveFilters = !!search || !!selectedIndustry || !!selectedType || categoryFilter !== 'ANY';

  const clearFilters = () => {
    setSearch('');
    setSelectedIndustry('');
    setSelectedType('');
    setCategoryFilter('ANY');
    setShowFilters(false);
  };

  const networkStats = useMemo(
    () => ({
      totalProfessionals: profiles.filter((profile) => profile.connectionType !== 'ALUMNI').length,
      totalAlumni: profiles.filter((profile) => profile.connectionType === 'ALUMNI').length,
      totalMentors: profiles.filter((profile) => profile.connectionType === 'MENTOR').length,
      totalCompanies: new Set(profiles.map((profile) => profile.company)).size,
    }),
    [profiles]
  );

  if (settingsLoading) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (settings?.showNetwork === false) {
    return null;
  }

  return (
    <Layout>
      <SEO
        title="Alumni & Professional Network"
        description="Connect with alumni and professionals from the codescriet network at SCRIET, CCS University Meerut."
        url="/network"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Network', url: 'https://codescriet.dev/network' },
        ]}
      />

      <div className="relative min-h-screen bg-gradient-to-b from-white via-gray-50/30 to-gray-50/50 dark:from-[#06070a] dark:via-[#0b0c11] dark:to-[#090a0e]">
        {/* Subtle background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-[260px] w-[260px] rounded-full bg-amber-50 blur-[64px] dark:bg-red-950/20 sm:-right-40 sm:-top-40 sm:h-[600px] sm:w-[600px] sm:blur-[120px]" />
          <div className="absolute -left-24 top-[420px] h-[220px] w-[220px] rounded-full bg-orange-50/60 blur-[64px] dark:bg-orange-950/15 sm:-left-40 sm:top-[500px] sm:h-[400px] sm:w-[400px] sm:blur-[100px]" />
        </div>

        {/* ══════════ HERO — light, clean ══════════ */}
        <section className="relative overflow-hidden border-b border-gray-100 bg-white pt-14 pb-16 dark:border-zinc-800 dark:bg-[#08090d] sm:pt-18 sm:pb-20">
          <div className="container relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] xl:gap-16">

              {/* Left: copy */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  code.scriet Network
                </motion.div>

                <h1 className="max-w-xl text-4xl font-black leading-[1.1] tracking-tight text-gray-900 dark:text-zinc-100 sm:text-5xl lg:text-6xl">
                  Connect with{' '}
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent dark:from-rose-500 dark:to-red-400">
                    Alumni &amp; Professionals
                  </span>{' '}
                  who shape careers.
                </h1>

                <p className="mt-5 max-w-lg text-base leading-relaxed text-gray-500 dark:text-zinc-400 sm:text-lg">
                  Industry professionals, mentors, and alumni who actively support students through
                  guidance, sessions, and real-world opportunities.
                </p>

                {!isNetworkMember ? (
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button
                      size="lg"
                      className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-7 text-white shadow-lg shadow-amber-200 hover:from-amber-600 hover:to-orange-600 dark:from-rose-600 dark:to-orange-500 dark:shadow-red-950/40 dark:hover:from-rose-500 dark:hover:to-orange-400"
                      onClick={() => handleJoinNetwork('professional')}
                      disabled={joiningNetwork}
                    >
                      {joiningNetwork ? <Loader2 className="h-5 w-5 animate-spin" /> : <Briefcase className="h-5 w-5" />}
                      Register as Professional
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="gap-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      onClick={() => handleJoinNetwork('alumni')}
                      disabled={joiningNetwork}
                    >
                      {joiningNetwork ? <Loader2 className="h-5 w-5 animate-spin" /> : <GraduationCap className="h-5 w-5" />}
                      Register as Alumni
                    </Button>
                  </div>
                ) : (
                  <div className="mt-8">
                    <Link to="/network/status">
                      <Button size="lg" className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200 hover:from-amber-600 hover:to-orange-600 dark:from-rose-600 dark:to-orange-500 dark:shadow-red-950/40 dark:hover:from-rose-500 dark:hover:to-orange-400">
                        <Heart className="h-5 w-5 fill-white text-white" />
                        View Your Network Status
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Stats row */}
                <div className="mt-8 flex flex-wrap gap-5 border-t border-gray-100 pt-8 dark:border-zinc-800">
                  {[
                    { label: 'Professionals', value: networkStats.totalProfessionals, icon: Briefcase },
                    { label: 'Alumni', value: networkStats.totalAlumni, icon: GraduationCap },
                    { label: 'Mentors', value: networkStats.totalMentors, icon: Handshake },
                    { label: 'Companies', value: networkStats.totalCompanies, icon: Building2 },
                  ].map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.06 }}
                      className="flex items-center gap-2.5"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-zinc-900">
                        <s.icon className="h-4 w-4 text-amber-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xl font-bold leading-none text-gray-900 dark:text-zinc-100">{s.value}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{s.label}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Right: How you can help card */}
              <motion.div
                initial={{ opacity: 0, y: 28, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-7 shadow-2xl shadow-gray-200/60 dark:border-zinc-800 dark:bg-[#0d0f14] dark:shadow-black/30"
              >
                {/* Decorative corner blob */}
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-50 blur-3xl dark:bg-red-950/20" />

                <div className="relative z-10">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-2.5 text-white shadow">
                      <Handshake className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-rose-400">How You Can Help</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Make a meaningful impact</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {invitationWays.map((item, index) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25 + index * 0.08 }}
                        className="flex items-start gap-3 rounded-2xl border border-gray-100 p-4 transition-colors hover:border-amber-100 hover:bg-amber-50/40 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-zinc-900 dark:text-rose-400">
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{item.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-zinc-400">{item.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="relative bg-gray-50/60 py-12">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-8 text-center"
            >
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-600">Our Values</p>
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">What this network stands for</h2>
            </motion.div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {networkPrinciples.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -5 }}
                  className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 inline-flex rounded-xl bg-amber-50 p-2.5 text-amber-600">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="sticky top-under-header z-40 border-y border-gray-100 bg-white/95 py-4 backdrop-blur-xl">
          <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:max-w-3xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by name, role, or company"
                    className="h-11 border-amber-200 bg-white pl-10 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:ring-amber-400"
                  />
                </div>

                <Button
                  variant="outline"
                  className="h-11 gap-2 border-amber-200 bg-white text-gray-700 sm:hidden"
                  onClick={() => setShowFilters((value) => !value)}
                >
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>

                <div className="hidden gap-3 sm:flex">
                  <select
                    value={selectedIndustry}
                    onChange={(event) => setSelectedIndustry(event.target.value)}
                    aria-label="Filter by industry"
                    className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">All industries</option>
                    {industries.map((industry) => (
                      <option key={industry} value={industry}>
                        {industry}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedType}
                    onChange={(event) => setSelectedType(event.target.value as NetworkConnectionType | '')}
                    aria-label="Filter by connection type"
                    className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">All connection types</option>
                    {connectionTypes.map((type) => (
                      <option key={type} value={type}>
                        {connectionTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                {categoryFilters.map((filter) => (
                  <Button
                    key={filter.key}
                    variant={categoryFilter === filter.key ? 'default' : 'outline'}
                    onClick={() => setCategoryFilter(filter.key)}
                    className={
                      categoryFilter === filter.key
                        ? 'h-9 shrink-0 bg-slate-900 text-white hover:bg-slate-800'
                        : 'h-9 shrink-0 border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }
                  >
                    {filter.label}
                  </Button>
                ))}
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters} className="h-9 shrink-0 gap-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden sm:hidden"
                >
                  <div className="mt-3 grid gap-3">
                    <select
                      value={selectedIndustry}
                      onChange={(event) => setSelectedIndustry(event.target.value)}
                      aria-label="Filter by industry"
                      className="h-11 rounded-lg border border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none"
                    >
                      <option value="">All industries</option>
                      {industries.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedType}
                      onChange={(event) => setSelectedType(event.target.value as NetworkConnectionType | '')}
                      aria-label="Filter by connection type"
                      className="h-11 rounded-lg border border-amber-200 bg-white px-3 text-sm text-gray-700 focus:outline-none"
                    >
                      <option value="">All connection types</option>
                      {connectionTypes.map((type) => (
                        <option key={type} value={type}>
                          {connectionTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span className="rounded-full bg-gray-100 px-2.5 py-1">Showing {visibleProfiles.length}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1">Professionals: {counts.professionals}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1">Alumni: {counts.alumni}</span>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="py-20">
            <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                <p className="mt-3 text-sm text-slate-500">Loading network profiles...</p>
              </div>
            </div>
          </section>
        ) : error ? (
          <section className="py-20">
            <div className="container mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
              <p className="mb-4 text-red-400">{error}</p>
              <Button onClick={() => window.location.reload()} className="bg-amber-500 text-white hover:bg-amber-600">Try Again</Button>
            </div>
          </section>
        ) : (
          <>
            {featuredProfiles.length > 0 && !hasActiveFilters && (
              <section className="py-10">
                <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                  <div className="mb-7 flex items-center justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          <Star className="h-3 w-3 fill-amber-500" />
                          Featured
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900">Highlighted Contributors</h3>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500">
                      {counts.featured}
                    </span>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {featuredProfiles.slice(0, 3).map((profile, index) => (
                      <FeaturedCard
                        key={profile.id}
                        profile={profile}
                        index={index}
                        isMobile={isMobile}
                        shouldReduceMotion={shouldReduceMotion}
                        prefersReducedMotion={prefersReducedMotion}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {categoryFilter !== 'ALUMNI' && (
              <section className="py-12">
                <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                  <SectionHeader
                    icon={Briefcase}
                    iconClassName="from-amber-500 to-orange-500"
                    title="Professionals Supporting the Community"
                    description="Leaders and collaborators who guide students with practical insight."
                    count={counts.professionals}
                  />

                  {industryProfessionals.length === 0 ? (
                    <EmptyState
                      hasFilters={hasActiveFilters}
                      message="No professionals match your current filters."
                      fallback="Professional registrations are open. We would be grateful for your participation."
                      onClear={clearFilters}
                    />
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {industryProfessionals.map((profile, index) => (
                        <MemberCard
                          key={profile.id}
                          profile={profile}
                          index={index}
                          tone="professional"
                          isMobile={isMobile}
                          shouldReduceMotion={shouldReduceMotion}
                          prefersReducedMotion={prefersReducedMotion}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {categoryFilter !== 'PROFESSIONAL' && (
              <section className="py-12">
                <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                  <SectionHeader
                    icon={GraduationCap}
                    iconClassName="from-teal-500 to-cyan-500"
                    title="Alumni Giving Back"
                    description="Alumni who continue to support students with guidance and opportunity."
                    count={counts.alumni}
                  />

                  {alumni.length === 0 ? (
                    <EmptyState
                      hasFilters={hasActiveFilters}
                      message="No alumni match your current filters."
                      fallback="Alumni registrations are open. We'd be honored to have your guidance."
                      onClear={clearFilters}
                    />
                  ) : (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                      {alumni.map((profile, index) => (
                        <MemberCard
                          key={profile.id}
                          profile={profile}
                          index={index}
                          tone="alumni"
                          isMobile={isMobile}
                          shouldReduceMotion={shouldReduceMotion}
                          prefersReducedMotion={prefersReducedMotion}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        {!isNetworkMember && (
          <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100/50 py-12 sm:py-14 border-t border-amber-100/50">
            {/* Subtle decorative elements */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -right-32 top-10 h-64 w-64 rounded-full bg-amber-200/20 blur-[100px]" />
              <div className="absolute -left-32 bottom-10 h-64 w-64 rounded-full bg-orange-200/20 blur-[100px]" />
            </div>

            <div className="container relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mx-auto max-w-3xl text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  viewport={{ once: true }}
                  className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200 bg-gradient-to-br from-amber-100 to-orange-100 shadow-sm"
                >
                  <Rocket className="h-6 w-6 text-amber-600" />
                </motion.div>

                <h3 className="mb-3 text-2xl font-bold leading-tight text-gray-900 sm:text-3xl">
                  Join Our Network
                </h3>

                <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">
                  Are you an alumnus or industry professional? Register to get your own profile and help students through mentorship and opportunities.
                </p>

                <div className="flex flex-col justify-center gap-2.5 sm:flex-row">
                  <Button
                    size="lg"
                    className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/30"
                    onClick={() => handleJoinNetwork('professional')}
                    disabled={joiningNetwork}
                  >
                    {joiningNetwork ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Briefcase className="mr-2 h-4 w-4" />}
                    Register as Professional
                  </Button>
                  <Button
                    size="lg"
                    className="rounded-lg border-2 border-amber-300 bg-white px-6 py-2.5 text-sm font-semibold text-amber-700 hover:border-amber-400 hover:bg-amber-50"
                    onClick={() => handleJoinNetwork('alumni')}
                    disabled={joiningNetwork}
                  >
                    {joiningNetwork ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
                    Register as Alumni
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}

function SectionHeader({
  icon: Icon,
  iconClassName,
  title,
  description,
  count,
}: {
  icon: typeof Briefcase;
  iconClassName: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mb-7"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={`inline-flex rounded-xl bg-gradient-to-br p-2.5 text-white ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 sm:text-3xl">{title}</h3>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-zinc-900 dark:text-zinc-400">{count}</span>
      </div>
      <p className="max-w-2xl text-sm text-gray-600 dark:text-zinc-400 sm:text-base">{description}</p>
    </motion.div>
  );
}

function EmptyState({
  hasFilters,
  message,
  fallback,
  onClear,
}: {
  hasFilters: boolean;
  message: string;
  fallback: string;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-[#0d0f14] dark:shadow-black/30"
    >
      {hasFilters ? (
        <>
          <p className="text-gray-500 dark:text-zinc-400">{message}</p>
          <Button variant="outline" onClick={onClear} className="mt-4 border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900">
            Clear Filters
          </Button>
        </>
      ) : (
        <p className="text-gray-500 dark:text-zinc-400">{fallback}</p>
      )}
    </motion.div>
  );
}

