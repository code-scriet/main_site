import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type NetworkProfileInput, type NetworkConnectionType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  User,
  Building2,
  Briefcase,
  Globe,
  Linkedin,
  Twitter,
  Github,
  FileText,
  Calendar,
  AlertCircle,
  Phone,
  ShieldCheck,
  GraduationCap,
  MapPin,
  Award,
  BookOpen,
  Rocket,
  Users2,
  Sparkles,
  Mic,
  MessageSquare,
  Trophy,
  Handshake,
  Star,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { useMotionConfig } from '@/hooks/useMotionConfig';

const connectionTypes: { value: NetworkConnectionType; label: string; description: string }[] = [
  { value: 'GUEST_SPEAKER', label: 'Guest Speaker', description: 'Delivered a talk or session' },
  { value: 'GMEET_SESSION', label: 'Session Host', description: 'Hosted an online session' },
  { value: 'EVENT_JUDGE', label: 'Event Judge', description: 'Judged hackathons or competitions' },
  { value: 'MENTOR', label: 'Mentor', description: 'Mentoring club members' },
  { value: 'INDUSTRY_PARTNER', label: 'Industry Partner', description: 'Corporate collaboration' },
  { value: 'ALUMNI', label: 'Alumni', description: 'Former member or graduate' },
  { value: 'OTHER', label: 'Collaborator', description: 'Other collaboration format' },
];

const connectionTypeIcons: Record<NetworkConnectionType, typeof Building2> = {
  GUEST_SPEAKER: Mic,
  GMEET_SESSION: MessageSquare,
  EVENT_JUDGE: Trophy,
  MENTOR: Handshake,
  INDUSTRY_PARTNER: Building2,
  ALUMNI: GraduationCap,
  OTHER: Star,
};

const industries = [
  'Technology',
  'Finance',
  'Healthcare',
  'Education',
  'Consulting',
  'E-commerce',
  'Gaming',
  'Cybersecurity',
  'AI/ML',
  'Cloud Computing',
  'Data Science',
  'DevOps',
  'Product Management',
  'Design',
  'Other',
];

const degrees = ['B.Tech', 'M.Tech', 'MCA', 'BCA', 'B.Sc', 'M.Sc', 'MBA', 'Ph.D', 'Other'];

const branches = [
  'Computer Science & Engineering',
  'Information Technology',
  'Electronics & Communication',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Biotechnology',
  'Data Science',
  'Artificial Intelligence',
  'Other',
];

const currentYear = new Date().getFullYear();

const parseYearInput = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
};

const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    designation: z.string().trim().min(2, 'Designation is required').max(100),
    company: z.string().trim().min(1, 'Company/Organization is required').max(100),
    industry: z.string().min(1, 'Please select an industry'),
    bio: z.string().max(2000, 'Bio must be under 2000 characters').optional(),
    phone: z.string().max(20, 'Phone number is too long').optional(),
    profilePhoto: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    linkedinUsername: z.string().max(100).optional(),
    twitterUsername: z.string().max(100).optional(),
    githubUsername: z.string().max(100).optional(),
    personalWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    connectionType: z.enum([
      'GUEST_SPEAKER',
      'GMEET_SESSION',
      'EVENT_JUDGE',
      'MENTOR',
      'INDUSTRY_PARTNER',
      'ALUMNI',
      'OTHER',
    ]),
    connectionNote: z.string().max(1000).optional(),
    connectedSince: z.number().min(2000).max(2100).optional().nullable(),
    passoutYear: z.number().min(1990).max(2100).optional().nullable(),
    degree: z.string().max(50).optional(),
    branch: z.string().max(100).optional(),
    rollNumber: z.string().max(50).optional(),
    achievements: z.string().max(2000).optional(),
    currentLocation: z.string().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.connectionType === 'ALUMNI' && !data.passoutYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['passoutYear'],
        message: 'Passout year is required for alumni profiles',
      });
    }
  });

type ProfileFormData = z.infer<typeof profileSchema>;

const normalizeNetworkType = (value: string | null | undefined): 'professional' | 'alumni' | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return normalized === 'professional' || normalized === 'alumni' ? normalized : undefined;
};

