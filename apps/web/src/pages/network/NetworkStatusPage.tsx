import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type NetworkProfile } from '@/lib/api';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  ArrowRight,
  User,
  Building2,
  Briefcase,
  LogOut,
} from 'lucide-react';

export default function NetworkStatusPage() {
  const { user, token, isLoading: authLoading, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !settingsLoading) {
      if (!user || !token) {
        navigate('/signin');
        return;
      }
      if (settings?.showNetwork === false) {
        navigate('/');
        return;
      }
    }
  }, [authLoading, settingsLoading, user, token, settings, navigate]);

  useEffect(() => {
    if (!token) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        const result = await api.getMyNetworkProfile(token);
        const data = result.data || result;
        if ('hasProfile' in data) {
          setHasProfile(data.hasProfile);
          setProfile(data.data || null);
        } else {
          // Direct profile response
          setHasProfile(true);
          setProfile(data as unknown as NetworkProfile);
        }
      } catch (err: any) {
        // 404 means no profile yet
        if (err?.status === 404 || err?.message?.includes('404')) {
          setHasProfile(false);
          setProfile(null);
        } else {
          console.error('Failed to load network profile');
          setHasProfile(false);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  if (authLoading || settingsLoading || loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  // If no profile yet, redirect to onboarding
  if (!hasProfile || !profile) {
    return (
      <Layout>
        <SEO title="Network Status" />
        <section className="min-h-[60vh] flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 py-20">
          <motion.div
            className="max-w-md mx-auto text-center bg-white p-8 rounded-2xl shadow-lg border border-amber-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Complete Your Profile</h2>
            <p className="text-gray-500 mb-6">
              You haven't submitted your network profile yet. Complete the onboarding to get featured on our network page.
            </p>
            <Button
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              onClick={() => navigate('/network/onboarding')}
            >
              Start Onboarding
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </section>
      </Layout>
    );
  }

  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-700',
      title: 'Profile Under Review',
      description: 'Your profile has been submitted and is being reviewed by our admin team. You\'ll be notified once it\'s verified.',
    },
    VERIFIED: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
      badge: 'bg-green-100 text-green-700',
      title: 'Profile Verified',
      description: 'Your profile is live and visible on our public network page. Thank you for being part of the code.scriet network!',
    },
    REJECTED: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      badge: 'bg-red-100 text-red-700',
      title: 'Profile Not Approved',
      description: 'Unfortunately, your profile was not approved at this time. You can update your profile and resubmit for review.',
    },
  };

  const status = statusConfig[profile.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;

  return (
    <Layout>
      <SEO title="Network Status" />

      <section className="min-h-[60vh] bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 py-16 sm:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            className="max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Status Card */}
            <div className={`${status.bg} border ${status.border} rounded-2xl p-8 mb-6 text-center`}>
              <StatusIcon className={`h-16 w-16 ${status.color} mx-auto mb-4`} />
              <Badge className={`${status.badge} mb-3`}>{profile.status}</Badge>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{status.title}</h1>
              <p className="text-gray-600 max-w-md mx-auto">{status.description}</p>
            </div>

            {/* Profile Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Profile</h2>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="font-medium text-gray-900">{profile.fullName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500">Designation</p>
                    <p className="font-medium text-gray-900">{profile.designation}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500">Company</p>
                    <p className="font-medium text-gray-900">{profile.company}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                {profile.status === 'VERIFIED' && (
                  <>
                    <Link to={`/network/${profile.slug || profile.id}`}>
                      <Button variant="outline" className="w-full sm:w-auto border-green-200 text-green-700 hover:bg-green-50">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Public Profile
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={() => navigate('/network/onboarding')}
                    >
                      Edit Profile
                    </Button>
                  </>
                )}

                {(profile.status === 'REJECTED' || profile.status === 'PENDING') && (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => navigate('/network/onboarding')}
                  >
                    Edit Profile
                  </Button>
                )}

                <Button
                  variant="ghost"
                  className="w-full sm:w-auto text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