const getNetworkTypeFromIntentStorage = (): 'professional' | 'alumni' | undefined => {
  try {
    const raw = localStorage.getItem('network_intent');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { intent?: string; type?: string };
    if (parsed.intent !== 'network') return undefined;
    return normalizeNetworkType(parsed.type);
  } catch {
    return undefined;
  }
};

const cleanValue = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const cleanUsername = (value?: string): string | undefined => {
  const trimmed = value?.trim().replace(/^@/, '');
  return trimmed ? trimmed : undefined;
};

export default function NetworkOnboarding() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const networkTypeFromUrl = normalizeNetworkType(searchParams.get('type'));
  const networkTypeFromStorage = normalizeNetworkType(localStorage.getItem('network_onboarding_type'));
  const networkTypeFromIntentStorage = getNetworkTypeFromIntentStorage();
  const resolvedNetworkType = networkTypeFromUrl || networkTypeFromStorage || networkTypeFromIntentStorage;
  const defaultConnectionType: NetworkConnectionType =
    resolvedNetworkType === 'alumni' ? 'ALUMNI' : 'INDUSTRY_PARTNER';

  const [existingProfile, setExistingProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: '',
      designation: '',
      company: '',
      industry: '',
      bio: '',
      connectionType: defaultConnectionType,
    },
  });

  const selectedConnectionType = watch('connectionType');
  const bioValue = watch('bio') ?? '';
  const isAlumniIntent = !existingProfile && resolvedNetworkType === 'alumni';
  const isProfessionalIntent = !existingProfile && resolvedNetworkType === 'professional';

  const visibleConnectionTypes = useMemo(() => {
    if (isAlumniIntent) {
      return connectionTypes.filter((type) => type.value === 'ALUMNI');
    }
    if (isProfessionalIntent) {
      return connectionTypes.filter((type) => type.value !== 'ALUMNI');
    }
    return connectionTypes;
  }, [isAlumniIntent, isProfessionalIntent]);

  useEffect(() => {
    if (existingProfile) {
      localStorage.removeItem('network_onboarding_type');
      localStorage.removeItem('network_intent');
      return;
    }

    if (resolvedNetworkType) {
      localStorage.setItem('network_onboarding_type', resolvedNetworkType);
    }

    if (resolvedNetworkType === 'alumni') {
      setValue('connectionType', 'ALUMNI', { shouldDirty: false, shouldTouch: false });
      return;
    }

    if (resolvedNetworkType === 'professional' && selectedConnectionType === 'ALUMNI') {
      setValue('connectionType', 'INDUSTRY_PARTNER', { shouldDirty: false, shouldTouch: false });
      return;
    }

    if (!selectedConnectionType) {
      setValue('connectionType', defaultConnectionType, { shouldDirty: false, shouldTouch: false });
    }
  }, [resolvedNetworkType, existingProfile, setValue, selectedConnectionType, defaultConnectionType]);

  useEffect(() => {
    if (!authLoading && !settingsLoading) {
      if (!user || !token) {
        navigate('/signin');
        return;
      }
      if (settings?.showNetwork === false) {
        navigate('/');
      }
    }
  }, [authLoading, settingsLoading, user, token, settings?.showNetwork, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) return;
      try {
        setLoadingProfile(true);
        setProfileLoadError(null);
        const response = await api.getMyNetworkProfile(token);
        if (response.hasProfile && response.data) {
          setExistingProfile(response.data);
          const profile = response.data;
          setValue('fullName', profile.fullName);
          setValue('designation', profile.designation);
          setValue('company', profile.company);
          setValue('industry', profile.industry);
          setValue('bio', profile.bio || '');
          setValue('profilePhoto', profile.profilePhoto || '');
          setValue('linkedinUsername', profile.linkedinUsername || '');
          setValue('twitterUsername', profile.twitterUsername || '');
          setValue('githubUsername', profile.githubUsername || '');
          setValue('personalWebsite', profile.personalWebsite || '');
          setValue('phone', profile.phone || '');
          setValue('connectionType', profile.connectionType);
          setValue('connectionNote', profile.connectionNote || '');
          setValue('connectedSince', profile.connectedSince || null);
          setValue('passoutYear', profile.passoutYear || null);
          setValue('degree', profile.degree || '');
          setValue('branch', profile.branch || '');
          setValue('rollNumber', profile.rollNumber || '');
          setValue('achievements', profile.achievements || '');
          setValue('currentLocation', profile.currentLocation || '');
        } else if (user?.name) {
          setValue('fullName', user.name);
        }
      } catch (err) {
        setProfileLoadError(
          err instanceof Error ? err.message : 'We could not load your existing network profile right now.'
        );
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [token, user, setValue]);

  const onSubmit = async (data: ProfileFormData) => {
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const isAlumniProfile = data.connectionType === 'ALUMNI';

      const input: NetworkProfileInput = {
        fullName: data.fullName.trim(),
        designation: data.designation.trim(),
        company: data.company.trim(),
        industry: data.industry,
        bio: cleanValue(data.bio),
        profilePhoto: cleanValue(data.profilePhoto),
        linkedinUsername: cleanUsername(data.linkedinUsername),
        twitterUsername: cleanUsername(data.twitterUsername),
        githubUsername: cleanUsername(data.githubUsername),
        personalWebsite: cleanValue(data.personalWebsite),
        phone: cleanValue(data.phone),
        connectionType: data.connectionType,
        connectionNote: cleanValue(data.connectionNote),
        connectedSince: data.connectedSince ?? undefined,
        passoutYear: isAlumniProfile ? data.passoutYear ?? undefined : undefined,
        degree: isAlumniProfile ? cleanValue(data.degree) : undefined,
        branch: isAlumniProfile ? cleanValue(data.branch) : undefined,
        rollNumber: isAlumniProfile ? cleanValue(data.rollNumber) : undefined,
        achievements: isAlumniProfile ? cleanValue(data.achievements) : undefined,
        currentLocation: isAlumniProfile ? cleanValue(data.currentLocation) : undefined,
      };

      if (existingProfile) {
        await api.updateNetworkProfile(input, token);
      } else {
        await api.createNetworkProfile(input, token);
      }

      localStorage.removeItem('network_onboarding_type');
      localStorage.removeItem('network_intent');
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || settingsLoading || loadingProfile) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (submitSuccess) {
    return (
      <Layout>
        <SEO title="Profile Submitted" url="/network/onboarding" noIndex={true} />
        <div className="min-h-screen flex items-center justify-center px-4 py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md text-center"
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="mb-3 text-2xl font-bold text-gray-900">
              {existingProfile ? 'Profile Updated!' : 'Profile Submitted!'}
            </h1>
            <p className="mb-6 text-gray-600">
              {existingProfile
                ? 'Your profile has been updated and will be reviewed by our team.'
                : 'Thank you for joining our network. Your profile is pending verification and will be reviewed shortly.'}
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => navigate('/network')}>View Network</Button>
              <Button variant="outline" onClick={() => setSubmitSuccess(false)}>
                Edit Profile
              </Button>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  const StatusBadge = () => {
    if (!existingProfile) return null;
    const status = existingProfile.status;
    if (status === 'VERIFIED') {
      return (
        <Badge className="border-green-200 bg-green-100 text-green-700">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
        </Badge>
      );
    }
    if (status === 'PENDING') {
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-700">
          <Clock className="mr-1 h-3 w-3" /> Pending Review
        </Badge>
      );
    }
    if (status === 'REJECTED') {
      return (
        <Badge className="border-red-200 bg-red-100 text-red-700">
          <XCircle className="mr-1 h-3 w-3" /> Rejected
        </Badge>
      );
    }
    return null;
  };

  return (
    <Layout>
      <SEO
        title="Network Onboarding"
        description="Submit your professional profile to join the code.scriet network."
        url="/network/onboarding"
        noIndex={true}
      />

      <div className="relative min-h-screen bg-[#f4f6fb] px-4 py-8 sm:py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className={`absolute -right-20 top-0 rounded-full bg-amber-300/20 ${
              isMobile ? 'h-[220px] w-[220px] blur-2xl' : 'h-[340px] w-[340px] blur-3xl'
            }`}
          />
          <div
            className={`absolute -left-16 top-80 rounded-full bg-cyan-300/20 ${
              isMobile ? 'h-[200px] w-[200px] blur-2xl' : 'h-[320px] w-[320px] blur-3xl'
            }`}
          />
        </div>

        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            className="mb-6 rounded-3xl border border-white/60 bg-white/92 p-6 shadow-xl backdrop-blur sm:p-7"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-amber-200 bg-amber-100 text-amber-800">
                <Rocket className="mr-1 h-3.5 w-3.5" />
                {existingProfile ? 'Update Mode' : 'New Network Application'}
              </Badge>
              {resolvedNetworkType && !existingProfile && (
                <Badge variant="outline" className={resolvedNetworkType === 'alumni' ? 'border-teal-300 bg-teal-50 text-teal-800' : 'border-indigo-300 bg-indigo-50 text-indigo-800'}>
                  <Users2 className="mr-1 h-3.5 w-3.5" />
                  Entry Path: {resolvedNetworkType === 'alumni' ? 'Alumni' : 'Professional'}
                </Badge>
              )}
              {existingProfile && <StatusBadge />}
            </div>

            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {existingProfile ? 'Refine Your Public Profile' : 'Build Your Network Profile'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 sm:text-base">
              Structure your profile so students can quickly understand your background, collaboration style, and impact.
              The card you submit here is what appears on the public network page after verification.
            </p>
          </motion.div>

          {existingProfile?.status === 'REJECTED' && existingProfile.rejectionReason && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <p className="font-medium text-red-800">Your profile was not approved</p>
                <p className="mt-1 text-sm text-red-600">{existingProfile.rejectionReason}</p>
                <p className="mt-2 text-sm text-red-600">
                  Please update your profile with the required corrections and submit again.
                </p>
              </div>
            </motion.div>
          )}

          {profileLoadError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">Couldn&apos;t load your existing draft</p>
                <p className="mt-1 text-sm text-amber-700">{profileLoadError}</p>
              </div>
            </motion.div>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
            <Card className="border-white/70 bg-white/95 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <User className="h-5 w-5 text-amber-600" />
                  Professional Information
                </CardTitle>
                <CardDescription>
                  Complete every section with crisp details. Better quality entries get faster review turnaround.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <section className="space-y-4 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/80 to-orange-50/60 p-5">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-amber-900">
                      <Sparkles className="h-4.5 w-4.5" />
                      Identity & Role
                    </h3>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name *</Label>
                        <Input
                          id="fullName"
                          placeholder="John Doe"
                          {...register('fullName')}
                          className={errors.fullName ? 'border-red-500' : ''}
                        />
                        {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="designation">Current Role *</Label>
                        <Input
                          id="designation"
                          placeholder="Senior Software Engineer"
                          {...register('designation')}
                          className={errors.designation ? 'border-red-500' : ''}
                        />
                        {errors.designation && <p className="text-xs text-red-500">{errors.designation.message}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="company" className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          Company / Organization *
                        </Label>
                        <Input
                          id="company"
                          placeholder="Google, Microsoft, Startup, etc."
                          {...register('company')}
                          className={errors.company ? 'border-red-500' : ''}
                        />
                        {errors.company && <p className="text-xs text-red-500">{errors.company.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industry" className="flex items-center gap-1">
                          <Briefcase className="h-4 w-4" />
                          Industry *
                        </Label>
                        <select
                          id="industry"
                          {...register('industry')}
                          className={`w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                            errors.industry ? 'border-red-500' : 'border-gray-200'
                          }`}
                        >
                          <option value="">Select Industry</option>
                          {industries.map((ind) => (
                            <option key={ind} value={ind}>
                              {ind}
                            </option>
                          ))}
                        </select>
                        {errors.industry && <p className="text-xs text-red-500">{errors.industry.message}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio" className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        Profile Summary
                      </Label>
                      <Textarea
                        id="bio"
                        placeholder="Briefly describe your expertise, focus area, and what you enjoy mentoring or speaking about."
                        rows={4}
                        {...register('bio')}
                        className={errors.bio ? 'border-red-500' : ''}
                      />
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Keep it concrete: domain, years, focus areas, and what you can help with.</span>
                        <span aria-live="polite">{bioValue.length}/2000</span>
                      </div>
                      {errors.bio && <p className="text-xs text-red-500">{errors.bio.message}</p>}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="profilePhoto">Profile Photo URL</Label>
                        <Input
                          id="profilePhoto"
                          placeholder="https://example.com/photo.jpg"
                          {...register('profilePhoto')}
                          className={errors.profilePhoto ? 'border-red-500' : ''}
                        />
                        {errors.profilePhoto && <p className="text-xs text-red-500">{errors.profilePhoto.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone" className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          Phone Number
                        </Label>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="+91 9876543210"
                          {...register('phone')}
                          className={errors.phone ? 'border-red-500' : ''}
                        />
                        {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-sky-50/60 p-5">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-indigo-900">
                      <Rocket className="h-4.5 w-4.5" />
                      Connection with code.scriet
                    </h3>

                    {(isAlumniIntent || isProfessionalIntent) && (
                      <div
                        className={`rounded-xl border p-3 text-sm ${
                          isAlumniIntent
                            ? 'border-teal-200 bg-teal-50 text-teal-800'
                            : 'border-indigo-200 bg-indigo-50 text-indigo-800'
                        }`}
                      >
                        {isAlumniIntent
                          ? 'You started from the Alumni path, so this onboarding is set to Alumni.'
                          : 'You started from the Professional path. Alumni type is hidden here to prevent mis-routing.'}
                      </div>
                    )}

                    <div className="space-y-3">
                      <Label>How did you connect with code.scriet? *</Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {visibleConnectionTypes.map((type) => {
                          const Icon = connectionTypeIcons[type.value];
                          return (
                            <label
                              key={type.value}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                                selectedConnectionType === type.value
                                  ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                                  : 'border-gray-200 bg-white hover:border-indigo-200'
                              }`}
                            >
                              <input
                                type="radio"
                                value={type.value}
                                {...register('connectionType')}
                                className="sr-only"
                              />
                              <div className="mt-0.5 rounded-lg bg-white p-1.5 text-indigo-700 shadow-sm">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{type.label}</p>
                                <p className="text-xs text-gray-500">{type.description}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="connectionNote">Connection Details</Label>
                      <Textarea
                        id="connectionNote"
                        placeholder="Mention event names, collaboration context, topics covered, or mentoring contributions."
                        rows={3}
                        {...register('connectionNote')}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="connectedSince" className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Connected Since (Year)
                      </Label>
                      <Input
                        id="connectedSince"
                        type="number"
                        placeholder="2024"
                        min={2000}
                        max={currentYear}
                        {...register('connectedSince', { setValueAs: parseYearInput })}
                      />
                      {errors.connectedSince && (
                        <p className="text-xs text-red-500">{errors.connectedSince.message}</p>
                      )}
                    </div>
                  </section>

                  <AnimatePresence>
                    {selectedConnectionType === 'ALUMNI' && (
                      <motion.section
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-5"
                      >
                        <div className="mb-4 flex items-center gap-2">
                          <GraduationCap className="h-5 w-5 text-teal-700" />
                          <h3 className="text-base font-semibold text-teal-900">Alumni Information</h3>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="passoutYear" className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-teal-700" />
                              Passout Year *
                            </Label>
                            <Input
                              id="passoutYear"
                              type="number"
                              placeholder="2023"
                              min={1990}
                              max={currentYear}
                              {...register('passoutYear', { setValueAs: parseYearInput })}
                              className={errors.passoutYear ? 'border-red-500' : ''}
                            />
                            {errors.passoutYear && (
                              <p className="text-xs text-red-500">{errors.passoutYear.message}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="degree" className="flex items-center gap-1">
                              <BookOpen className="h-4 w-4 text-teal-700" />
                              Degree
                            </Label>
                            <select
                              id="degree"
                              {...register('degree')}
                              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="">Select Degree</option>
                              {degrees.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="branch">Branch / Specialization</Label>
                            <select
                              id="branch"
                              {...register('branch')}
                              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              <option value="">Select Branch</option>
                              {branches.map((b) => (
                                <option key={b} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="rollNumber">Roll Number</Label>
                            <Input id="rollNumber" placeholder="e.g., 1901CS01" {...register('rollNumber')} />
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <Label htmlFor="currentLocation" className="flex items-center gap-1">
                            <MapPin className="h-4 w-4 text-teal-700" />
                            Current Location
                          </Label>
                          <Input
                            id="currentLocation"
                            placeholder="e.g., Bangalore, India"
                            {...register('currentLocation')}
                          />
                        </div>

                        <div className="mt-4 space-y-2">
                          <Label htmlFor="achievements" className="flex items-center gap-1">
                            <Award className="h-4 w-4 text-teal-700" />
                            Notable Achievements
                          </Label>
                          <Textarea
                            id="achievements"
                            placeholder="Awards, publications, promotions, startup milestones, or major outcomes."
                            rows={3}
                            {...register('achievements')}
                          />
                        </div>
                      </motion.section>
                    )}
                  </AnimatePresence>

                  <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <Globe className="h-4.5 w-4.5 text-slate-700" />
                      Social & Public Links
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="linkedinUsername" className="flex items-center gap-1 text-sm">
                          <Linkedin className="h-4 w-4 text-blue-600" /> LinkedIn Username
                        </Label>
                        <Input id="linkedinUsername" placeholder="johndoe" {...register('linkedinUsername')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twitterUsername" className="flex items-center gap-1 text-sm">
                          <Twitter className="h-4 w-4 text-sky-500" /> Twitter Username
                        </Label>
                        <Input id="twitterUsername" placeholder="johndoe" {...register('twitterUsername')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="githubUsername" className="flex items-center gap-1 text-sm">
                          <Github className="h-4 w-4 text-gray-800" /> GitHub Username
                        </Label>
                        <Input id="githubUsername" placeholder="johndoe" {...register('githubUsername')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="personalWebsite" className="flex items-center gap-1 text-sm">
                          <Globe className="h-4 w-4 text-green-600" /> Personal Website
                        </Label>
                        <Input
                          id="personalWebsite"
                          placeholder="https://johndoe.com"
                          {...register('personalWebsite')}
                          className={errors.personalWebsite ? 'border-red-500' : ''}
                        />
                        {errors.personalWebsite && (
                          <p className="text-xs text-red-500">{errors.personalWebsite.message}</p>
                        )}
                      </div>
                    </div>
                  </section>

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-blue-600" />
                      <p className="text-xs leading-relaxed text-blue-700">
                        Your phone number is not shown publicly. It is used only by trusted club members for coordination and
                        verification.
                      </p>
                    </div>
                  </div>

                  {submitError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                      {submitError}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => navigate('/network')}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                    >
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {existingProfile ? 'Update Profile' : 'Submit for Review'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-5 lg:sticky lg:top-24">
              <Card className="border-white/70 bg-white/92 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Field Quality Checklist</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Use a current role and exact organization name.
                  </div>
                  <div className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Keep summary concrete: domain, years, focus areas, outcomes.
                  </div>
                  <div className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Mention how you collaborated with the club.
                  </div>
                  <div className="flex items-start gap-2 text-gray-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    Add at least one public link (LinkedIn/GitHub/Website).
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-white/92 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Public Profile Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-700">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Track</p>
                    <p className="font-semibold text-gray-900">
                      {selectedConnectionType === 'ALUMNI' ? 'Alumni' : 'Professional / Industry'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Shows Publicly</p>
                    <p>Name, role, company, summary, connection type, and social links.</p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Hidden Publicly</p>
                    <p>Phone number and internal review metadata.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/70 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-amber-900">Built by Students</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-amber-800">
                  This network experience is crafted by code.scriet B.Tech students to present alumni and professionals with
                  clean, high-signal profiles.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
